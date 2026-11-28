import { FullSlug, resolveRelative } from "../../../util/path"

interface ContentEntry {
  slug: FullSlug
  title: string
  content: string
  tags?: string[]
  filePath?: string
}

type ContentIndex = Record<string, ContentEntry>

declare const fetchData: Promise<ContentIndex>

;(function () {
  const win = window as unknown as { __gardenUiInitialized?: boolean }
  if (win.__gardenUiInitialized) return

  function getFolderLabel(slug: string): string {
    const clean = slug.replace(/^\/+|\/+$/g, "")
    const slashIdx = clean.lastIndexOf("/")
    if (slashIdx === -1) return "pinned"
    const folder = clean.slice(0, slashIdx)
    return folder || "pinned"
  }

  function normalizeSlug(slug: string): string {
    const clean = slug.replace(/^\/+|\/+$/g, "")
    return clean === "" ? "index" : clean
  }

  function initGardenUI() {
    win.__gardenUiInitialized = true

    const menuDrawerBtn = document.getElementById("menuDrawerBtn")
    const leftDrawer = document.getElementById("leftDrawer")
    const drawerBackdrop = document.getElementById("drawerBackdrop")
    const drawerCloseBtn = document.getElementById("drawerCloseBtn")

    const searchInput = document.getElementById("explorerSearch") as HTMLInputElement | null
    const searchDropdown = document.getElementById("searchDropdown")
    const themeToggleBtn = document.getElementById("themeToggleBtn")
    const readerToggleBtn = document.getElementById("readerToggleBtn")
    const textPane = document.getElementById("textPane")

    // --- Drawer Controls ---
    function setDrawerOpen(open: boolean) {
      if (!leftDrawer || !drawerBackdrop || !menuDrawerBtn) return
      leftDrawer.classList.toggle("is-open", open)
      drawerBackdrop.classList.toggle("is-open", open)
      leftDrawer.setAttribute("aria-hidden", open ? "false" : "true")
      drawerBackdrop.setAttribute("aria-hidden", open ? "false" : "true")
      menuDrawerBtn.setAttribute("aria-expanded", open ? "true" : "false")
    }

    if (menuDrawerBtn) {
      menuDrawerBtn.addEventListener("click", () => {
        const isOpen = Boolean(leftDrawer && leftDrawer.classList.contains("is-open"))
        setDrawerOpen(!isOpen)
      })
    }
    if (drawerCloseBtn) {
      drawerCloseBtn.addEventListener("click", () => setDrawerOpen(false))
    }
    if (drawerBackdrop) {
      drawerBackdrop.addEventListener("click", () => setDrawerOpen(false))
    }

    // --- Folder Collapse State (Synchronized Between Drawer & Bottom Explorer) ---
    const FOLDER_STATE_KEY = "garden-folder-state"
    function loadFolderState(): Record<string, boolean> {
      try {
        const raw = sessionStorage.getItem(FOLDER_STATE_KEY)
        if (raw) return JSON.parse(raw)
      } catch {}
      return { archive: true }
    }

    const folderState: Record<string, boolean> = loadFolderState()

    function saveFolderState() {
      try {
        sessionStorage.setItem(FOLDER_STATE_KEY, JSON.stringify(folderState))
      } catch {}
    }

    function applyFolderStates(root: Document | Element = document) {
      const folders = root.querySelectorAll<HTMLElement>(".explorer-folder[data-folder-id]")
      folders.forEach((folderEl) => {
        const id = folderEl.dataset.folderId
        if (!id) return
        const isCollapsed = id in folderState ? Boolean(folderState[id]) : id === "archive"
        folderEl.classList.toggle("is-collapsed", isCollapsed)
        const btn = folderEl.querySelector<HTMLButtonElement>(":scope > .folder-toggle")
        if (btn) {
          btn.setAttribute("aria-expanded", isCollapsed ? "false" : "true")
        }
      })
    }

    function syncActiveLinks() {
      const currentSlug = normalizeSlug(document.body.dataset.slug || "index") as FullSlug
      const links = document.querySelectorAll<HTMLAnchorElement>(".explorer-link[data-slug]")
      links.forEach((link) => {
        const linkSlug = normalizeSlug(link.dataset.slug || "") as FullSlug
        link.classList.toggle("is-active", linkSlug === currentSlug)
        link.setAttribute("href", resolveRelative(currentSlug, linkSlug))
      })
      const homeBtn = document.getElementById("homeBtn") as HTMLAnchorElement | null
      if (homeBtn) {
        homeBtn.setAttribute("href", resolveRelative(currentSlug, "index" as FullSlug))
      }
    }

    // Delegated folder toggle click handler across both Drawer and Bottom Explorer
    document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement | null
      if (!target) return

      const toggleBtn = target.closest<HTMLButtonElement>(".folder-toggle")
      if (toggleBtn) {
        const folderEl = toggleBtn.closest<HTMLElement>(".explorer-folder[data-folder-id]")
        const folderId = folderEl?.dataset.folderId
        if (folderId) {
          const currentlyCollapsed = folderEl.classList.contains("is-collapsed")
          folderState[folderId] = !currentlyCollapsed
          saveFolderState()
          applyFolderStates(document)
        }
        return
      }

      if (searchDropdown && !target.closest(".search-wrapper")) {
        closeSearchDropdown()
      }
    })

    // --- Live Search Dropdown (Powered by Quartz contentIndex.json) ---
    let indexedPages: Array<{
      slug: FullSlug
      title: string
      folder: string
      searchBlob: string
    }> = []
    let indexReady = false

    async function ensureIndex() {
      if (indexReady) return
      try {
        const data = await fetchData
        indexedPages = Object.entries(data).map(([slug, entry]) => {
          const title = entry.title || slug
          const folder = getFolderLabel(slug)
          const plain = (entry.content || "").toLowerCase()
          const tags = (entry.tags || []).join(" ").toLowerCase()
          return {
            slug: slug as FullSlug,
            title,
            folder,
            searchBlob: `${title.toLowerCase()} ${folder.toLowerCase()} ${tags} ${plain}`,
          }
        })
        indexReady = true
      } catch (err) {
        console.error("Failed to load content index:", err)
      }
    }

    let focusedSearchIdx = -1
    let currentSearchMatches: typeof indexedPages = []

    function closeSearchDropdown() {
      if (!searchDropdown) return
      searchDropdown.classList.remove("is-open")
      focusedSearchIdx = -1
    }

    function navigateToSlug(targetSlug: FullSlug) {
      const currentSlug = normalizeSlug(document.body.dataset.slug || "index") as FullSlug
      const rel = resolveRelative(currentSlug, targetSlug)
      const url = new URL(rel, window.location.href)
      if (searchInput) searchInput.value = ""
      closeSearchDropdown()
      setDrawerOpen(false)
      if (typeof window.spaNavigate === "function") {
        window.spaNavigate(url, false)
      } else {
        window.location.assign(url)
      }
    }

    function updateSearchFocus() {
      if (!searchDropdown) return
      const btns = searchDropdown.querySelectorAll(".search-result-btn")
      btns.forEach((btn, i) => {
        btn.classList.toggle("is-focused", i === focusedSearchIdx)
      })
    }

    async function renderSearchDropdown(query: string) {
      if (!searchDropdown) return
      const q = query.trim().toLowerCase()
      if (!q) {
        closeSearchDropdown()
        return
      }

      await ensureIndex()

      currentSearchMatches = indexedPages
        .filter((p) => p.searchBlob.includes(q))
        .sort((a, b) => {
          const aTitle = a.title.toLowerCase().includes(q) ? 0 : 1
          const bTitle = b.title.toLowerCase().includes(q) ? 0 : 1
          if (aTitle !== bTitle) return aTitle - bTitle
          return a.title.localeCompare(b.title)
        })

      searchDropdown.innerHTML = ""
      focusedSearchIdx = -1

      if (currentSearchMatches.length === 0) {
        const empty = document.createElement("div")
        empty.className = "search-empty"
        empty.textContent = "No matching notes"
        searchDropdown.appendChild(empty)
      } else {
        currentSearchMatches.forEach((p, idx) => {
          const btn = document.createElement("button")
          btn.type = "button"
          btn.className = "search-result-btn"
          btn.setAttribute("role", "option")
          btn.dataset.idx = String(idx)

          const titleSpan = document.createElement("span")
          titleSpan.textContent = p.title
          const folderSpan = document.createElement("span")
          folderSpan.className = "search-result-folder"
          folderSpan.textContent = p.folder

          btn.appendChild(titleSpan)
          btn.appendChild(folderSpan)
          btn.addEventListener("click", () => navigateToSlug(p.slug))
          searchDropdown.appendChild(btn)
        })
      }

      searchDropdown.classList.add("is-open")
    }

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        renderSearchDropdown((e.target as HTMLInputElement).value)
      })

      searchInput.addEventListener("focus", (e) => {
        ensureIndex()
        const val = (e.target as HTMLInputElement).value
        if (val.trim()) {
          renderSearchDropdown(val)
        }
      })

      searchInput.addEventListener("keydown", (e) => {
        if (!searchDropdown || !searchDropdown.classList.contains("is-open")) return
        if (e.key === "ArrowDown") {
          e.preventDefault()
          if (currentSearchMatches.length > 0) {
            focusedSearchIdx = (focusedSearchIdx + 1) % currentSearchMatches.length
            updateSearchFocus()
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault()
          if (currentSearchMatches.length > 0) {
            focusedSearchIdx =
              (focusedSearchIdx - 1 + currentSearchMatches.length) % currentSearchMatches.length
            updateSearchFocus()
          }
        } else if (e.key === "Enter") {
          e.preventDefault()
          const targetIdx = focusedSearchIdx >= 0 ? focusedSearchIdx : 0
          if (currentSearchMatches[targetIdx]) {
            navigateToSlug(currentSearchMatches[targetIdx].slug)
          }
        } else if (e.key === "Escape") {
          closeSearchDropdown()
          searchInput.blur()
        }
      })
    }

    // --- Escape Key Handler ---
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        setDrawerOpen(false)
        closeSearchDropdown()
      }
    })

    // --- Dark / Light Theme Toggle (Crash-Proof Synchronized Glide + Soft Radial Wave) ---
    let rippleEl: HTMLDivElement | null = null
    let rippleAnim: Animation | null = null

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener("click", () => {
        const isDark = document.documentElement.getAttribute("data-theme") !== "light"
        const nextTheme = isDark ? "light" : "dark"
        const prefersReduced =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches

        document.documentElement.setAttribute("data-theme", nextTheme)
        document.documentElement.setAttribute("saved-theme", nextTheme)
        try {
          localStorage.setItem("starling-garden-theme", nextTheme)
        } catch {}

        document.dispatchEvent(
          new CustomEvent("themechange", { detail: { theme: nextTheme, instant: prefersReduced } }),
        )

        if (!prefersReduced) {
          if (!rippleEl) {
            rippleEl = document.createElement("div")
            rippleEl.className = "theme-ripple"
            document.body.appendChild(rippleEl)
          }

          const rect = themeToggleBtn.getBoundingClientRect()
          const originX = rect.left + rect.width * 0.5
          const originY = rect.top + rect.height * 0.5
          const maxRadius = Math.hypot(
            Math.max(originX, window.innerWidth - originX),
            Math.max(originY, window.innerHeight - originY),
          )
          const targetScale = (maxRadius * 2.2) / 240

          rippleEl.style.left = `${originX}px`
          rippleEl.style.top = `${originY}px`
          rippleEl.style.background =
            nextTheme === "light"
              ? "radial-gradient(circle, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0.12) 42%, transparent 72%)"
              : "radial-gradient(circle, rgba(20, 20, 22, 0.38) 0%, rgba(20, 20, 22, 0.14) 42%, transparent 72%)"

          if (rippleAnim) {
            rippleAnim.cancel()
          }
          rippleAnim = rippleEl.animate(
            [
              { transform: "scale(0.15)", opacity: 1 },
              { transform: `scale(${targetScale.toFixed(2)})`, opacity: 0 },
            ],
            {
              duration: 560,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              fill: "none",
            },
          )
        }
      })
    }

    // --- Reader Mode Toggle ---
    if (readerToggleBtn) {
      readerToggleBtn.addEventListener("click", () => {
        const active = document.documentElement.classList.toggle("reader-mode")
        readerToggleBtn.classList.toggle("is-active", active)
        readerToggleBtn.setAttribute("aria-pressed", active ? "true" : "false")
        document.dispatchEvent(new CustomEvent("readermodechange", { detail: { active } }))
      })
    }

    // --- Sync on Initial Load & Every SPA Navigation ---
    function onNav() {
      applyFolderStates(document)
      syncActiveLinks()
      setDrawerOpen(false)
      closeSearchDropdown()

      if (textPane) {
        textPane.scrollTo({ top: 0, behavior: "smooth" })
      }
      if (window.innerWidth <= 860) {
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
    }

    document.addEventListener("nav", onNav)
    applyFolderStates(document)
    syncActiveLinks()
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGardenUI, { once: true })
  } else {
    initGardenUI()
  }
})()
