import { FullSlug, SimpleSlug, resolveRelative, simplifySlug } from "../../../util/path"

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
  id: string
  slug: FullSlug
  title: string
  x: number
  y: number
  vx: number
  vy: number
  degree: number
  isCurrent: boolean
}

interface GraphEdge {
  source: GraphNode
  target: GraphNode
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
      if (full === "index") {
        simpleToFull.set("/", full)
        simpleToFull.set("", full)
      }
      slugMap.set(full, {
        slug: full,
        title: entry.title || full.split("/").pop() || full,
        links: (entry.links ?? []).map((l) => String(l)),
      })
    }

    // Build undirected adjacency and unique edge list
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
    const list = Array.from(allowedSlugs)
    const count = list.length

    list.forEach((slug, i) => {
      const info = slugMap.get(slug)!
      const angle = (i / Math.max(1, count)) * Math.PI * 2
      const radius = slug === currentSlug && mode === "local" ? 0 : 48 + (i % 3) * 18
      nodeMap.set(slug, {
        id: slug,
        slug,
        title: info.title,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        degree: 0,
        isCurrent: slug === currentSlug,
      })
    })

    const edges: GraphEdge[] = []
    for (const [a, b] of edgePairs) {
      const na = nodeMap.get(a)
      const nb = nodeMap.get(b)
      if (na && nb) {
        edges.push({ source: na, target: nb })
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
    let height = 240
    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    // Camera pan & zoom
    let panX = 0
    let panY = 0
    let zoom = mode === "local" ? 1.12 : 1.0
    let defaultZoom = zoom

    // Interaction state
    let hoveredNode: GraphNode | null = null
    let draggedNode: GraphNode | null = null
    let isPanning = false
    let lastPointerX = 0
    let lastPointerY = 0
    let movedDistance = 0

    // Adjacency for fast hover highlight
    const adj = new Map<GraphNode, Set<GraphNode>>()
    for (const n of nodes) adj.set(n, new Set())
    for (const e of edges) {
      adj.get(e.source)!.add(e.target)
      adj.get(e.target)!.add(e.source)
    }

    let alpha = 1.0
    let rafId = 0
    let destroyed = false

    function resize() {
      const parent = canvas.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      if (rect.width < 10 || rect.height < 10) return
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      wake(0.15)
    }

    function screenToWorld(sx: number, sy: number): [number, number] {
      return [(sx - width * 0.5 - panX) / zoom, (sy - height * 0.5 - panY) / zoom]
    }

    function nodeRadius(n: GraphNode): number {
      const base = n.isCurrent ? 5.2 : 3.4 + Math.min(3.0, n.degree * 0.45)
      return base
    }

    function hitTest(sx: number, sy: number): GraphNode | null {
      const [wx, wy] = screenToWorld(sx, sy)
      let best: GraphNode | null = null
      let bestDistSq = Infinity
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i]
        const hitR = (nodeRadius(n) + 7) / zoom
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
      const repulsion = isLarge ? 26000 : mode === "local" ? 15000 : 14000
      const linkDist = isLarge ? 140 : mode === "local" ? 105 : 108
      const linkStrength = 0.042
      const gravX = 0.0042
      const gravY = 0.0095

      // Pairwise repulsion (strong enough that node titles breathe with zero overlap)
      for (let i = 0; i < nCount; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nCount; j++) {
          const b = nodes[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          let distSq = dx * dx + dy * dy
          if (distSq < 4) {
            dx = (Math.random() - 0.5) * 4
            dy = (Math.random() - 0.5) * 4
            distSq = dx * dx + dy * dy + 4
          }
          const force = Math.min(28, (repulsion / distSq) * alpha * 0.09)
          const invDist = 1 / Math.sqrt(distSq)
          const fx = dx * invDist * force
          const fy = dy * invDist * force
          a.vx -= fx
          a.vy -= fy
          b.vx += fx
          b.vy += fy
        }
      }

      // Spring attraction along edges
      for (let i = 0; i < edges.length; i++) {
        const { source, target } = edges[i]
        const dx = target.x - source.x
        const dy = target.y - source.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const diff = (dist - linkDist) * linkStrength * alpha
        const fx = (dx / dist) * diff
        const fy = (dy / dist) * diff
        source.vx += fx
        source.vy += fy
        target.vx -= fx
        target.vy -= fy
      }

      // Aspect-aware centering gravity + velocity damping
      for (let i = 0; i < nCount; i++) {
        const n = nodes[i]
        if (n === draggedNode) {
          n.vx = 0
          n.vy = 0
          continue
        }
        const mul = n.isCurrent && mode === "local" ? 2.6 : 1.0
        n.vx = (n.vx - n.x * gravX * mul * alpha) * 0.82
        n.vy = (n.vy - n.y * gravY * mul * alpha) * 0.82
        n.x += n.vx
        n.y += n.vy
      }
    }

    function autoFitCamera() {
      if (nodes.length === 0 || width < 40 || height < 40) return
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
      const spanX = Math.max(80, maxX - minX)
      const spanY = Math.max(60, maxY - minY)
      const padX = Math.min(110, width * 0.22)
      const padY = Math.min(68, height * 0.24)
      const fitZoomX = (width - padX * 2) / spanX
      const fitZoomY = (height - padY * 2) / spanY
      zoom = Math.max(0.55, Math.min(1.25, Math.min(fitZoomX, fitZoomY)))
      defaultZoom = zoom
      const midX = (minX + maxX) * 0.5
      const midY = (minY + maxY) * 0.5
      panX = -midX * zoom
      panY = -midY * zoom
    }

    function draw() {
      if (!ctx) return
      const dark = isDark()

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      ctx.save()
      ctx.translate(width * 0.5 + panX, height * 0.5 + panY)
      ctx.scale(zoom, zoom)

      const accentColor = "rgb(160, 70, 70)"
      const nodeBaseColor = dark ? "#8e8e93" : "#6e6e73"
      const nodeDimColor = dark ? "rgba(142, 142, 147, 0.24)" : "rgba(110, 110, 115, 0.24)"
      const edgeBaseColor = dark ? "rgba(255, 255, 255, 0.13)" : "rgba(0, 0, 0, 0.13)"
      const edgeActiveColor = dark ? "rgba(190, 92, 92, 0.68)" : "rgba(160, 70, 70, 0.62)"
      const edgeDimColor = dark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.04)"
      const labelRgb = dark ? "218, 218, 218" : "17, 17, 17"

      const activeFocus = draggedNode ?? hoveredNode
      const focusNeighbors = activeFocus ? adj.get(activeFocus) : null

      // Draw edges
      ctx.lineCap = "round"
      for (let i = 0; i < edges.length; i++) {
        const { source, target } = edges[i]
        const isConnected =
          activeFocus !== null && (source === activeFocus || target === activeFocus)
        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)
        ctx.lineWidth = (isConnected ? 1.35 : 0.95) / zoom
        ctx.strokeStyle = activeFocus
          ? isConnected
            ? edgeActiveColor
            : edgeDimColor
          : edgeBaseColor
        ctx.stroke()
      }

      // Draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        const isFocused = n === activeFocus
        const isNeighbor = Boolean(focusNeighbors && focusNeighbors.has(n))
        const isDimmed = Boolean(activeFocus && !isFocused && !isNeighbor)

        const r = nodeRadius(n) * (isFocused ? 1.22 : 1.0)
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        if (isFocused || (n.isCurrent && !isDimmed)) {
          ctx.fillStyle = accentColor
        } else if (isNeighbor) {
          ctx.fillStyle = dark ? "#dadada" : "#1c1c1e"
        } else if (isDimmed) {
          ctx.fillStyle = nodeDimColor
        } else {
          ctx.fillStyle = nodeBaseColor
        }
        ctx.fill()
      }

      // Labels hidden at default zoom — fade in smoothly only when zoomed in (or hovering a node)
      const zoomThreshold = defaultZoom * 1.18
      const zoomFadeSpan = defaultZoom * 0.45
      const zoomLabelAlpha = Math.max(0, Math.min(1, (zoom - zoomThreshold) / zoomFadeSpan))

      if (zoomLabelAlpha > 0.01 || activeFocus) {
        const fontSize = Math.max(8.5, Math.min(11.5, 10.5 / Math.sqrt(zoom)))
        ctx.font = `400 ${fontSize}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "top"

        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i]
          const isFocused = n === activeFocus
          const isNeighbor = Boolean(focusNeighbors && focusNeighbors.has(n))
          const isDimmed = Boolean(activeFocus && !isFocused && !isNeighbor)

          let textAlpha = 0
          if (isFocused) {
            textAlpha = 0.96
          } else if (zoomLabelAlpha > 0.01) {
            const base = isDimmed ? 0.2 : isNeighbor || n.isCurrent ? 0.95 : 0.72
            textAlpha = base * zoomLabelAlpha
          }

          if (textAlpha <= 0.01) continue

          const labelY = n.y + nodeRadius(n) + 5 / zoom
          ctx.fillStyle = `rgba(${labelRgb}, ${textAlpha.toFixed(3)})`
          ctx.fillText(n.title, n.x, labelY)
        }
      }

      ctx.restore()
    }

    function tick() {
      rafId = 0
      if (destroyed) return

      if (alpha > 0.008 || draggedNode) {
        stepPhysics()
        if (!draggedNode) {
          alpha *= 0.965
        } else {
          alpha = Math.max(alpha, 0.28)
        }
        draw()
        rafId = requestAnimationFrame(tick)
      } else {
        draw()
      }
    }

    function wake(minAlpha = 0.25) {
      if (destroyed) return
      alpha = Math.max(alpha, minAlpha)
      if (rafId === 0) {
        rafId = requestAnimationFrame(tick)
      }
    }

    // Pre-settle after measuring container so initial render is spread out & balanced
    function settleAndFit() {
      alpha = 1.0
      for (let i = 0; i < 110; i++) {
        stepPhysics()
        alpha *= 0.985
      }
      autoFitCamera()
      alpha = 0.25
    }

    function getLocalCoords(e: PointerEvent | WheelEvent): [number, number] {
      const rect = canvas.getBoundingClientRect()
      return [e.clientX - rect.left, e.clientY - rect.top]
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return
      const [sx, sy] = getLocalCoords(e)
      lastPointerX = sx
      lastPointerY = sy
      movedDistance = 0

      const hit = hitTest(sx, sy)
      if (hit) {
        draggedNode = hit
        canvas.style.cursor = "grabbing"
        wake(0.35)
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
      const dx = sx - lastPointerX
      const dy = sy - lastPointerY
      lastPointerX = sx
      lastPointerY = sy
      movedDistance += Math.hypot(dx, dy)

      if (draggedNode) {
        const [wx, wy] = screenToWorld(sx, sy)
        draggedNode.x = wx
        draggedNode.y = wy
        wake(0.35)
        return
      }

      if (isPanning) {
        panX += dx
        panY += dy
        draw()
        return
      }

      const hit = hitTest(sx, sy)
      if (hit !== hoveredNode) {
        hoveredNode = hit
        canvas.style.cursor = hoveredNode ? "pointer" : "grab"
        draw()
      }
    }

    function onPointerUp(e: PointerEvent) {
      const wasDragged = draggedNode
      const wasClick = movedDistance < 6
      draggedNode = null
      isPanning = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}

      const [sx, sy] = getLocalCoords(e)
      hoveredNode = hitTest(sx, sy)
      canvas.style.cursor = hoveredNode ? "pointer" : "grab"

      if (wasClick && wasDragged) {
        const targetSlug = wasDragged.slug
        if (targetSlug !== currentSlug) {
          const rel = resolveRelative(currentSlug, targetSlug)
          const url = new URL(rel, window.location.href)
          onNavigate?.()
          if (typeof window.spaNavigate === "function") {
            window.spaNavigate(url, false)
          } else {
            window.location.assign(url)
          }
        }
      } else {
        wake(0.15)
      }
    }

    function onPointerLeave() {
      if (!draggedNode && !isPanning && hoveredNode) {
        hoveredNode = null
        canvas.style.cursor = "grab"
        draw()
      }
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const [sx, sy] = getLocalCoords(e)
      const factor = e.deltaY < 0 ? 1.1 : 0.91
      const nextZoom = Math.max(0.45, Math.min(2.8, zoom * factor))
      const scaleChange = nextZoom / zoom
      panX = sx - width * 0.5 - (sx - width * 0.5 - panX) * scaleChange
      panY = sy - height * 0.5 - (sy - height * 0.5 - panY) * scaleChange
      zoom = nextZoom
      draw()
    }

    const onTheme = () => draw()

    canvas.style.cursor = "grab"
    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointercancel", onPointerUp)
    canvas.addEventListener("pointerleave", onPointerLeave)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    document.addEventListener("themechange", onTheme)

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
      ro = new ResizeObserver(() => resize())
      ro.observe(canvas.parentElement)
    }
    window.addEventListener("resize", resize)

    resize()
    settleAndFit()
    wake(0.25)

    return () => {
      destroyed = true
      if (rafId !== 0) cancelAnimationFrame(rafId)
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointercancel", onPointerUp)
      canvas.removeEventListener("pointerleave", onPointerLeave)
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
      // Guard against stale async mount if user navigated again quickly
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
