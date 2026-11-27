import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import { resolveRelative, simplifySlug } from "../../util/path"

export default (() => {
  const GardenBacklinks: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
    if (fileData.slug === "index") {
      return null
    }

    const slug = simplifySlug(fileData.slug!)
    const backlinkFiles = allFiles.filter((file) => file.links?.includes(slug))

    return (
      <section class="quartz-backlinks" id="backlinksSection" aria-label="Backlinks">
        <div class="garden-label">Backlinks</div>
        <ul class="backlinks-list" id="backlinksList">
          {backlinkFiles.length > 0 ? (
            backlinkFiles.map((f) => {
              const title = f.frontmatter?.title ?? f.slug ?? "Untitled"
              const parts = (f.slug ?? "").split("/")
              const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "pinned"
              return (
                <li>
                  <a href={resolveRelative(fileData.slug!, f.slug!)} class="backlink-btn">
                    <span>{title}</span>
                    <span class="backlink-path">{folder}</span>
                  </a>
                </li>
              )
            })
          ) : (
            <li class="search-empty">No backlinks yet.</li>
          )}
        </ul>
      </section>
    )
  }

  return GardenBacklinks
}) satisfies QuartzComponentConstructor
