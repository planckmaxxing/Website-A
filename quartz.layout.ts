import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

// Components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [Component.UtilityBar()],
  afterBody: [Component.GardenExplorer(), Component.GardenBacklinks()],
  footer: Component.Spacer(),
}

// Single note / page layout
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [],
  left: [Component.MurmurationCanvas()],
  right: [Component.LeftDrawer()],
}

// List pages (folders / tags)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [],
  left: [Component.MurmurationCanvas()],
  right: [Component.LeftDrawer()],
}
