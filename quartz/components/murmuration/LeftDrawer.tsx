import { QuartzComponent, QuartzComponentConstructor } from "../types"

export default (() => {
  const LeftDrawer: QuartzComponent = () => {
    return (
      <>
        <div class="drawer-backdrop" id="drawerBackdrop" aria-hidden="true"></div>
        <aside
          class="left-drawer"
          id="leftDrawer"
          aria-label="Navigation Drawer"
          aria-hidden="true"
        >
          <div class="drawer-header">
            <span class="drawer-title">Explorer</span>
            <button
              type="button"
              class="util-icon-btn"
              id="drawerCloseBtn"
              aria-label="Close navigation drawer"
              title="Close"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <nav id="drawerExplorerMount" aria-label="Sidebar Explorer"></nav>
        </aside>
      </>
    )
  }

  return LeftDrawer
}) satisfies QuartzComponentConstructor
