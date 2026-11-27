import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
// @ts-ignore
import gardenExplorerScript from "./gardenExplorer.inline"

export default (() => {
  const GardenExplorer: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
    const isIndex = fileData.slug === "index"
    if (!isIndex) {
      return null
    }

    return (
      <nav class="quartz-explorer" id="explorerSection" aria-label="Explorer">
        <div class="garden-label">Explorer</div>
        <div id="bottomExplorerMount"></div>
      </nav>
    )
  }

  GardenExplorer.afterDOMLoaded = gardenExplorerScript
  return GardenExplorer
}) satisfies QuartzComponentConstructor
