export interface GardenIndexEntry {
  slug?: string
  filePath?: string
  title?: string
  links?: string[]
  tags?: string[]
  content?: string
}

export type GardenContentIndex = Record<string, GardenIndexEntry>

export function getBasePath(): string {
  const raw = document.body?.dataset?.basepath ?? ""
  return raw.replace(/\/$/, "")
}

export function buildPageUrl(slug: string): string {
  const base = getBasePath()
  const cleanSlug = slug === "index" ? "" : slug
  const path = cleanSlug ? `${base}/${cleanSlug}` : `${base}/`
  return path.startsWith("/") ? path : `/${path}`
}

export function formatFolderLabel(slug: string): string {
  const parts = slug.split("/")
  if (parts.length <= 1) return "pinned"
  return parts.slice(0, -1).join("/")
}

export function setDrawerOpen(open: boolean): void {
  const leftDrawer = document.getElementById("leftDrawer")
  const drawerBackdrop = document.getElementById("drawerBackdrop")
  const menuDrawerBtn = document.getElementById("menuDrawerBtn")
  if (!leftDrawer || !drawerBackdrop) return

  leftDrawer.classList.toggle("is-open", open)
  drawerBackdrop.classList.toggle("is-open", open)
  leftDrawer.setAttribute("aria-hidden", open ? "false" : "true")
  drawerBackdrop.setAttribute("aria-hidden", open ? "false" : "true")
  menuDrawerBtn?.setAttribute("aria-expanded", open ? "true" : "false")
}

export function toggleDrawer(): void {
  const leftDrawer = document.getElementById("leftDrawer")
  const isOpen = leftDrawer?.classList.contains("is-open") ?? false
  setDrawerOpen(!isOpen)
}
