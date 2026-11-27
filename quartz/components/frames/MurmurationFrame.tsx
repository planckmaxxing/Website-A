import type { Element, Root } from "hast"
import { PageFrame, PageFrameProps } from "./types"

function hasLeadingH1(tree: unknown): boolean {
  const root = tree as Root | undefined
  if (!root?.children) return false
  for (const child of root.children) {
    if (child.type === "text" && !child.value.trim()) continue
    if (child.type === "element") {
      return (child as Element).tagName === "h1"
    }
    break
  }
  return false
}

/**
 * 50/50 Split-Screen Starling Murmuration + Minimalist Editorial Reader Frame.
 */
export const MurmurationFrame: PageFrame = {
  name: "murmuration",
  render({
    componentData,
    header,
    pageBody: Content,
    afterBody,
    left,
    right,
  }: PageFrameProps) {
    const lang = componentData.fileData.frontmatter?.lang ?? componentData.cfg.locale?.split("-")[0] ?? "en"
    const pageTitle = componentData.fileData.frontmatter?.title
    const showTitle = Boolean(pageTitle) && !hasLeadingH1(componentData.tree)

    return (
      <>
        {right.map((DrawerComponent) => (
          <DrawerComponent {...componentData} />
        ))}
        <main class="split-container">
          {left.map((CanvasComponent) => (
            <CanvasComponent {...componentData} />
          ))}
          <article class="text-pane" id="textPane" lang={lang}>
            <div class="tex-body">
              {header.map((HeaderComponent) => (
                <HeaderComponent {...componentData} />
              ))}
              <div id="pageContent">
                {showTitle && <h1 class="about-heading">{pageTitle}</h1>}
                <Content {...componentData} />
              </div>
              <hr class="obsidian-divider garden-divider" />
              {afterBody.map((AfterComponent) => (
                <AfterComponent {...componentData} />
              ))}
            </div>
          </article>
        </main>
      </>
    )
  },
}
