/**
 * Pure 3D Starling Murmuration Canvas Controller
 *
 * - 10,500 crisp micro-dot particles on desktop (> 860px), 4,500 on mobile (<= 860px)
 * - Flat Float32Array / Uint8Array buffers with zero per-frame allocations
 * - Pre-rendered high-DPI offscreen circular dot sprite atlas (20 opacity levels x 4 size steps)
 *   blitted 1:1 in physical pixels via O(N) depth-bucketed linked-list drawImage calls
 * - Solid background clear every frame (zero motion tails)
 * - 4 overlapping sub-flock ribbons driven by 128-node periodic 3D flight spines
 *   on an exact integer-harmonic 36-second seamless loop
 * - Soft ellipsoidal 3D containment + outer 13.5% margin alpha fade on all 4 edges
 * - Fixed canonical 3D camera framing + wake-only pointer & touch scattering
 * - Synchronized with data-theme="dark" | "light"
 */
;(function () {
  const win = window as unknown as { __murmurationInitialized?: boolean }
  if (win.__murmurationInitialized) return

  function startMurmuration() {
    const maybeCanvas = document.getElementById("swarmCanvas") as HTMLCanvasElement | null
    if (!maybeCanvas) return
    const canvas = maybeCanvas
    const maybeCtx = canvas.getContext("2d", { alpha: false })
    if (!maybeCtx) return
    const ctx = maybeCtx

    win.__murmurationInitialized = true

    const TWO_PI = Math.PI * 2
    const PARTICLE_COUNT = window.innerWidth <= 860 ? 4500 : 10500

    const LOOP_PERIOD = 36.0
    const OMEGA = TWO_PI / LOOP_PERIOD

    const FLOCK_COUNT = 4
    const SPINE_SAMPLES = 128
    const SPINE_MASK = SPINE_SAMPLES - 1
    const SPINE_TOTAL = FLOCK_COUNT * SPINE_SAMPLES

    const ALPHA_LEVELS = 20
    const SIZE_LEVELS = 4
    const SIZE_RADII_CSS = new Float32Array([0.42, 0.56, 0.7, 0.84])
    const CELL_CSS = 6

    const atlasCanvas = document.createElement("canvas")
    const atlasCtx = atlasCanvas.getContext("2d")!
    let atlasDpr = 0
    let atlasThemeIsDark: boolean | null = null
    let cellPx = 6
    let halfCellPx = 3

    function getThemeIsDark(): boolean {
      return document.documentElement.getAttribute("data-theme") !== "light"
    }

    let isDarkMode = getThemeIsDark()
    let bgHex = isDarkMode ? "#1e1e1e" : "#ffffff"

    function buildSpriteAtlas(targetDpr: number, dark: boolean) {
      if (atlasDpr === targetDpr && atlasThemeIsDark === dark) return
      atlasDpr = targetDpr
      atlasThemeIsDark = dark
      cellPx = Math.max(4, Math.round(CELL_CSS * atlasDpr))
      halfCellPx = cellPx * 0.5

      atlasCanvas.width = ALPHA_LEVELS * cellPx
      atlasCanvas.height = SIZE_LEVELS * cellPx
      atlasCtx.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height)

      const dotRgb = dark ? "226, 228, 232" : "10, 10, 10"

      for (let s = 0; s < SIZE_LEVELS; s++) {
        const rPx = SIZE_RADII_CSS[s] * atlasDpr
        const cy = s * cellPx + halfCellPx

        for (let a = 0; a < ALPHA_LEVELS; a++) {
          const alpha = 0.04 + (a / (ALPHA_LEVELS - 1)) * 0.9
          const cx = a * cellPx + halfCellPx

          atlasCtx.fillStyle = `rgba(${dotRgb}, ${alpha.toFixed(3)})`
          atlasCtx.beginPath()
          atlasCtx.arc(cx, cy, rPx, 0, TWO_PI)
          atlasCtx.fill()
        }
      }
    }

    let width = 1
    let height = 1
    let physWidth = 1
    let physHeight = 1
    let dpr = 1

    function syncTheme() {
      isDarkMode = getThemeIsDark()
      bgHex = isDarkMode ? "#1e1e1e" : "#ffffff"
      buildSpriteAtlas(dpr, isDarkMode)
    }

    function resize() {
      const parent = canvas.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      physWidth = Math.round(width * dpr)
      physHeight = Math.round(height * dpr)
      canvas.width = physWidth
      canvas.height = physHeight

      buildSpriteAtlas(dpr, isDarkMode)

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = bgHex
      ctx.fillRect(0, 0, physWidth, physHeight)
    }

    if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
      const ro = new ResizeObserver(() => resize())
      ro.observe(canvas.parentElement)
    }
    window.addEventListener("resize", resize)

    // Observe data-theme changes on <html>
    const themeObserver = new MutationObserver(() => syncTheme())
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    })
    document.addEventListener("themechange", syncTheme)

    resize()

    function smootherstep(t: number): number {
      const x = t < 0 ? 0 : t > 1 ? 1 : t
      return x * x * x * (x * (x * 6 - 15) + 10)
    }

    const spX = new Float32Array(SPINE_TOTAL)
    const spY = new Float32Array(SPINE_TOTAL)
    const spZ = new Float32Array(SPINE_TOTAL)
    const spWx = new Float32Array(SPINE_TOTAL)
    const spWy = new Float32Array(SPINE_TOTAL)
    const spWz = new Float32Array(SPINE_TOTAL)
    const spHx = new Float32Array(SPINE_TOTAL)
    const spHy = new Float32Array(SPINE_TOTAL)
    const spHz = new Float32Array(SPINE_TOTAL)
    const spWidth = new Float32Array(SPINE_TOTAL)
    const spThick = new Float32Array(SPINE_TOTAL)

    const tmpTx = new Float32Array(SPINE_SAMPLES)
    const tmpTy = new Float32Array(SPINE_SAMPLES)
    const tmpTz = new Float32Array(SPINE_SAMPLES)

    const FLOCK_CONFIG = [
      {
        tiltX: 0.56,
        tiltZ: 0.34,
        yawOff: 0.0,
        p1: 0.0,
        p2: 1.15,
        p3: 2.35,
        h1: 4,
        h2: 3,
        h3: 5,
        h4: 6,
        hTilt: 2,
        hMerge: 2,
        rBase: 0.96,
        yAmp: 0.54,
        mergePhase: 0.0,
      },
      {
        tiltX: -0.54,
        tiltZ: 0.48,
        yawOff: 0.28,
        p1: 1.57,
        p2: 0.52,
        p3: 3.95,
        h1: 3,
        h2: 5,
        h3: 4,
        h4: 5,
        hTilt: 3,
        hMerge: 2,
        rBase: 0.92,
        yAmp: 0.58,
        mergePhase: 1.25,
      },
      {
        tiltX: 0.26,
        tiltZ: -0.62,
        yawOff: -0.24,
        p1: 3.14,
        p2: 2.7,
        p3: 1.1,
        h1: 5,
        h2: 4,
        h3: 3,
        h4: 6,
        hTilt: 2,
        hMerge: 3,
        rBase: 0.94,
        yAmp: 0.56,
        mergePhase: 2.55,
      },
      {
        tiltX: -0.32,
        tiltZ: -0.44,
        yawOff: 0.46,
        p1: 4.71,
        p2: 4.05,
        p3: 5.2,
        h1: 4,
        h2: 6,
        h3: 5,
        h4: 3,
        hTilt: 3,
        hMerge: 3,
        rBase: 0.89,
        yAmp: 0.52,
        mergePhase: 4.1,
      },
    ]

    function updateMurmurationSpines(phi: number) {
      const gTiltX = 0.36 * Math.sin(phi * 2.0 + 0.4)
      const gTiltZ = 0.34 * Math.cos(phi * 1.0 - 0.3)
      const cosGTX = Math.cos(gTiltX)
      const sinGTX = Math.sin(gTiltX)
      const cosGTZ = Math.cos(gTiltZ)
      const sinGTZ = Math.sin(gTiltZ)

      for (let f = 0; f < FLOCK_COUNT; f++) {
        const cfg = FLOCK_CONFIG[f]
        const baseIdx = f * SPINE_SAMPLES

        const mergeBlend = 0.16 + 0.42 * (0.5 + 0.5 * Math.sin(phi * cfg.hMerge + cfg.mergePhase))
        const splitBlend = 1.0 - mergeBlend

        const txAngle = cfg.tiltX + 0.26 * Math.sin(phi * cfg.hTilt + cfg.p1)
        const tzAngle = cfg.tiltZ + 0.26 * Math.cos(phi * cfg.hTilt + cfg.p2)
        const cosTX = Math.cos(txAngle)
        const sinTX = Math.sin(txAngle)
        const cosTZ = Math.cos(tzAngle)
        const sinTZ = Math.sin(tzAngle)

        for (let k = 0; k < SPINE_SAMPLES; k++) {
          const s = (k / SPINE_SAMPLES) * TWO_PI

          const ang =
            s +
            cfg.yawOff +
            0.44 * Math.sin(s - phi * cfg.h1 + cfg.p1) +
            0.2 * Math.sin(2.0 * s + phi * cfg.h2 + cfg.p2)

          const r =
            cfg.rBase +
            0.36 * Math.sin(s - phi * cfg.h3 + cfg.p2) +
            0.22 * Math.cos(2.0 * s + phi * cfg.h1 + cfg.p3) +
            0.1 * Math.sin(3.0 * s - phi * cfg.h4 + cfg.p1)

          const y =
            cfg.yAmp * Math.sin(s + phi * cfg.h2 + cfg.p3) +
            0.3 * Math.cos(2.0 * s - phi * cfg.h4 + cfg.p1) +
            0.14 * Math.sin(3.0 * s + phi * cfg.h3 + cfg.p2)

          const lx = r * Math.cos(ang)
          const ly = y
          const lz = r * Math.sin(ang)

          const y1 = ly * cosTX - lz * sinTX
          const z1 = ly * sinTX + lz * cosTX
          const fx = lx * cosTZ - y1 * sinTZ
          const fy = lx * sinTZ + y1 * cosTZ
          const fz = z1

          const gAng = s + 0.34 * Math.sin(s - phi * 3.0)
          const gR = 0.9 + 0.3 * Math.cos(s + phi * 2.0) + 0.16 * Math.sin(2.0 * s - phi * 4.0)
          const gY = 0.48 * Math.sin(s - phi * 2.0) + 0.22 * Math.cos(2.0 * s + phi * 3.0)

          const glx = gR * Math.cos(gAng)
          const gly = gY
          const glz = gR * Math.sin(gAng)

          const gy1 = gly * cosGTX - glz * sinGTX
          const gz1 = gly * sinGTX + glz * cosGTX
          const gx = glx * cosGTZ - gy1 * sinGTZ
          const gy = glx * sinGTZ + gy1 * cosGTZ
          const gz = gz1

          spX[baseIdx + k] = fx * splitBlend + gx * mergeBlend
          spY[baseIdx + k] = fy * splitBlend + gy * mergeBlend
          spZ[baseIdx + k] = fz * splitBlend + gz * mergeBlend
        }

        for (let k = 0; k < SPINE_SAMPLES; k++) {
          const km = (k + SPINE_SAMPLES - 1) & SPINE_MASK
          const kp = (k + 1) & SPINE_MASK
          const dx = spX[baseIdx + kp] - spX[baseIdx + km]
          const dy = spY[baseIdx + kp] - spY[baseIdx + km]
          const dz = spZ[baseIdx + kp] - spZ[baseIdx + km]
          const invLen = 1.0 / (Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6)
          tmpTx[k] = dx * invLen
          tmpTy[k] = dy * invLen
          tmpTz[k] = dz * invLen
        }

        const curvScale = SPINE_SAMPLES / TWO_PI
        for (let k = 0; k < SPINE_SAMPLES; k++) {
          const km = (k + SPINE_SAMPLES - 1) & SPINE_MASK
          const kp = (k + 1) & SPINE_MASK
          const idx = baseIdx + k

          const tx = tmpTx[k]
          const ty = tmpTy[k]
          const tz = tmpTz[k]

          const kx = (tmpTx[kp] - tmpTx[km]) * 0.5 * curvScale
          const ky = (tmpTy[kp] - tmpTy[km]) * 0.5 * curvScale
          const kz = (tmpTz[kp] - tmpTz[km]) * 0.5 * curvScale
          const kappa = Math.sqrt(kx * kx + ky * ky + kz * kz)

          let sx = -tz
          let sy = 0.0
          let sz = tx
          let sLen = Math.sqrt(sx * sx + sz * sz)
          if (sLen < 0.08) {
            sx = 0.0
            sy = tz
            sz = -ty
            sLen = Math.sqrt(sy * sy + sz * sz) + 1e-6
          }
          const invS = 1.0 / sLen
          sx *= invS
          sy *= invS
          sz *= invS

          const ux = sy * tz - sz * ty
          const uy = sz * tx - sx * tz
          const uz = sx * ty - sy * tx

          const kSide = kx * sx + ky * sy + kz * sz
          const kUp = kx * ux + ky * uy + kz * uz
          const sAngle = (k / SPINE_SAMPLES) * TWO_PI
          const bankAngle =
            0.78 * Math.atan2(kSide, 1.05 + Math.abs(kUp)) +
            0.42 * Math.sin(sAngle - phi * cfg.h2 + cfg.p3)

          const cosB = Math.cos(bankAngle)
          const sinB = Math.sin(bankAngle)

          spWx[idx] = sx * cosB + ux * sinB
          spWy[idx] = sy * cosB + uy * sinB
          spWz[idx] = sz * cosB + uz * sinB

          spHx[idx] = -sx * sinB + ux * cosB
          spHy[idx] = -sy * sinB + uy * cosB
          spHz[idx] = -sz * sinB + uz * cosB

          const compress = 1.0 / (1.0 + 1.65 * kappa)
          const densityWave = 0.8 + 0.2 * Math.sin(2.0 * sAngle - phi * 6.0 + cfg.p1)
          spWidth[idx] = (0.095 + 0.355 * compress) * densityWave
          spThick[idx] = (0.028 + 0.132 * compress) * densityWave
        }
      }
    }

    const px = new Float32Array(PARTICLE_COUNT)
    const py = new Float32Array(PARTICLE_COUNT)
    const pz = new Float32Array(PARTICLE_COUNT)
    const vx = new Float32Array(PARTICLE_COUNT)
    const vy = new Float32Array(PARTICLE_COUNT)
    const vz = new Float32Array(PARTICLE_COUNT)

    const pU = new Float32Array(PARTICLE_COUNT)
    const pFlock = new Uint8Array(PARTICLE_COUNT)
    const pSheetW = new Float32Array(PARTICLE_COUNT)
    const pSheetH = new Float32Array(PARTICLE_COUNT)
    const pStreamLag = new Float32Array(PARTICLE_COUNT)
    const pIsStraggler = new Uint8Array(PARTICLE_COUNT)
    const pPhase = new Float32Array(PARTICLE_COUNT)
    const pBaseRadius = new Float32Array(PARTICLE_COUNT)

    updateMurmurationSpines(0)

    const GOLDEN_CONJ = 0.6180339887498949
    const INV_TWO_PI_SPINE = SPINE_SAMPLES / TWO_PI

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const u0 = (i / PARTICLE_COUNT) * TWO_PI
      const vNorm = (i * GOLDEN_CONJ) % 1
      const v0 = vNorm * 2.0 - 1.0
      const f = i % FLOCK_COUNT

      pU[i] = u0
      pFlock[i] = f

      const isStrag = Math.random() < 0.07 ? 1 : 0
      pIsStraggler[i] = isStrag

      const absV = Math.abs(v0)
      const coreV = v0 * (0.65 + 0.35 * absV)
      const triRand = Math.random() + Math.random() - 1.0

      let sw: number, sh: number, lag: number
      if (isStrag) {
        sw = coreV * 1.7 + (Math.random() - 0.5) * 0.55
        sh = triRand * 2.2 + (Math.random() - 0.5) * 0.5
        lag = (Math.random() - 0.5) * 0.34
      } else {
        sw = coreV + (Math.random() - 0.5) * 0.14
        sh = triRand
        lag = (Math.random() - 0.5) * 0.07
      }

      pSheetW[i] = sw
      pSheetH[i] = sh
      pStreamLag[i] = lag
      pPhase[i] = Math.random() * TWO_PI
      pBaseRadius[i] = 0.4 + Math.random() * 0.28

      let s = (u0 + lag) % TWO_PI
      if (s < 0) s += TWO_PI
      const fPos = s * INV_TWO_PI_SPINE
      const k0 = fPos | 0
      const k1 = (k0 + 1) & SPINE_MASK
      const frac = fPos - k0
      const invFrac = 1.0 - frac

      const baseIdx = f * SPINE_SAMPLES
      const i0 = baseIdx + k0
      const i1 = baseIdx + k1

      const sx = spX[i0] * invFrac + spX[i1] * frac
      const sy = spY[i0] * invFrac + spY[i1] * frac
      const sz = spZ[i0] * invFrac + spZ[i1] * frac

      const wx = spWx[i0] * invFrac + spWx[i1] * frac
      const wy = spWy[i0] * invFrac + spWy[i1] * frac
      const wz = spWz[i0] * invFrac + spWz[i1] * frac

      const hx = spHx[i0] * invFrac + spHx[i1] * frac
      const hy = spHy[i0] * invFrac + spHy[i1] * frac
      const hz = spHz[i0] * invFrac + spHz[i1] * frac

      const wScale = (spWidth[i0] * invFrac + spWidth[i1] * frac) * sw
      const hScale = (spThick[i0] * invFrac + spThick[i1] * frac) * sh

      px[i] = sx + wx * wScale + hx * hScale
      py[i] = sy + wy * wScale + hy * hScale
      pz[i] = sz + wz * wScale + hz * hScale
    }

    const pointer = {
      active: false,
      x: -9999,
      y: -9999,
      vx: 0,
      vy: 0,
      energy: 0,
    }

    function updatePointer(clientX: number, clientY: number, isStart: boolean) {
      const rect = canvas.getBoundingClientRect()
      const nx = clientX - rect.left
      const ny = clientY - rect.top

      if (isStart || pointer.x < -5000) {
        pointer.vx = 0
        pointer.vy = 0
      } else {
        pointer.vx = Math.max(-36, Math.min(36, nx - pointer.x))
        pointer.vy = Math.max(-36, Math.min(36, ny - pointer.y))
      }

      pointer.x = nx
      pointer.y = ny
      pointer.energy = 1.0
    }

    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return
      pointer.active = true
      updatePointer(e.clientX, e.clientY, true)
    })

    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return
      pointer.active = true
      updatePointer(e.clientX, e.clientY, false)
    })

    canvas.addEventListener("pointerup", (e) => {
      if (e.pointerType === "touch") return
      pointer.active = false
    })

    canvas.addEventListener("pointerleave", () => {
      pointer.active = false
    })

    canvas.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length > 0) {
          const t = e.touches[0]
          pointer.active = true
          updatePointer(t.clientX, t.clientY, true)
        }
      },
      { passive: true },
    )

    canvas.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length > 0) {
          const t = e.touches[0]
          pointer.active = true
          updatePointer(t.clientX, t.clientY, false)
        }
      },
      { passive: true },
    )

    canvas.addEventListener(
      "touchend",
      () => {
        pointer.active = false
      },
      { passive: true },
    )

    canvas.addEventListener(
      "touchcancel",
      () => {
        pointer.active = false
      },
      { passive: true },
    )

    const projPhysX = new Float32Array(PARTICLE_COUNT)
    const projPhysY = new Float32Array(PARTICLE_COUNT)
    const projSizeIdx = new Uint8Array(PARTICLE_COUNT)
    const bucketHead = new Int32Array(ALPHA_LEVELS)
    const bucketNext = new Int32Array(PARTICLE_COUNT)

    const flockMeanVx = new Float32Array(FLOCK_COUNT)
    const flockMeanVy = new Float32Array(FLOCK_COUNT)
    const flockMeanVz = new Float32Array(FLOCK_COUNT)
    const flockCounts = new Int32Array(FLOCK_COUNT)

    const CAM_YAW = 0.42
    const CAM_PITCH = 0.24
    const COS_Y = Math.cos(CAM_YAW)
    const SIN_Y = Math.sin(CAM_YAW)
    const COS_X = Math.cos(CAM_PITCH)
    const SIN_X = Math.sin(CAM_PITCH)
    const FOV = 3.25

    let startTime = 0

    function animate(now: number) {
      if (startTime === 0) startTime = now
      const time = (now - startTime) * 0.001
      const phi = (time * OMEGA) % TWO_PI

      updateMurmurationSpines(phi)

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = bgHex
      ctx.fillRect(0, 0, physWidth, physHeight)

      if (!pointer.active) {
        pointer.energy *= 0.9
        pointer.vx *= 0.85
        pointer.vy *= 0.85
      } else {
        pointer.vx *= 0.82
        pointer.vy *= 0.82
      }

      const scale = Math.min(width, height) * 0.322
      const centerX = width * 0.5
      const centerY = height * 0.5

      const edgeMarginX = Math.max(28, width * 0.135)
      const edgeMarginY = Math.max(28, height * 0.135)

      const interactRadius = Math.min(width, height) * 0.19
      const interactRadiusSq = interactRadius * interactRadius
      const hasWake = pointer.energy > 0.015

      flockMeanVx.fill(0)
      flockMeanVy.fill(0)
      flockMeanVz.fill(0)
      flockCounts.fill(0)
      for (let i = 0; i < PARTICLE_COUNT; i += 4) {
        const f = pFlock[i]
        flockMeanVx[f] += vx[i]
        flockMeanVy[f] += vy[i]
        flockMeanVz[f] += vz[i]
        flockCounts[f]++
      }
      for (let f = 0; f < FLOCK_COUNT; f++) {
        const c = flockCounts[f] || 1
        flockMeanVx[f] /= c
        flockMeanVy[f] /= c
        flockMeanVz[f] /= c
      }

      bucketHead.fill(-1)

      const phi2 = phi * 2.0
      const t135 = time * 1.35
      const t122 = time * 1.22
      const t142 = time * 1.42
      const t380 = time * 3.8

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const f = pFlock[i]
        const baseIdx = f * SPINE_SAMPLES

        let s = (pU[i] + phi2 + pStreamLag[i]) % TWO_PI
        if (s < 0) s += TWO_PI

        const fPos = s * INV_TWO_PI_SPINE
        const k0 = fPos | 0
        const k1 = (k0 + 1) & SPINE_MASK
        const frac = fPos - k0
        const invFrac = 1.0 - frac

        const i0 = baseIdx + k0
        const i1 = baseIdx + k1

        const spx = spX[i0] * invFrac + spX[i1] * frac
        const spy = spY[i0] * invFrac + spY[i1] * frac
        const spz = spZ[i0] * invFrac + spZ[i1] * frac

        const wx = spWx[i0] * invFrac + spWx[i1] * frac
        const wy = spWy[i0] * invFrac + spWy[i1] * frac
        const wz = spWz[i0] * invFrac + spWz[i1] * frac

        const hx = spHx[i0] * invFrac + spHx[i1] * frac
        const hy = spHy[i0] * invFrac + spHy[i1] * frac
        const hz = spHz[i0] * invFrac + spHz[i1] * frac

        const wScale = (spWidth[i0] * invFrac + spWidth[i1] * frac) * pSheetW[i]
        const hScale = (spThick[i0] * invFrac + spThick[i1] * frac) * pSheetH[i]

        let cx = spx + wx * wScale + hx * hScale
        let cy = spy + wy * wScale + hy * hScale
        let cz = spz + wz * wScale + hz * hScale

        const cPhi = phi + f * 0.25
        const cp1 = cPhi * 4.0
        const cp2 = cPhi * 7.0
        const cp3 = cPhi * 3.0
        const cp5 = cPhi * 5.0

        const curlX =
          Math.sin(cy * 1.15 + cp1) * Math.cos(cz * 1.15 - cp3) +
          0.34 * Math.sin(cz * 2.35 + cp2) * Math.cos(cx * 2.35 - cp1)
        const curlY =
          Math.sin(cz * 1.15 + cp3) * Math.cos(cx * 1.15 + cp1) +
          0.34 * Math.cos(cx * 2.35 - cp2) * Math.sin(cy * 2.35 + cp5)
        const curlZ =
          Math.sin(cx * 1.15 - cp1) * Math.cos(cy * 1.15 + cp3) +
          0.34 * Math.sin(cy * 2.35 + cp2) * Math.cos(cz * 2.35 - cp5)

        const isStrag = pIsStraggler[i]
        const curlAmp = isStrag ? 0.155 : 0.064
        cx += curlX * curlAmp
        cy += curlY * curlAmp
        cz += curlZ * curlAmp

        const ex = cx / 1.34
        const ey = cy / 1.22
        const ez = cz / 1.32
        const ellipRSq = ex * ex + ey * ey + ez * ez
        if (ellipRSq > 0.7396) {
          const ellipR = Math.sqrt(ellipRSq)
          const compressed = 0.86 + 0.22 * Math.tanh((ellipR - 0.86) * 1.45)
          const ratio = compressed / ellipR
          cx *= ratio
          cy *= ratio
          cz *= ratio
        }

        const ph = pPhase[i]
        const curX = px[i]
        const curY = py[i]
        const curZ = pz[i]
        const microAmp = isStrag ? 0.032 : 0.018
        const tx = cx + Math.sin(curY * 2.4 + t135 + ph) * microAmp
        const ty = cy + Math.cos(curZ * 2.4 + t122 + ph) * microAmp
        const tz = cz + Math.sin(curX * 2.4 + t142 + ph) * microAmp

        const spring = isStrag ? 0.016 : 0.026
        const damping = isStrag ? 0.905 : 0.888
        const alignWeight = isStrag ? 0.024 : 0.068

        let nvx = (vx[i] + (tx - curX) * spring + (flockMeanVx[f] - vx[i]) * alignWeight) * damping
        let nvy = (vy[i] + (ty - curY) * spring + (flockMeanVy[f] - vy[i]) * alignWeight) * damping
        let nvz = (vz[i] + (tz - curZ) * spring + (flockMeanVz[f] - vz[i]) * alignWeight) * damping

        const cEx = curX / 1.48
        const cEy = curY / 1.36
        const cEz = curZ / 1.46
        const cRadSq = cEx * cEx + cEy * cEy + cEz * cEz
        if (cRadSq > 1.0) {
          const cRad = Math.sqrt(cRadSq)
          const pull = Math.min(0.052, (cRad - 1.0) * 0.026) / cRad
          nvx -= cEx * pull
          nvy -= cEy * pull
          nvz -= cEz * pull
        }

        if (hasWake) {
          const x1w = curX * COS_Y - curZ * SIN_Y
          const z1w = curZ * COS_Y + curX * SIN_Y
          const y2w = curY * COS_X - z1w * SIN_X
          const z2w = z1w * COS_X + curY * SIN_X

          const perspW = FOV / (FOV + (z2w < -2.1 ? -2.1 : z2w))
          const sxW = centerX + x1w * scale * perspW
          const syW = centerY + y2w * scale * perspW

          const dx = sxW - pointer.x
          const dy = syW - pointer.y
          const distSq = dx * dx + dy * dy

          if (distSq < interactRadiusSq && distSq > 0.001) {
            const dist = Math.sqrt(distSq)
            const norm = 1.0 - dist / interactRadius
            const falloff = norm * norm * pointer.energy

            const nx = dx / dist
            const ny = dy / dist

            const repel = falloff * 0.044
            const swirl = falloff * 0.028
            const dragX = pointer.vx * falloff * 0.0014
            const dragY = pointer.vy * falloff * 0.0014

            const camImpX = nx * repel - ny * swirl + dragX
            const camImpY = ny * repel + nx * swirl + dragY
            const camImpZ = falloff * 0.022 * Math.sin(ph + t380)

            const iy1 = camImpY * COS_X + camImpZ * SIN_X
            const iz1 = -camImpY * SIN_X + camImpZ * COS_X

            const ix2 = camImpX * COS_Y + iz1 * SIN_Y
            const iz2 = -camImpX * SIN_Y + iz1 * COS_Y

            nvx += ix2
            nvy += iy1
            nvz += iz2
          }
        }

        vx[i] = nvx
        vy[i] = nvy
        vz[i] = nvz

        const nxPos = curX + nvx
        const nyPos = curY + nvy
        const nzPos = curZ + nvz
        px[i] = nxPos
        py[i] = nyPos
        pz[i] = nzPos

        const x1 = nxPos * COS_Y - nzPos * SIN_Y
        const z1 = nzPos * COS_Y + nxPos * SIN_Y
        const y2 = nyPos * COS_X - z1 * SIN_X
        const z2 = z1 * COS_X + nyPos * SIN_X

        const clampedZ = z2 < -2.2 ? -2.2 : z2
        const perspective = FOV / (FOV + clampedZ)

        const sx = centerX + x1 * scale * perspective
        const sy = centerY + y2 * scale * perspective

        if (sx <= 0 || sx >= width || sy <= 0 || sy >= height) continue

        const distEdgeX = sx < width - sx ? sx : width - sx
        const distEdgeY = sy < height - sy ? sy : height - sy
        let edgeFade = 1.0
        if (distEdgeX < edgeMarginX) {
          edgeFade *= smootherstep(distEdgeX / edgeMarginX)
        }
        if (distEdgeY < edgeMarginY) {
          edgeFade *= smootherstep(distEdgeY / edgeMarginY)
        }
        if (edgeFade <= 0.015) continue

        projPhysX[i] = sx * dpr - halfCellPx
        projPhysY[i] = sy * dpr - halfCellPx

        const rCss = pBaseRadius[i] * perspective
        let sIdx = ((rCss - 0.4) * 8.888) | 0
        if (sIdx < 0) sIdx = 0
        else if (sIdx >= SIZE_LEVELS) sIdx = SIZE_LEVELS - 1
        projSizeIdx[i] = sIdx

        let depthNorm = (1.55 - z2) / 2.9
        if (depthNorm < 0) depthNorm = 0
        else if (depthNorm > 0.999) depthNorm = 0.999

        const combinedOpacity = (0.24 + depthNorm * 0.76) * edgeFade
        let b = (combinedOpacity * ALPHA_LEVELS) | 0
        if (b < 0) b = 0
        else if (b >= ALPHA_LEVELS) b = ALPHA_LEVELS - 1

        bucketNext[i] = bucketHead[b]
        bucketHead[b] = i
      }

      for (let b = 0; b < ALPHA_LEVELS; b++) {
        let idx = bucketHead[b]
        if (idx === -1) continue

        const srcX = b * cellPx
        while (idx !== -1) {
          const srcY = projSizeIdx[idx] * cellPx
          ctx.drawImage(
            atlasCanvas,
            srcX,
            srcY,
            cellPx,
            cellPx,
            projPhysX[idx],
            projPhysY[idx],
            cellPx,
            cellPx,
          )
          idx = bucketNext[idx]
        }
      }

      requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startMurmuration)
  } else {
    startMurmuration()
  }
})()
