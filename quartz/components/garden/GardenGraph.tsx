// @ts-ignore
import graphScript from "./scripts/gardenGraph.inline"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"

const GardenGraph: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const isIndex = fileData.slug === "index"
  const mode = isIndex ? "global" : "local"
  const label = isIndex ? "Graph View" : "Local Graph"

  return (
    <>
      <hr class="obsidian-divider garden-divider" />
      <section
        class="quartz-graph"
        id="graphSection"
        data-graph-mode={mode}
        aria-label={label}
      >
        <div class="graph-header">
          <div class="garden-label">{label}</div>
          <div class="graph-actions">
            <button
              type="button"
              class="util-icon-btn graph-action-btn"
              id="graphZoomOutBtn"
              aria-label="Zoom out graph"
              title="Zoom out"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              type="button"
              class="util-icon-btn graph-action-btn"
              id="graphZoomInBtn"
              aria-label="Zoom in graph"
              title="Zoom in"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              type="button"
              class="util-icon-btn graph-expand-btn"
              id="graphExpandBtn"
              aria-label="Open full graph view"
              title="Expand graph"
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
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          </div>
        </div>
        <div class="graph-canvas-wrap">
          <canvas class="graph-canvas"></canvas>
        </div>
      </section>
    </>
  )
}

GardenGraph.afterDOMLoaded = graphScript

export default (() => GardenGraph) satisfies QuartzComponentConstructor
