import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import { ExplorerTree } from "./ExplorerTree"

const GardenExplorer: QuartzComponent = ({ allFiles, fileData }: QuartzComponentProps) => {
  const currentSlug = fileData.slug!
  const isIndex = currentSlug === "index"

  return (
    <>
      {!isIndex && <hr class="obsidian-divider garden-divider" />}
      <nav class="quartz-explorer" id="explorerSection" aria-label="Explorer">
        <div class="garden-label">Explorer</div>
        <div id="bottomExplorerMount">
          <ExplorerTree allFiles={allFiles} currentSlug={currentSlug} />
        </div>
      </nav>
    </>
  )
}

export default (() => GardenExplorer) satisfies QuartzComponentConstructor
