import {
  buildPageUrl,
  formatFolderLabel,
  toggleDrawer,
  type GardenContentIndex,
} from "./navUtils"

function setupUtilityBar() {
  const menuDrawerBtn = document.getElementById("menuDrawerBtn")
  const searchInput = document.getElementById("explorerSearch") as HTMLInputElement | null
  const searchDropdown = document.getElementById("searchDropdown")
  const themeToggleBtn = document.getElementById("themeToggleBtn")
  const readerToggleBtn = document.getElementById("readerToggleBtn")

  let focusedSearchIdx = -1
  let currentMatches: Array<{ slug: string; title: string; folder: string }> = []
  let indexCache: GardenContentIndex | null = null

  async function ensureIndex(): Promise<GardenContentIndex> {
    if (indexCache) return indexCache
    try {
      indexCache = ((await fetchData) as unknown as GardenContentIndex) ?? {}
    } catch {
      indexCache = {}
    }
    return indexCache
  }

  function closeSearchDropdown() {
    if (!searchDropdown) return
    searchDropdown.classList.remove("is-open")
    focusedSearchIdx = -1
  }

  function navigateToSlug(slug: string) {
    const targetHref = buildPageUrl(slug)
    const targetUrl = new URL(targetHref, window.location.origin)
    if (searchInput) searchInput.value = ""
    closeSearchDropdown()
    if (typeof window.spaNavigate === "function") {
      window.spaNavigate(targetUrl, false)
    } else {
      window.location.assign(targetUrl.href)
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

    const index = await ensureIndex()
    const entries = Object.entries(index)

    currentMatches = entries
      .filter(([slug, entry]) => {
        // Skip tag index or folder virtual pages if empty, keep all notes
        const title = (entry.title ?? slug).toLowerCase()
        const folder = formatFolderLabel(slug).toLowerCase()
        const body = (entry.content ?? "").toLowerCase()
        return title.includes(q) || folder.includes(q) || body.includes(q)
      })
      .slice(0, 20)
      .map(([slug, entry]) => ({
        slug,
        title: entry.title ?? slug,
        folder: formatFolderLabel(slug),
      }))

    searchDropdown.textContent = ""
    focusedSearchIdx = -1

    if (currentMatches.length === 0) {
      const empty = document.createElement("div")
      empty.className = "search-empty"
      empty.textContent = "No matching notes"
      searchDropdown.appendChild(empty)
    } else {
      currentMatches.forEach((item, idx) => {
        const btn = document.createElement("button")
        btn.type = "button"
        btn.className = "search-result-btn"
        btn.setAttribute("role", "option")
        btn.dataset.idx = String(idx)

        const titleSpan = document.createElement("span")
        titleSpan.textContent = item.title

        const folderSpan = document.createElement("span")
        folderSpan.className = "search-result-folder"
        folderSpan.textContent = item.folder

        btn.appendChild(titleSpan)
        btn.appendChild(folderSpan)
        btn.addEventListener("click", () => navigateToSlug(item.slug))
        searchDropdown.appendChild(btn)
      })
    }

    searchDropdown.classList.add("is-open")
  }

  const onSearchInput = (e: Event) => {
    const val = (e.target as HTMLInputElement).value
    void renderSearchDropdown(val)
  }

  const onSearchFocus = (e: Event) => {
    const val = (e.target as HTMLInputElement).value
    if (val.trim()) {
      void renderSearchDropdown(val)
    }
  }

  const onSearchKeydown = (e: KeyboardEvent) => {
    if (!searchDropdown || !searchDropdown.classList.contains("is-open")) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (currentMatches.length > 0) {
        focusedSearchIdx = (focusedSearchIdx + 1) % currentMatches.length
        updateSearchFocus()
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (currentMatches.length > 0) {
        focusedSearchIdx = (focusedSearchIdx - 1 + currentMatches.length) % currentMatches.length
        updateSearchFocus()
      }
    } else if (e.key === "Enter") {
      e.preventDefault()
      const targetIdx = focusedSearchIdx >= 0 ? focusedSearchIdx : 0
      const target = currentMatches[targetIdx]
      if (target) {
        navigateToSlug(target.slug)
      }
    } else if (e.key === "Escape") {
      closeSearchDropdown()
      searchInput?.blur()
    }
  }

  const onDocumentClick = (e: MouseEvent) => {
    const target = e.target as Element | null
    if (searchDropdown && target && !target.closest(".search-wrapper")) {
      closeSearchDropdown()
    }
  }

  const onThemeToggle = () => {
    const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"
    const next: "light" | "dark" = current === "dark" ? "light" : "dark"
    document.documentElement.setAttribute("data-theme", next)
    try {
      localStorage.setItem("theme", next)
    } catch {
      // ignore storage errors
    }
    const themeEvent: CustomEventMap["themechange"] = new CustomEvent("themechange", {
      detail: { theme: next },
    })
    document.dispatchEvent(themeEvent)
  }

  const onReaderToggle = () => {
    const active = document.documentElement.classList.toggle("reader-mode")
    readerToggleBtn?.classList.toggle("is-active", active)
    readerToggleBtn?.setAttribute("aria-pressed", active ? "true" : "false")
  }

  const onMenuClick = () => {
    toggleDrawer()
  }

  // Sync reader button state on nav
  if (readerToggleBtn) {
    const isReader = document.documentElement.classList.contains("reader-mode")
    readerToggleBtn.classList.toggle("is-active", isReader)
    readerToggleBtn.setAttribute("aria-pressed", isReader ? "true" : "false")
  }

  searchInput?.addEventListener("input", onSearchInput)
  searchInput?.addEventListener("focus", onSearchFocus)
  searchInput?.addEventListener("keydown", onSearchKeydown)
  document.addEventListener("click", onDocumentClick)
  themeToggleBtn?.addEventListener("click", onThemeToggle)
  readerToggleBtn?.addEventListener("click", onReaderToggle)
  menuDrawerBtn?.addEventListener("click", onMenuClick)

  window.addCleanup(() => {
    searchInput?.removeEventListener("input", onSearchInput)
    searchInput?.removeEventListener("focus", onSearchFocus)
    searchInput?.removeEventListener("keydown", onSearchKeydown)
    document.removeEventListener("click", onDocumentClick)
    themeToggleBtn?.removeEventListener("click", onThemeToggle)
    readerToggleBtn?.removeEventListener("click", onReaderToggle)
    menuDrawerBtn?.removeEventListener("click", onMenuClick)
  })
}

document.addEventListener("nav", setupUtilityBar)
