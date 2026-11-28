import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import { ExplorerTree } from "./ExplorerTree"

const GardenExplorer: QuartzComponent = ({ allFiles, fileData }: QuartzComponentProps) => {
  const currentSlug = fileData.slug!
  if (currentSlug !== "index") {
    return null
  }

  return (
    <nav class="quartz-explorer" id="explorerSection" aria-label="Explorer">
      <div class="garden-label">Explorer</div>
      <div id="bottomExplorerMount">
        <ExplorerTree allFiles={allFiles} currentSlug={currentSlug} />
      </div>
    </nav>
  )
}

export default (() => GardenExplorer) satisfies QuartzComponentConstructor
