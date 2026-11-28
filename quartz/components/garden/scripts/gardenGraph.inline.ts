import { FullSlug, SimpleSlug, simplifySlug } from "../../../util/path"

interface ContentEntry {
  slug: FullSlug
  title: string
  links?: SimpleSlug[]
  tags?: string[]
  content?: string
}

type ContentIndex = Record<string, ContentEntry>
declare const fetchData: Promise<ContentIndex>

interface GraphNode {
  id: FullSlug
  slug: FullSlug
  title: string
  x: number
  y: number
  vx: number
  vy: number
  degree: number
  isCurrent: boolean
  /** Smooth per-node hover/neighbor highlight intensity [0..1] */
  highlight: number
  /** Smooth per-node dim factor [0..1] (0 = normal, 1 = dimmed) */
  dim: number
  /** Smooth per-node hovered label alpha [0..1] */
  hoverLabel: number
}

interface GraphEdge {
  source: GraphNode
  target: GraphNode
  highlight: number
}

;(function () {
  const win = window as unknown as { __gardenGraphInitialized?: boolean }
  if (win.__gardenGraphInitialized) return
  win.__gardenGraphInitialized = true

  let activeDestroy: (() => void) | null = null
  let modalDestroy: (() => void) | null = null

  function normalizeSlug(raw: string): FullSlug {
    const clean = raw.replace(/^\/+|\/+$/g, "")
    return (clean === "" ? "index" : clean) as FullSlug
  }

  function isDark(): boolean {
    return document.documentElement.getAttribute("data-theme") !== "light"
  }

  /**
   * Resolves the canonical site root URL (e.g. "https://planckmaxxing.github.io/w-a/" or "http://127.0.0.1:8080/")
   * directly from the page's index.css stylesheet link, avoiding trailing-slash / nested-folder relative drift.
   */
  function getSiteRoot(): string {
    const cssLink = document.querySelector<HTMLLinkElement>('link[href*="index.css"]')
    if (cssLink && cssLink.href) {
      return cssLink.href.replace(/index\.css(?:\?.*)?$/, "")
    }
    return window.location.origin + "/"
  }

  function resolveTargetUrl(targetSlug: FullSlug): URL {
    const root = getSiteRoot()
    if (targetSlug === "index") {
      return new URL(root)
    }
    return new URL(targetSlug, root)
  }

  /** Exact CSS cubic-bezier(0.4, 0, 0.2, 1) solver matching page & murmuration theme transitions */
  function easeStandardBezier(x: number): number {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 5; i++) {
      const u = 1 - t
      const cx = 3 * u * u * t * 0.4 + 3 * u * t * t * 0.2 + t * t * t
      const dx = 3 * u * u * 0.4 + 6 * u * t * (0.2 - 0.4) + 3 * t * t * (1 - 0.2)
      if (Math.abs(dx) < 1e-6) break
      t -= (cx - x) / dx
      if (t < 0) t = 0
      else if (t > 1) t = 1
    }
    return t * t * (3 - 2 * t)
  }

  /** Deterministic hash in [0, 1) for reproducible, jitter-free initial node seeding */
  function hashSlug(str: string): number {
    let h = 2166136261
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return ((h >>> 0) % 10000) / 10000
  }

  function buildGraphData(
    index: ContentIndex,
    currentSlug: FullSlug,
    mode: "global" | "local",
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const slugMap = new Map<FullSlug, { slug: FullSlug; title: string; links: string[] }>()
    const simpleToFull = new Map<string, FullSlug>()

    for (const [rawSlug, entry] of Object.entries(index)) {
      const full = normalizeSlug(rawSlug)
      if (full === ("404" as FullSlug) || full.startsWith("tags/")) continue
      const simple = simplifySlug(full)
      simpleToFull.set(simple, full)
      simpleToFull.set(full, full)
      simpleToFull.set(full.toLowerCase(), full)
      if (full === "index") {
        simpleToFull.set("/", full)
        simpleToFull.set("", full)
        simpleToFull.set("index", full)
      }
      slugMap.set(full, {
        slug: full,
        title: entry.title || full.split("/").pop() || full,
        links: (entry.links ?? []).map((l) => String(l)),
      })
    }

    const edgePairs: Array<[FullSlug, FullSlug]> = []
    const edgeKeys = new Set<string>()
    const neighbors = new Map<FullSlug, Set<FullSlug>>()

    for (const full of slugMap.keys()) {
      neighbors.set(full, new Set())
    }

    for (const [srcFull, info] of slugMap.entries()) {
      for (const rawTarget of info.links) {
        const cleaned = rawTarget.replace(/^\/+|\/+$/g, "")
        const targetFull =
          simpleToFull.get(rawTarget) ??
          simpleToFull.get(cleaned) ??
          simpleToFull.get(cleaned.toLowerCase()) ??
          (cleaned === "" ? ("index" as FullSlug) : undefined)
        if (!targetFull || targetFull === srcFull || !slugMap.has(targetFull)) continue
        const key = srcFull < targetFull ? `${srcFull}||${targetFull}` : `${targetFull}||${srcFull}`
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key)
          edgePairs.push([srcFull, targetFull])
          neighbors.get(srcFull)!.add(targetFull)
          neighbors.get(targetFull)!.add(srcFull)
        }
      }
    }

    let allowedSlugs: Set<FullSlug>
    if (mode === "local" && slugMap.has(currentSlug)) {
      allowedSlugs = new Set<FullSlug>([currentSlug])
      const direct = neighbors.get(currentSlug)
      if (direct) {
        for (const n of direct) allowedSlugs.add(n)
      }
    } else {
      allowedSlugs = new Set<FullSlug>(slugMap.keys())
    }

    const nodeMap = new Map<FullSlug, GraphNode>()
    const list = Array.from(allowedSlugs).sort()
    const count = list.length

    list.forEach((slug, i) => {
      const info = slugMap.get(slug)!
      const goldenAngle = i * 2.399963229728653
      const jitter = (hashSlug(slug) - 0.5) * 14
      const radius =
        slug === currentSlug && mode === "local"
          ? 0
          : count <= 6
            ? 70 + jitter
            : Math.sqrt(i + 1) * 44 + jitter
      nodeMap.set(slug, {
        id: slug,
        slug,
        title: info.title,
        x: Math.cos(goldenAngle) * radius,
        y: Math.sin(goldenAngle) * radius,
        vx: 0,
        vy: 0,
        degree: 0,
        isCurrent: slug === currentSlug,
        highlight: 0,
        dim: 0,
        hoverLabel: 0,
      })
    })

    const edges: GraphEdge[] = []
    for (const [a, b] of edgePairs) {
      const na = nodeMap.get(a)
      const nb = nodeMap.get(b)
      if (na && nb) {
        edges.push({ source: na, target: nb, highlight: 0 })
        na.degree++
        nb.degree++
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges,
    }
  }

  function mountGraph(
    canvas: HTMLCanvasElement,
    nodes: GraphNode[],
    edges: GraphEdge[],
    currentSlug: FullSlug,
    mode: "global" | "local",
    onNavigate?: () => void,
  ): () => void {
    const ctx = canvas.getContext("2d")
    if (!ctx) return () => {}

    let width = 300
    let height = 260
    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    // Camera state
    let panX = 0
    let panY = 0
    let zoom = 1.0
    let defaultPanX = 0
    let defaultPanY = 0
    let defaultZoom = 1.0

    // Smooth camera reset animation (double-click background)
    let camAnimStart = 0
    let camAnimFromPanX = 0
    let camAnimFromPanY = 0
    let camAnimFromZoom = 1.0
    const CAM_RESET_MS = 340

    // Synchronized theme color blend [0 = dark, 1 = light]
    let themeBlend = isDark() ? 0.0 : 1.0
    let themeStartBlend = themeBlend
    let targetThemeBlend = themeBlend
    let themeAnimStart = 0

    // Interaction state
    let hoveredNode: GraphNode | null = null
    let pressedNode: GraphNode | null = null
    let draggingNode: GraphNode | null = null
    let isPanning = false
    let downX = 0
    let downY = 0
    let lastX = 0
    let lastY = 0
    let movedDist = 0
    const DRAG_DEADZONE = 4

    // Multi-touch pinch zoom tracking
    const activePointers = new Map<number, { x: number; y: number }>()
    let lastPinchDist = 0

    // Adjacency map
    const adj = new Map<GraphNode, Set<GraphNode>>()
    for (const n of nodes) adj.set(n, new Set())
    for (const e of edges) {
      adj.get(e.source)!.add(e.target)
      adj.get(e.target)!.add(e.source)
    }

    // D3/Obsidian-style cooling simulation
    let alpha = 1.0
    let alphaTarget = 0.0
    const alphaDecay = 0.028
    const velocityDecay = 0.62 // Obsidian-like damped fluid spring motion

    let rafId = 0
    let lastFrameMs = 0
    let destroyed = false
    let hasInitialFit = false

    function nodeRadius(n: GraphNode): number {
      // Obsidian node size scales gently with connection count (degree)
      const degScale = Math.sqrt(n.degree + 1) * 1.15
      const base = 3.2 + Math.min(3.6, degScale)
      return n.isCurrent ? Math.max(base, 5.2) : base
    }

    function screenToWorld(sx: number, sy: number): [number, number] {
      return [(sx - width * 0.5 - panX) / zoom, (sy - height * 0.5 - panY) / zoom]
    }

    function hitTest(sx: number, sy: number): GraphNode | null {
      const [wx, wy] = screenToWorld(sx, sy)
      let best: GraphNode | null = null
      let bestDistSq = Infinity
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i]
        const hitR = nodeRadius(n) + 7 / Math.max(0.6, zoom)
        const dx = wx - n.x
        const dy = wy - n.y
        const d2 = dx * dx + dy * dy
        if (d2 <= hitR * hitR && d2 < bestDistSq) {
          best = n
          bestDistSq = d2
        }
      }
      return best
    }

    function stepPhysics() {
      const nCount = nodes.length
      if (nCount === 0) return

      const isLarge = width > 560
      const chargeStrength = isLarge ? 3200 : mode === "local" ? 2100 : 1850
      const linkDist = isLarge ? 128 : mode === "local" ? 96 : 94
      const linkStrength = 0.14
      const centerXStrength = 0.012
      const centerYStrength = isLarge ? 0.014 : 0.022

      // 1. Repel force (Coulomb charge, slightly stronger for hubs so clusters open cleanly)
      for (let i = 0; i < nCount; i++) {
        const a = nodes[i]
        const weightA = 1 + a.degree * 0.16
        for (let j = i + 1; j < nCount; j++) {
          const b = nodes[j]
          const weightB = 1 + b.degree * 0.16
          let dx = b.x - a.x
          let dy = b.y - a.y
          let distSq = dx * dx + dy * dy
          if (distSq < 9) {
            const angle = (i * 1.7 + j * 2.3) % (Math.PI * 2)
            dx = Math.cos(angle) * 3
            dy = Math.sin(angle) * 3
            distSq = 9
          }
          const dist = Math.sqrt(distSq)
          const f = Math.min(22, ((chargeStrength * weightA * weightB) / distSq) * alpha * 0.06)
          const fx = (dx / dist) * f
          const fy = (dy / dist) * f
          a.vx -= fx
          a.vy -= fy
          b.vx += fx
          b.vy += fy
        }
      }

      // 2. Link force (Hooke spring pull toward rest distance)
      for (let i = 0; i < edges.length; i++) {
        const { source, target } = edges[i]
        const dx = target.x - source.x
        const dy = target.y - source.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const diff = (dist - linkDist) * linkStrength * alpha
        const fx = (dx / dist) * diff
        const fy = (dy / dist) * diff
        // Heavier hub moves slightly less than peripheral leaf (Obsidian/d3 bias)
        const totalDeg = source.degree + target.degree + 2
        const bias = (source.degree + 1) / totalDeg
        source.vx += fx * (1 - bias)
        source.vy += fy * (1 - bias)
        target.vx -= fx * bias
        target.vy -= fy * bias
      }

      // 3. Gentle center force + damped Verlet integration
      for (let i = 0; i < nCount; i++) {
        const n = nodes[i]
        if (n === draggingNode) {
          n.vx = 0
          n.vy = 0
          continue
        }
        const centerMul = n.isCurrent && mode === "local" ? 3.2 : 1.0
        n.vx -= n.x * centerXStrength * centerMul * alpha
        n.vy -= n.y * centerYStrength * centerMul * alpha
        n.vx *= velocityDecay
        n.vy *= velocityDecay
        n.x += n.vx
        n.y += n.vy
      }

      // Re-center whole graph around origin when not dragging (prevents slow drift)
      if (!draggingNode && mode === "global") {
        let meanX = 0
        let meanY = 0
        for (let i = 0; i < nCount; i++) {
          meanX += nodes[i].x
          meanY += nodes[i].y
        }
        meanX /= nCount
        meanY /= nCount
        for (let i = 0; i < nCount; i++) {
          nodes[i].x -= meanX * 0.08 * alpha
          nodes[i].y -= meanY * 0.08 * alpha
        }
      }
    }

    function computeFitTransform(): { panX: number; panY: number; zoom: number } {
      if (nodes.length === 0 || width < 40 || height < 40) {
        return { panX: 0, panY: 0, zoom: 1.0 }
      }
      if (nodes.length === 1) {
        return { panX: -nodes[0].x, panY: -nodes[0].y, zoom: 1.0 }
      }
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const n of nodes) {
        if (n.x < minX) minX = n.x
        if (n.x > maxX) maxX = n.x
        if (n.y < minY) minY = n.y
        if (n.y > maxY) maxY = n.y
      }
      const spanX = Math.max(90, maxX - minX)
      const spanY = Math.max(70, maxY - minY)
      const padX = Math.min(72, width * 0.16)
      const padY = Math.min(48, height * 0.18)
      const fitZoom = Math.max(
        0.5,
        Math.min(1.25, Math.min((width - padX * 2) / spanX, (height - padY * 2) / spanY)),
      )
      const midX = (minX + maxX) * 0.5
      const midY = (minY + maxY) * 0.5
      return {
        zoom: fitZoom,
        panX: -midX * fitZoom,
        panY: -midY * fitZoom,
      }
    }

    function autoFitCamera() {
      const fit = computeFitTransform()
      zoom = fit.zoom
      panX = fit.panX
      panY = fit.panY
      defaultZoom = fit.zoom
      defaultPanX = fit.panX
      defaultPanY = fit.panY
    }

    function draw() {
      if (!ctx) return
      const t = themeBlend

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      ctx.save()
      ctx.translate(width * 0.5 + panX, height * 0.5 + panY)
      ctx.scale(zoom, zoom)

      // Theme-interpolated Obsidian palette (smoothly tracks dark <-> light transition)
      const baseNodeR = Math.round(142 + (110 - 142) * t)
      const baseNodeG = Math.round(142 + (110 - 142) * t)
      const baseNodeB = Math.round(147 + (115 - 147) * t)

      const brightNodeR = Math.round(228 + (24 - 228) * t)
      const brightNodeG = Math.round(228 + (24 - 228) * t)
      const brightNodeB = Math.round(230 + (26 - 230) * t)

      const edgeRgb = t < 0.5 ? "255, 255, 255" : "0, 0, 0"
      const edgeBaseAlpha = 0.14
      const labelR = Math.round(218 + (17 - 218) * t)
      const labelG = Math.round(218 + (17 - 218) * t)
      const labelB = Math.round(218 + (17 - 218) * t)
      const accentR = 160
      const accentG = 70
      const accentB = 70

      const activeFocus = draggingNode ?? hoveredNode

      // 1. Draw edges with smooth highlight / dim crossfade
      ctx.lineCap = "round"
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i]
        const eh = e.highlight
        const dimBoth = Math.max(e.source.dim, e.target.dim)

        ctx.beginPath()
        ctx.moveTo(e.source.x, e.source.y)
        ctx.lineTo(e.target.x, e.target.y)
        ctx.lineWidth = (0.95 + eh * 0.55) / zoom

        if (eh > 0.02) {
          const a = edgeBaseAlpha * (1 - eh) + 0.68 * eh
          ctx.strokeStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${a.toFixed(3)})`
        } else {
          const a = edgeBaseAlpha * (1 - dimBoth * 0.72)
          ctx.strokeStyle = `rgba(${edgeRgb}, ${a.toFixed(3)})`
        }
        ctx.stroke()
      }

      // 2. Draw nodes with smooth Obsidian hover glow & scale
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        const isPrimaryFocus = n === activeFocus
        const h = n.highlight
        const d = n.dim

        const r = nodeRadius(n) * (1 + (isPrimaryFocus ? 0.24 : h * 0.08))

        // Subtle Obsidian halo ring on directly hovered/dragged node
        if (n.hoverLabel > 0.02) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, r + 3.2 / zoom, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${(0.18 * n.hoverLabel).toFixed(3)})`
          ctx.fill()
        }

        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)

        if (isPrimaryFocus || (n.isCurrent && d < 0.5)) {
          const alphaNode = 1 - d * 0.65
          ctx.fillStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${alphaNode.toFixed(3)})`
        } else {
          const nr = Math.round(baseNodeR + (brightNodeR - baseNodeR) * h)
          const ng = Math.round(baseNodeG + (brightNodeG - baseNodeG) * h)
          const nb = Math.round(baseNodeB + (brightNodeB - baseNodeB) * h)
          const na = 1 - d * 0.74
          ctx.fillStyle = `rgba(${nr}, ${ng}, ${nb}, ${na.toFixed(3)})`
        }
        ctx.fill()
      }

      // 3. Labels: hidden at default zoom; fade in smoothly when zoomed past threshold (or hovering a node)
      const zoomThreshold = defaultZoom * 1.15
      const zoomFadeSpan = defaultZoom * 0.42
      const zoomLabelAlpha = Math.max(0, Math.min(1, (zoom - zoomThreshold) / zoomFadeSpan))

      const hasHoverLabel = nodes.some((n) => n.hoverLabel > 0.01)
      if (zoomLabelAlpha > 0.01 || hasHoverLabel) {
        // Screen-stable crisp Inter label size (Obsidian text scaling)
        const screenFontPx = Math.max(10, Math.min(13, 10.5 * Math.pow(zoom, 0.25)))
        const worldFontPx = screenFontPx / zoom
        ctx.font = `400 ${worldFontPx.toFixed(2)}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "top"

        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i]
          const baseZoomAlpha = zoomLabelAlpha * (1 - n.dim * 0.75) * (n.isCurrent || n.highlight > 0.3 ? 0.94 : 0.74)
          const labelAlpha = Math.max(n.hoverLabel * 0.96, baseZoomAlpha)
          if (labelAlpha <= 0.01) continue

          const labelY = n.y + nodeRadius(n) + 5 / zoom
          ctx.fillStyle = `rgba(${labelR}, ${labelG}, ${labelB}, ${labelAlpha.toFixed(3)})`
          ctx.fillText(n.title, n.x, labelY)
        }
      }

      ctx.restore()
    }

    function updateVisualTransitions(now: number, dtSec: number): boolean {
      let needsMore = false

      // Smooth theme color interpolation
      if (themeBlend !== targetThemeBlend) {
        if (themeAnimStart === 0) {
          themeBlend = targetThemeBlend
        } else {
          if (themeAnimStart < 0) {
            themeAnimStart = now
          }
          const p = (now - themeAnimStart) / 500
          if (p >= 1) {
            themeBlend = targetThemeBlend
            themeAnimStart = 0
          } else {
            themeBlend =
              themeStartBlend + (targetThemeBlend - themeStartBlend) * easeStandardBezier(p)
            needsMore = true
          }
        }
      }

      // Smooth double-click camera reset animation
      if (camAnimStart > 0) {
        const p = (now - camAnimStart) / CAM_RESET_MS
        if (p >= 1) {
          panX = defaultPanX
          panY = defaultPanY
          zoom = defaultZoom
          camAnimStart = 0
        } else {
          const e = easeStandardBezier(p)
          panX = camAnimFromPanX + (defaultPanX - camAnimFromPanX) * e
          panY = camAnimFromPanY + (defaultPanY - camAnimFromPanY) * e
          zoom = camAnimFromZoom + (defaultZoom - camAnimFromZoom) * e
          needsMore = true
        }
      }

      // Smooth ~150ms Obsidian hover highlight & dimming crossfade
      const activeFocus = draggingNode ?? hoveredNode
      const focusNeighbors = activeFocus ? adj.get(activeFocus) : null
      const lerpRate = Math.min(1, dtSec * 16)

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        const isPrimary = n === activeFocus
        const isNeighbor = Boolean(focusNeighbors && focusNeighbors.has(n))
        const targetH = isPrimary || isNeighbor ? 1 : 0
        const targetD = activeFocus && !isPrimary && !isNeighbor ? 1 : 0
        const targetLabel = isPrimary ? 1 : 0

        if (Math.abs(n.highlight - targetH) > 0.005) {
          n.highlight += (targetH - n.highlight) * lerpRate
          needsMore = true
        } else {
          n.highlight = targetH
        }

        if (Math.abs(n.dim - targetD) > 0.005) {
          n.dim += (targetD - n.dim) * lerpRate
          needsMore = true
        } else {
          n.dim = targetD
        }

        if (Math.abs(n.hoverLabel - targetLabel) > 0.005) {
          n.hoverLabel += (targetLabel - n.hoverLabel) * lerpRate
          needsMore = true
        } else {
          n.hoverLabel = targetLabel
        }
      }

      for (let i = 0; i < edges.length; i++) {
        const e = edges[i]
        const isConnected =
          activeFocus !== null && (e.source === activeFocus || e.target === activeFocus)
        const targetEh = isConnected ? 1 : 0
        if (Math.abs(e.highlight - targetEh) > 0.005) {
          e.highlight += (targetEh - e.highlight) * lerpRate
          needsMore = true
        } else {
          e.highlight = targetEh
        }
      }

      return needsMore
    }

    function tick(now: number) {
      rafId = 0
      if (destroyed) return

      const dtSec = lastFrameMs === 0 ? 1 / 60 : Math.min(0.05, (now - lastFrameMs) * 0.001)
      lastFrameMs = now

      let physicsActive = false
      if (alpha > 0.004 || alphaTarget > 0) {
        alpha += (alphaTarget - alpha) * alphaDecay
        if (alpha < 0.004 && alphaTarget === 0) alpha = 0
        stepPhysics()
        physicsActive = alpha > 0.004 || alphaTarget > 0
      }

      const visualsActive = updateVisualTransitions(now, dtSec)
      draw()

      if (physicsActive || visualsActive) {
        rafId = requestAnimationFrame(tick)
      } else {
        lastFrameMs = 0
      }
    }

    function ensureLoop() {
      if (destroyed || rafId !== 0) return
      rafId = requestAnimationFrame(tick)
    }

    function resize() {
      const parent = canvas.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      if (rect.width < 10 || rect.height < 10) return

      const nextDpr = Math.min(window.devicePixelRatio || 1, 2)
      const nextPhysW = Math.round(rect.width * nextDpr)
      const nextPhysH = Math.round(rect.height * nextDpr)
      if (
        hasInitialFit &&
        canvas.width === nextPhysW &&
        canvas.height === nextPhysH &&
        width === rect.width &&
        height === rect.height
      ) {
        return
      }

      dpr = nextDpr
      width = rect.width
      height = rect.height
      canvas.width = nextPhysW
      canvas.height = nextPhysH

      if (!hasInitialFit) {
        hasInitialFit = true
        alpha = 1.0
        for (let i = 0; i < 140; i++) {
          stepPhysics()
          alpha *= 0.98
        }
        autoFitCamera()
        alpha = 0.14
        ensureLoop()
      } else {
        // Recompute default fit targets without disturbing user's current node positions
        const fit = computeFitTransform()
        defaultZoom = fit.zoom
        defaultPanX = fit.panX
        defaultPanY = fit.panY
        draw()
      }
    }

    function getLocalCoords(e: PointerEvent | WheelEvent | MouseEvent): [number, number] {
      const rect = canvas.getBoundingClientRect()
      return [e.clientX - rect.left, e.clientY - rect.top]
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return
      const [sx, sy] = getLocalCoords(e)
      activePointers.set(e.pointerId, { x: sx, y: sy })

      // Cancel camera reset animation on user input
      camAnimStart = 0

      if (activePointers.size === 2) {
        // Switch smoothly into 2-finger pinch zoom
        pressedNode = null
        draggingNode = null
        isPanning = false
        alphaTarget = 0
        const pts = Array.from(activePointers.values())
        lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
        return
      }

      downX = sx
      downY = sy
      lastX = sx
      lastY = sy
      movedDist = 0

      const hit = hitTest(sx, sy)
      if (hit) {
        pressedNode = hit
        hoveredNode = hit
        canvas.style.cursor = "pointer"
        ensureLoop()
      } else {
        isPanning = true
        canvas.style.cursor = "grabbing"
      }

      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {}
    }

    function onPointerMove(e: PointerEvent) {
      const [sx, sy] = getLocalCoords(e)
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: sx, y: sy })
      }

      // 2-finger touch pinch zoom
      if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values())
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
        if (lastPinchDist > 10 && dist > 10) {
          const midX = (pts[0].x + pts[1].x) * 0.5
          const midY = (pts[0].y + pts[1].y) * 0.5
          const factor = dist / lastPinchDist
          const nextZoom = Math.max(0.28, Math.min(4.5, zoom * factor))
          const ratio = nextZoom / zoom
          panX = midX - width * 0.5 - (midX - width * 0.5 - panX) * ratio
          panY = midY - height * 0.5 - (midY - height * 0.5 - panY) * ratio
          zoom = nextZoom
          draw()
        }
        lastPinchDist = dist
        return
      }

      const dx = sx - lastX
      const dy = sy - lastY
      lastX = sx
      lastY = sy
      movedDist = Math.hypot(sx - downX, sy - downY)

      // Engage node drag only after crossing click deadzone so clicks never nudge nodes
      if (pressedNode && !draggingNode && movedDist >= DRAG_DEADZONE) {
        draggingNode = pressedNode
        alphaTarget = 0.28
        alpha = Math.max(alpha, 0.35)
        canvas.style.cursor = "grabbing"
        ensureLoop()
      }

      if (draggingNode) {
        const [wx, wy] = screenToWorld(sx, sy)
        draggingNode.x = wx
        draggingNode.y = wy
        ensureLoop()
        return
      }

      if (isPanning) {
        panX += dx
        panY += dy
        draw()
        return
      }

      // Hover detection
      const hit = hitTest(sx, sy)
      if (hit !== hoveredNode) {
        hoveredNode = hit
        canvas.style.cursor = hoveredNode ? "pointer" : "grab"
        ensureLoop()
      }
    }

    function onPointerUp(e: PointerEvent) {
      activePointers.delete(e.pointerId)
      if (activePointers.size < 2) {
        lastPinchDist = 0
      }

      const clickedNode = pressedNode && !draggingNode && movedDist < DRAG_DEADZONE ? pressedNode : null
      const wasDragging = draggingNode !== null

      pressedNode = null
      draggingNode = null
      isPanning = false
      alphaTarget = 0

      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}

      const [sx, sy] = getLocalCoords(e)
      hoveredNode = e.pointerType === "mouse" ? hitTest(sx, sy) : null
      canvas.style.cursor = hoveredNode ? "pointer" : "grab"

      if (clickedNode) {
        const targetSlug = clickedNode.slug
        if (targetSlug !== currentSlug) {
          const url = resolveTargetUrl(targetSlug)
          onNavigate?.()
          if (typeof window.spaNavigate === "function") {
            window.spaNavigate(url, false)
          } else {
            window.location.assign(url)
          }
          return
        }
      }

      if (wasDragging) {
        alpha = Math.max(alpha, 0.22)
      }
      ensureLoop()
    }

    function onPointerLeave() {
      if (!draggingNode && !isPanning && hoveredNode) {
        hoveredNode = null
        canvas.style.cursor = "grab"
        ensureLoop()
      }
    }

    function onDoubleClick(e: MouseEvent) {
      const [sx, sy] = getLocalCoords(e)
      if (hitTest(sx, sy)) return
      // Smoothly reset pan & zoom back to fitted default view
      camAnimFromPanX = panX
      camAnimFromPanY = panY
      camAnimFromZoom = zoom
      camAnimStart = performance.now()
      ensureLoop()
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      camAnimStart = 0
      const [sx, sy] = getLocalCoords(e)
      // Smooth exponential zoom proportional to deltaY (handles both trackpads & mouse wheels smoothly)
      const unitScale = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? 120 : 1
      const clampedDelta = Math.max(-120, Math.min(120, e.deltaY * unitScale))
      const factor = Math.exp(-clampedDelta * 0.0024)
      const nextZoom = Math.max(0.28, Math.min(4.5, zoom * factor))
      const ratio = nextZoom / zoom
      panX = sx - width * 0.5 - (sx - width * 0.5 - panX) * ratio
      panY = sy - height * 0.5 - (sy - height * 0.5 - panY) * ratio
      zoom = nextZoom
      draw()
    }

    function onTheme(e: Event) {
      const custom = e as CustomEvent<{ instant?: boolean }>
      themeStartBlend = themeBlend
      targetThemeBlend = isDark() ? 0.0 : 1.0
      if (custom?.detail?.instant) {
        themeBlend = targetThemeBlend
        themeAnimStart = 0
        draw()
      } else {
        themeAnimStart = -1
        ensureLoop()
      }
    }

    canvas.style.cursor = "grab"
    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointercancel", onPointerUp)
    canvas.addEventListener("pointerleave", onPointerLeave)
    canvas.addEventListener("dblclick", onDoubleClick)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    document.addEventListener("themechange", onTheme)

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
      ro = new ResizeObserver(() => resize())
      ro.observe(canvas.parentElement)
    }
    window.addEventListener("resize", resize)

    resize()

    return () => {
      destroyed = true
      if (rafId !== 0) cancelAnimationFrame(rafId)
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointercancel", onPointerUp)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      canvas.removeEventListener("dblclick", onDoubleClick)
      canvas.removeEventListener("wheel", onWheel)
      document.removeEventListener("themechange", onTheme)
      window.removeEventListener("resize", resize)
      ro?.disconnect()
    }
  }

  function closeModal() {
    const modal = document.getElementById("gardenGraphModal")
    if (modal) {
      modal.classList.remove("is-open")
      modal.setAttribute("aria-hidden", "true")
    }
    if (modalDestroy) {
      modalDestroy()
      modalDestroy = null
    }
  }

  async function openGlobalModal() {
    let modal = document.getElementById("gardenGraphModal")
    if (!modal) {
      modal = document.createElement("div")
      modal.id = "gardenGraphModal"
      modal.className = "graph-modal"
      modal.setAttribute("aria-hidden", "true")
      modal.innerHTML = `
        <div class="graph-modal-backdrop" data-close-graph></div>
        <div class="graph-modal-panel" role="dialog" aria-label="Global Graph View">
          <div class="graph-modal-header">
            <span class="drawer-title">Graph View</span>
            <button type="button" class="util-icon-btn" data-close-graph aria-label="Close Graph View" title="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="graph-modal-body">
            <canvas class="graph-canvas" id="gardenGraphModalCanvas"></canvas>
          </div>
        </div>
      `
      modal.addEventListener("click", (e) => {
        const target = e.target as HTMLElement | null
        if (target?.closest("[data-close-graph]")) {
          closeModal()
        }
      })
      document.body.appendChild(modal)
    }

    const canvas = document.getElementById("gardenGraphModalCanvas") as HTMLCanvasElement | null
    if (!canvas) return

    modal.classList.add("is-open")
    modal.setAttribute("aria-hidden", "false")

    if (modalDestroy) {
      modalDestroy()
      modalDestroy = null
    }

    try {
      const index = await fetchData
      const currentSlug = normalizeSlug(document.body.dataset.slug || "index")
      const { nodes, edges } = buildGraphData(index, currentSlug, "global")
      modalDestroy = mountGraph(canvas, nodes, edges, currentSlug, "global", closeModal)
    } catch (err) {
      console.error("Failed to render modal graph:", err)
    }
  }

  async function renderSectionGraph() {
    if (activeDestroy) {
      activeDestroy()
      activeDestroy = null
    }
    closeModal()

    const section = document.getElementById("graphSection")
    const canvas = section?.querySelector<HTMLCanvasElement>(".graph-canvas")
    if (!section || !canvas) return

    const mode = section.dataset.graphMode === "global" ? "global" : "local"
    const currentSlug = normalizeSlug(document.body.dataset.slug || "index")

    try {
      const index = await fetchData
      if (!document.body.contains(canvas)) return
      const { nodes, edges } = buildGraphData(index, currentSlug, mode)
      activeDestroy = mountGraph(canvas, nodes, edges, currentSlug, mode)
    } catch (err) {
      console.error("Failed to render graph:", err)
    }
  }

  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null
    if (target?.closest("#graphExpandBtn")) {
      openGlobalModal()
    }
  })

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal()
    }
  })

  document.addEventListener("nav", () => {
    renderSectionGraph()
  })

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderSectionGraph, { once: true })
  } else {
    renderSectionGraph()
  }
})()
