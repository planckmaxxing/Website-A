import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import { resolveRelative, simplifySlug } from "../../util/path"

function getFolderLabel(slug: string): string {
  const clean = slug.replace(/^\/+|\/+$/g, "")
  const slashIdx = clean.lastIndexOf("/")
  if (slashIdx === -1) return "pinned"
  return clean.slice(0, slashIdx) || "pinned"
}

const GardenBacklinks: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  const currentSlug = fileData.slug!
  if (currentSlug === "index") {
    return null
  }

  const slug = simplifySlug(currentSlug)
  const backlinkFiles = allFiles
    .filter((file) => {
      if (!file.slug || file.slug === currentSlug) return false
      return file.links?.includes(slug)
    })
    .sort((a, b) => {
      const aTitle = a.frontmatter?.title ?? a.slug ?? ""
      const bTitle = b.frontmatter?.title ?? b.slug ?? ""
      return aTitle.localeCompare(bTitle)
    })

  return (
    <section class="quartz-backlinks" id="backlinksSection" aria-label="Backlinks">
      <div class="garden-label">Backlinks</div>
      <ul class="backlinks-list" id="backlinksList">
        {backlinkFiles.length === 0 ? (
          <li class="search-empty">No backlinks yet.</li>
        ) : (
          backlinkFiles.map((f) => (
            <li>
              <a href={resolveRelative(currentSlug, f.slug!)} class="backlink-btn">
                <span>{f.frontmatter?.title ?? f.slug}</span>
                <span class="backlink-path">{getFolderLabel(f.slug!)}</span>
              </a>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}

export default (() => GardenBacklinks) satisfies QuartzComponentConstructor
