// @ts-ignore
import themeScript from "./scripts/theme.inline"
// @ts-ignore
import gardenScript from "./scripts/garden.inline"
import { QuartzComponent, QuartzComponentConstructor } from "../types"

const UtilityBar: QuartzComponent = () => {
  return (
    <header class="utility-bar" aria-label="Page controls">
      <button
        type="button"
        class="util-icon-btn"
        id="menuDrawerBtn"
        aria-label="Open Explorer drawer"
        aria-expanded="false"
        aria-controls="leftDrawer"
        title="Menu"
      >
        <svg
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <line x1="0" y1="4" x2="18" y2="4" />
          <line x1="0" y1="9" x2="18" y2="9" />
          <line x1="0" y1="14" x2="18" y2="14" />
        </svg>
      </button>

      <div class="utility-right">
        <div class="search-wrapper">
          <label class="search-box" for="explorerSearch">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="20" y1="20" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              id="explorerSearch"
              class="search-input"
              placeholder="Search"
              autocomplete="off"
              aria-label="Search notes"
            />
          </label>
          <div class="search-dropdown" id="searchDropdown" role="listbox" aria-label="Search results"></div>
        </div>

        <button
          type="button"
          class="util-icon-btn"
          id="themeToggleBtn"
          aria-label="Toggle dark and light mode"
          title="Toggle theme"
        >
          <svg class="icon-moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
          </svg>
          <svg
            class="icon-sun"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2" x2="12" y2="4.5" />
            <line x1="12" y1="19.5" x2="12" y2="22" />
            <line x1="4.93" y1="4.93" x2="6.7" y2="6.7" />
            <line x1="17.3" y1="17.3" x2="19.07" y2="19.07" />
            <line x1="2" y1="12" x2="4.5" y2="12" />
            <line x1="19.5" y1="12" x2="22" y2="12" />
            <line x1="4.93" y1="19.07" x2="6.7" y2="17.3" />
            <line x1="17.3" y1="6.7" x2="19.07" y2="4.93" />
          </svg>
        </button>

        <button
          type="button"
          class="util-icon-btn"
          id="readerToggleBtn"
          aria-label="Toggle reader mode"
          aria-pressed="false"
          title="Reader mode"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H11a3 3 0 0 1 3 3v14.5a2 2 0 0 0-2-2H4.5A2.5 2.5 0 0 1 2 16V5.5z" />
            <path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H13a3 3 0 0 0-3 3v14.5a2 2 0 0 1 2-2h7.5A2.5 2.5 0 0 0 22 16V5.5z" />
          </svg>
        </button>
      </div>
    </header>
  )
}

UtilityBar.beforeDOMLoaded = themeScript
UtilityBar.afterDOMLoaded = gardenScript

export default (() => UtilityBar) satisfies QuartzComponentConstructor
