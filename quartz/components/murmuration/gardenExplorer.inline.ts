import { buildPageUrl, setDrawerOpen, type GardenContentIndex } from "./navUtils"

interface TreeNode {
  name: string
  slug?: string
  title?: string
  children: Map<string, TreeNode>
}

const folderState: Record<string, boolean> = { archive: true }

function createChevronSvg(): SVGSVGElement {
  const svgNS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(svgNS, "svg")
  svg.setAttribute("class", "folder-chevron")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "2")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  svg.setAttribute("aria-hidden", "true")

  const poly = document.createElementNS(svgNS, "polyline")
  poly.setAttribute("points", "6 9 12 15 18 9")
  svg.appendChild(poly)
  return svg
}

function buildTreeFromIndex(index: GardenContentIndex): TreeNode {
  const root: TreeNode = { name: "", children: new Map() }

  for (const [slug, entry] of Object.entries(index)) {
    // Skip auto-generated tag pages and folder index pages from cluttering the explorer
    if (slug.startsWith("tags/")) continue
    const parts = slug.split("/").filter(Boolean)
    if (parts.length === 0) continue

    let curr = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLeaf = i === parts.length - 1
      if (!curr.children.has(part)) {
        curr.children.set(part, {
          name: part,
          children: new Map(),
        })
      }
      const node = curr.children.get(part)!
      if (isLeaf) {
        node.slug = slug
        node.title = entry.title ?? part.replace(/-/g, " ")
      }
      curr = node
    }
  }

  return root
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    // Pin index first
    if (a.slug === "index") return -1
    if (b.slug === "index") return 1
    // Files before folders, or folders after root pinned pages (matching good.html: About Me, then notes, essays, archive)
    const aIsFolder = a.children.size > 0 && !a.slug
    const bIsFolder = b.children.size > 0 && !b.slug
    if (aIsFolder !== bIsFolder) return aIsFolder ? 1 : -1
    return (a.title ?? a.name).localeCompare(b.title ?? b.name)
  })
}

function navigateToSlug(slug: string) {
  const targetHref = buildPageUrl(slug)
  const targetUrl = new URL(targetHref, window.location.origin)
  setDrawerOpen(false)
  if (typeof window.spaNavigate === "function") {
    window.spaNavigate(targetUrl, false)
  } else {
    window.location.assign(targetUrl.href)
  }
}

function renderNodeList(
  nodes: TreeNode[],
  activeSlug: string,
  folderPrefix: string,
  onToggle: () => void,
): HTMLUListElement {
  const ul = document.createElement("ul")
  ul.className = folderPrefix ? "folder-children" : "explorer-list"

  for (const node of sortNodes(nodes)) {
    const hasChildren = node.children.size > 0
    if (!hasChildren && node.slug) {
      const li = document.createElement("li")
      const btn = document.createElement("button")
      btn.type = "button"
      btn.className = "explorer-link" + (node.slug === activeSlug ? " is-active" : "")
      btn.textContent = node.title ?? node.name
      btn.addEventListener("click", () => navigateToSlug(node.slug!))
      li.appendChild(btn)
      ul.appendChild(li)
    } else if (hasChildren) {
      const folderKey = folderPrefix ? `${folderPrefix}/${node.name}` : node.name
      const isCollapsed = Boolean(folderState[folderKey] ?? folderState[node.name])

      const li = document.createElement("li")
      li.className = "explorer-folder" + (isCollapsed ? " is-collapsed" : "")

      const toggleBtn = document.createElement("button")
      toggleBtn.type = "button"
      toggleBtn.className = "folder-toggle"
      toggleBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true")
      toggleBtn.appendChild(createChevronSvg())

      const labelSpan = document.createElement("span")
      labelSpan.textContent = node.name
      toggleBtn.appendChild(labelSpan)

      toggleBtn.addEventListener("click", () => {
        folderState[folderKey] = !isCollapsed
        if (!folderPrefix) {
          folderState[node.name] = !isCollapsed
        }
        onToggle()
      })

      li.appendChild(toggleBtn)
      li.appendChild(
        renderNodeList(Array.from(node.children.values()), activeSlug, folderKey, onToggle),
      )
      ul.appendChild(li)
    }
  }

  return ul
}

async function setupGardenExplorer() {
  const drawerMount = document.getElementById("drawerExplorerMount")
  const bottomMount = document.getElementById("bottomExplorerMount")
  const drawerCloseBtn = document.getElementById("drawerCloseBtn")
  const drawerBackdrop = document.getElementById("drawerBackdrop")
  const activeSlug = document.body?.dataset?.slug ?? "index"

  let index: GardenContentIndex = {}
  try {
    index = ((await fetchData) as unknown as GardenContentIndex) ?? {}
  } catch {
    index = {}
  }

  const tree = buildTreeFromIndex(index)

  function syncExplorers() {
    const rootNodes = Array.from(tree.children.values())
    if (drawerMount) {
      drawerMount.textContent = ""
      drawerMount.appendChild(renderNodeList(rootNodes, activeSlug, "", syncExplorers))
    }
    if (bottomMount) {
      bottomMount.textContent = ""
      bottomMount.appendChild(renderNodeList(rootNodes, activeSlug, "", syncExplorers))
    }
  }

  syncExplorers()

  const onClose = () => setDrawerOpen(false)
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setDrawerOpen(false)
    }
  }

  drawerCloseBtn?.addEventListener("click", onClose)
  drawerBackdrop?.addEventListener("click", onClose)
  document.addEventListener("keydown", onKeydown)

  window.addCleanup(() => {
    drawerCloseBtn?.removeEventListener("click", onClose)
    drawerBackdrop?.removeEventListener("click", onClose)
    document.removeEventListener("keydown", onKeydown)
  })
}

document.addEventListener("nav", () => {
  setDrawerOpen(false)
  void setupGardenExplorer()
})
