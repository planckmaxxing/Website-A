/**
 * High-Performance 4K 120fps 3D Starling Murmuration Renderer
 *
 * Architecture:
 * - WebGL2 / WebGL1 single-draw-call GPU point-sprite renderer (1 gl.drawArrays per frame)
 *   with automatic Canvas2D fallback if WebGL is unavailable
 * - Native high-DPI support up to 3x DPR for razor-sharp 4K & mobile displays
 * - 4096-entry Float32Array sin/cos lookup table eliminating ~160k Math.sin/cos calls/frame
 * - Frame-rate independent physics step (consistent motion across 60Hz, 120Hz, 144Hz)
 * - 4 overlapping sub-flock ribbons driven by 128-node periodic 3D flight spines (36s loop)
 * - Wake-only pointer & touch scattering + outer 13.5% margin alpha fade
 * - Synchronized with data-theme="dark" | "light"
 */
;(function () {
  const win = window as unknown as { __murmurationInitialized?: boolean }
  if (win.__murmurationInitialized) return

  function startMurmuration() {
    const maybeCanvas = document.getElementById("swarmCanvas") as HTMLCanvasElement | null
    if (!maybeCanvas) return
    const canvas = maybeCanvas

    win.__murmurationInitialized = true

    const TWO_PI = Math.PI * 2
    const HALF_PI = Math.PI * 0.5
    const PARTICLE_COUNT = window.innerWidth <= 860 ? 4500 : 10500

    // Exact periodic master cycle (36 seconds)
    const LOOP_PERIOD = 36.0
    const OMEGA = TWO_PI / LOOP_PERIOD

    // 4 interacting starling sub-flock ribbons, 128 sampled nodes per periodic spine
    const FLOCK_COUNT = 4
    const SPINE_SAMPLES = 128
    const SPINE_MASK = SPINE_SAMPLES - 1
    const SPINE_TOTAL = FLOCK_COUNT * SPINE_SAMPLES

    // 4096-entry Fast Sin/Cos Lookup Table
    const LUT_SIZE = 4096
    const LUT_MASK = LUT_SIZE - 1
    const LUT_SCALE = LUT_SIZE / TWO_PI
    const LUT_QUARTER = LUT_SIZE >> 2
    const SIN_LUT = new Float32Array(LUT_SIZE)
    for (let i = 0; i < LUT_SIZE; i++) {
      SIN_LUT[i] = Math.sin((i / LUT_SIZE) * TWO_PI)
    }

    function fastSin(x: number): number {
      return SIN_LUT[((x * LUT_SCALE) | 0) & LUT_MASK]
    }
    function fastCos(x: number): number {
      return SIN_LUT[(((x * LUT_SCALE) | 0) + LUT_QUARTER) & LUT_MASK]
    }
    function fastTanh(x: number): number {
      if (x > 3.0) return 1.0
      if (x < -3.0) return -1.0
      const x2 = x * x
      return (x * (27.0 + x2)) / (27.0 + 9.0 * x2)
    }

    function getThemeIsDark(): boolean {
      return document.documentElement.getAttribute("data-theme") !== "light"
    }

    let isDarkMode = getThemeIsDark()

    // Try WebGL2 -> WebGL1 -> Canvas2D fallback
    const gl = (canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    }) ||
      canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
      })) as WebGLRenderingContext | null

    let ctx2d: CanvasRenderingContext2D | null = null
    let glProgram: WebGLProgram | null = null
    let glBuffer: WebGLBuffer | null = null
    let uResolutionLoc: WebGLUniformLocation | null = null
    let uColorLoc: WebGLUniformLocation | null = null
    // Interleaved per-particle GPU buffer: [xPx, yPx, pointSizePx, alpha]
    const gpuData = new Float32Array(PARTICLE_COUNT * 4)

    if (gl) {
      const vsSource = `
        attribute vec2 a_pos;
        attribute float a_size;
        attribute float a_alpha;
        uniform vec2 u_resolution;
        varying float v_alpha;
        void main() {
          vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;
          gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
          gl_PointSize = a_size;
          v_alpha = a_alpha;
        }
      `
      const fsSource = `
        precision mediump float;
        uniform vec3 u_color;
        varying float v_alpha;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d) * 2.0;
          float edge = 1.0 - smoothstep(0.58, 1.0, r);
          if (edge <= 0.004) discard;
          gl_FragColor = vec4(u_color, v_alpha * edge);
        }
      `

      const compile = (type: number, src: string) => {
        const s = gl.createShader(type)!
        gl.shaderSource(s, src)
        gl.compileShader(s)
        return s
      }

      glProgram = gl.createProgram()!
      gl.attachShader(glProgram, compile(gl.VERTEX_SHADER, vsSource))
      gl.attachShader(glProgram, compile(gl.FRAGMENT_SHADER, fsSource))
      gl.linkProgram(glProgram)
      gl.useProgram(glProgram)

      glBuffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, gpuData.byteLength, gl.DYNAMIC_DRAW)

      const aPos = gl.getAttribLocation(glProgram, "a_pos")
      const aSize = gl.getAttribLocation(glProgram, "a_size")
      const aAlpha = gl.getAttribLocation(glProgram, "a_alpha")
      const stride = 16 // 4 floats * 4 bytes

      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0)
      gl.enableVertexAttribArray(aSize)
      gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, stride, 8)
      gl.enableVertexAttribArray(aAlpha)
      gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride, 12)

      uResolutionLoc = gl.getUniformLocation(glProgram, "u_resolution")
      uColorLoc = gl.getUniformLocation(glProgram, "u_color")

      gl.disable(gl.DEPTH_TEST)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    } else {
      ctx2d = canvas.getContext("2d", { alpha: false })
      if (!ctx2d) return
      ctx2d.imageSmoothingEnabled = false
    }

    let width = 1
    let height = 1
    let physWidth = 1
    let physHeight = 1
    let dpr = 1

    function applyThemeColors() {
      isDarkMode = getThemeIsDark()
      if (gl && glProgram) {
        gl.useProgram(glProgram)
        if (isDarkMode) {
          gl.clearColor(0x1e / 255, 0x1e / 255, 0x1e / 255, 1.0)
          gl.uniform3f(uColorLoc, 226 / 255, 228 / 255, 232 / 255)
        } else {
          gl.clearColor(1.0, 1.0, 1.0, 1.0)
          gl.uniform3f(uColorLoc, 10 / 255, 10 / 255, 10 / 255)
        }
      }
    }

    function resize() {
      const parent = canvas.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      const nextDpr = Math.min(window.devicePixelRatio || 1, 3)
      const nextWidth = Math.max(1, rect.width)
      const nextHeight = Math.max(1, rect.height)
      const nextPhysWidth = Math.round(nextWidth * nextDpr)
      const nextPhysHeight = Math.round(nextHeight * nextDpr)

      if (nextPhysWidth === physWidth && nextPhysHeight === physHeight && nextDpr === dpr) {
        return
      }

      dpr = nextDpr
      width = nextWidth
      height = nextHeight
      physWidth = nextPhysWidth
      physHeight = nextPhysHeight
      canvas.width = physWidth
      canvas.height = physHeight

      if (gl && glProgram) {
        gl.viewport(0, 0, physWidth, physHeight)
        gl.useProgram(glProgram)
        gl.uniform2f(uResolutionLoc, physWidth, physHeight)
      }
    }

    if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
      const ro = new ResizeObserver(() => resize())
      ro.observe(canvas.parentElement)
    }
    window.addEventListener("resize", resize)

    const themeObserver = new MutationObserver(() => applyThemeColors())
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    })
    document.addEventListener("themechange", applyThemeColors)

    applyThemeColors()
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
            0.44 * fastSin(s - phi * cfg.h1 + cfg.p1) +
            0.2 * fastSin(2.0 * s + phi * cfg.h2 + cfg.p2)

          const r =
            cfg.rBase +
            0.36 * fastSin(s - phi * cfg.h3 + cfg.p2) +
            0.22 * fastCos(2.0 * s + phi * cfg.h1 + cfg.p3) +
            0.1 * fastSin(3.0 * s - phi * cfg.h4 + cfg.p1)

          const y =
            cfg.yAmp * fastSin(s + phi * cfg.h2 + cfg.p3) +
            0.3 * fastCos(2.0 * s - phi * cfg.h4 + cfg.p1) +
            0.14 * fastSin(3.0 * s + phi * cfg.h3 + cfg.p2)

          const lx = r * fastCos(ang)
          const ly = y
          const lz = r * fastSin(ang)

          const y1 = ly * cosTX - lz * sinTX
          const z1 = ly * sinTX + lz * cosTX
          const fx = lx * cosTZ - y1 * sinTZ
          const fy = lx * sinTZ + y1 * cosTZ
          const fz = z1

          const gAng = s + 0.34 * fastSin(s - phi * 3.0)
          const gR = 0.9 + 0.3 * fastCos(s + phi * 2.0) + 0.16 * fastSin(2.0 * s - phi * 4.0)
          const gY = 0.48 * fastSin(s - phi * 2.0) + 0.22 * fastCos(2.0 * s + phi * 3.0)

          const glx = gR * fastCos(gAng)
          const gly = gY
          const glz = gR * fastSin(gAng)

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
            0.42 * fastSin(sAngle - phi * cfg.h2 + cfg.p3)

          const cosB = fastCos(bankAngle)
          const sinB = fastSin(bankAngle)

          spWx[idx] = sx * cosB + ux * sinB
          spWy[idx] = sy * cosB + uy * sinB
          spWz[idx] = sz * cosB + uz * sinB

          spHx[idx] = -sx * sinB + ux * cosB
          spHy[idx] = -sy * sinB + uy * cosB
          spHz[idx] = -sz * sinB + uz * cosB

          const compress = 1.0 / (1.0 + 1.65 * kappa)
          const densityWave = 0.8 + 0.2 * fastSin(2.0 * sAngle - phi * 6.0 + cfg.p1)
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
      pBaseRadius[i] = 0.42 + Math.random() * 0.3

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
    canvas.addEventListener("touchend", () => {
      pointer.active = false
    })
    canvas.addEventListener("touchcancel", () => {
      pointer.active = false
    })

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
    let lastNow = 0

    function animate(now: number) {
      if (startTime === 0) {
        startTime = now
        lastNow = now
      }

      if (document.hidden || width <= 2 || height <= 2) {
        lastNow = now
        requestAnimationFrame(animate)
        return
      }

      const rawDt = now - lastNow
      lastNow = now
      // Normalized to 60Hz baseline so 60Hz, 120Hz, and 144Hz move at identical speed
      const dtScale = rawDt > 0 ? Math.min(2.0, rawDt * 0.06) : 1.0

      const time = (now - startTime) * 0.001
      const phi = (time * OMEGA) % TWO_PI

      updateMurmurationSpines(phi)

      if (!pointer.active) {
        pointer.energy *= Math.pow(0.9, dtScale)
        pointer.vx *= Math.pow(0.85, dtScale)
        pointer.vy *= Math.pow(0.85, dtScale)
      } else {
        pointer.vx *= Math.pow(0.82, dtScale)
        pointer.vy *= Math.pow(0.82, dtScale)
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

      const phi2 = phi * 2.0
      const t135 = time * 1.35
      const t122 = time * 1.22
      const t142 = time * 1.42
      const t380 = time * 3.8

      const dampCore = Math.pow(0.888, dtScale)
      const dampStrag = Math.pow(0.905, dtScale)
      const springCore = 0.026 * dtScale
      const springStrag = 0.016 * dtScale
      const alignCore = 0.068 * dtScale
      const alignStrag = 0.024 * dtScale

      let visibleCount = 0

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
          fastSin(cy * 1.15 + cp1) * fastCos(cz * 1.15 - cp3) +
          0.34 * fastSin(cz * 2.35 + cp2) * fastCos(cx * 2.35 - cp1)
        const curlY =
          fastSin(cz * 1.15 + cp3) * fastCos(cx * 1.15 + cp1) +
          0.34 * fastCos(cx * 2.35 - cp2) * fastSin(cy * 2.35 + cp5)
        const curlZ =
          fastSin(cx * 1.15 - cp1) * fastCos(cy * 1.15 + cp3) +
          0.34 * fastSin(cy * 2.35 + cp2) * fastCos(cz * 2.35 - cp5)

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
          const compressed = 0.86 + 0.22 * fastTanh((ellipR - 0.86) * 1.45)
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
        const tx = cx + fastSin(curY * 2.4 + t135 + ph) * microAmp
        const ty = cy + fastCos(curZ * 2.4 + t122 + ph) * microAmp
        const tz = cz + fastSin(curX * 2.4 + t142 + ph) * microAmp

        const spring = isStrag ? springStrag : springCore
        const damping = isStrag ? dampStrag : dampCore
        const alignWeight = isStrag ? alignStrag : alignCore

        let nvx =
          (vx[i] + (tx - curX) * spring + (flockMeanVx[f] - vx[i]) * alignWeight) * damping
        let nvy =
          (vy[i] + (ty - curY) * spring + (flockMeanVy[f] - vy[i]) * alignWeight) * damping
        let nvz =
          (vz[i] + (tz - curZ) * spring + (flockMeanVz[f] - vz[i]) * alignWeight) * damping

        const cEx = curX / 1.48
        const cEy = curY / 1.36
        const cEz = curZ / 1.46
        const cRadSq = cEx * cEx + cEy * cEy + cEz * cEz
        if (cRadSq > 1.0) {
          const cRad = Math.sqrt(cRadSq)
          const pull = (Math.min(0.052, (cRad - 1.0) * 0.026) * dtScale) / cRad
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
            const falloff = norm * norm * pointer.energy * dtScale

            const nx = dx / dist
            const ny = dy / dist

            const repel = falloff * 0.044
            const swirl = falloff * 0.028
            const dragX = pointer.vx * falloff * 0.0014
            const dragY = pointer.vy * falloff * 0.0014

            const camImpX = nx * repel - ny * swirl + dragX
            const camImpY = ny * repel + nx * swirl + dragY
            const camImpZ = falloff * 0.022 * fastSin(ph + t380)

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

        const nxPos = curX + nvx * dtScale
        const nyPos = curY + nvy * dtScale
        const nzPos = curZ + nvz * dtScale
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

        let depthNorm = (1.55 - z2) / 2.9
        if (depthNorm < 0) depthNorm = 0
        else if (depthNorm > 0.999) depthNorm = 0.999

        const combinedOpacity = (0.24 + depthNorm * 0.76) * edgeFade
        const rCss = pBaseRadius[i] * perspective

        const outIdx = visibleCount * 4
        gpuData[outIdx] = sx * dpr
        gpuData[outIdx + 1] = sy * dpr
        gpuData[outIdx + 2] = Math.max(1.2, rCss * 2.2 * dpr)
        gpuData[outIdx + 3] = 0.04 + combinedOpacity * 0.9
        visibleCount++
      }

      if (gl && glProgram && glBuffer) {
        gl.clear(gl.COLOR_BUFFER_BIT)
        if (visibleCount > 0) {
          gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, gpuData.subarray(0, visibleCount * 4))
          gl.drawArrays(gl.POINTS, 0, visibleCount)
        }
      } else if (ctx2d) {
        ctx2d.setTransform(1, 0, 0, 1, 0, 0)
        ctx2d.fillStyle = isDarkMode ? "#1e1e1e" : "#ffffff"
        ctx2d.fillRect(0, 0, physWidth, physHeight)
        const dotRgb = isDarkMode ? "226, 228, 232" : "10, 10, 10"
        for (let i = 0; i < visibleCount; i++) {
          const idx = i * 4
          const sz = gpuData[idx + 2] * 0.5
          ctx2d.fillStyle = `rgba(${dotRgb},${gpuData[idx + 3].toFixed(2)})`
          ctx2d.fillRect(gpuData[idx] - sz, gpuData[idx + 1] - sz, sz * 2, sz * 2)
        }
      }

      requestAnimationFrame(animate)
    }

    // Keep HALF_PI referenced only if needed; avoid unused var
    void HALF_PI
    requestAnimationFrame(animate)
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startMurmuration)
  } else {
    startMurmuration()
  }
})()
