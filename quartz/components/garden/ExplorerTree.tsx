import { QuartzPluginData } from "../../plugins/vfile"
import { FullSlug, resolveRelative } from "../../util/path"

interface TreeFolder {
  type: "folder"
  id: string
  label: string
  children: TreeNode[]
}

interface TreePage {
  type: "page"
  slug: FullSlug
  title: string
  order: number
}

type TreeNode = TreeFolder | TreePage

const PREFERRED_FOLDER_ORDER: Record<string, number> = {
  notes: 1,
  essays: 2,
  archive: 3,
}

function getFolderSortKey(name: string): [number, string] {
  const lower = name.toLowerCase()
  const preferred = PREFERRED_FOLDER_ORDER[lower]
  return [preferred ?? 100, lower]
}

function buildExplorerTree(allFiles: QuartzPluginData[]): TreeNode[] {
  const rootPages: TreePage[] = []
  const folderMap = new Map<string, TreeFolder>()

  function getOrCreateFolder(parts: string[]): TreeFolder {
    let parentChildren: TreeNode[] | null = null
    let currentPath = ""
    let currentFolder!: TreeFolder

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      let existing = folderMap.get(currentPath)
      if (!existing) {
        existing = {
          type: "folder",
          id: currentPath,
          label: part,
          children: [],
        }
        folderMap.set(currentPath, existing)
        if (parentChildren) {
          parentChildren.push(existing)
        }
      }
      currentFolder = existing
      parentChildren = currentFolder.children
    }

    return currentFolder
  }

  for (const file of allFiles) {
    const slug = file.slug
    if (!slug) continue
    if (slug === "404" || slug.startsWith("tags/")) continue

    const title = file.frontmatter?.title ?? slug.split("/").pop() ?? slug
    const rawOrder = file.frontmatter?.order
    const order = typeof rawOrder === "number" ? rawOrder : Number.POSITIVE_INFINITY

    const parts = slug.split("/")
    // Skip empty auto-generated folder stubs if they end with /index without a real filePath
    if (parts.length > 1 && parts[parts.length - 1] === "index" && !file.filePath) {
      continue
    }

    if (parts.length === 1) {
      rootPages.push({
        type: "page",
        slug,
        title,
        order: slug === "index" ? -1000 : order,
      })
    } else {
      const folderParts = parts.slice(0, -1)
      const folder = getOrCreateFolder(folderParts)
      folder.children.push({
        type: "page",
        slug,
        title,
        order,
      })
    }
  }

  function sortNodes(nodes: TreeNode[]): TreeNode[] {
    return nodes
      .map((node) => {
        if (node.type === "folder") {
          return { ...node, children: sortNodes(node.children) }
        }
        return node
      })
      .sort((a, b) => {
        // Pages appear before folders at the same level
        if (a.type !== b.type) {
          return a.type === "page" ? -1 : 1
        }
        if (a.type === "page" && b.type === "page") {
          if (a.order !== b.order) return a.order - b.order
          return a.title.localeCompare(b.title)
        }
        if (a.type === "folder" && b.type === "folder") {
          const [aRank, aName] = getFolderSortKey(a.label)
          const [bRank, bName] = getFolderSortKey(b.label)
          if (aRank !== bRank) return aRank - bRank
          return aName.localeCompare(bName)
        }
        return 0
      })
  }

  const topFolders = Array.from(folderMap.values()).filter((f) => !f.id.includes("/"))
  return sortNodes([...rootPages, ...topFolders])
}

function renderNodes(nodes: TreeNode[], currentSlug: FullSlug) {
  return nodes.map((node) => {
    if (node.type === "page") {
      const isActive = node.slug === currentSlug
      return (
        <li>
          <a
            href={resolveRelative(currentSlug, node.slug)}
            class={`explorer-link${isActive ? " is-active" : ""}`}
            data-slug={node.slug}
          >
            {node.title}
          </a>
        </li>
      )
    }

    const defaultCollapsed = node.id.toLowerCase() === "archive"
    return (
      <li
        class={`explorer-folder${defaultCollapsed ? " is-collapsed" : ""}`}
        data-folder-id={node.id}
      >
        <button
          type="button"
          class="folder-toggle"
          aria-expanded={defaultCollapsed ? "false" : "true"}
        >
          <svg
            class="folder-chevron"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span>{node.label}</span>
        </button>
        <ul class="folder-children">{renderNodes(node.children, currentSlug)}</ul>
      </li>
    )
  })
}

export function ExplorerTree({
  allFiles,
  currentSlug,
}: {
  allFiles: QuartzPluginData[]
  currentSlug: FullSlug
}) {
  const tree = buildExplorerTree(allFiles)
  return <ul class="explorer-list">{renderNodes(tree, currentSlug)}</ul>
}
