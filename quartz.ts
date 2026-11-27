import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import {
  GardenBacklinks,
  GardenExplorer,
  LeftDrawer,
  MurmurationCanvas,
  UtilityBar,
} from "./quartz/components/murmuration"

const config = await loadQuartzConfig()
export default config

const murmurationLayout = {
  frame: "murmuration",
  header: [UtilityBar()],
  beforeBody: [],
  afterBody: [GardenExplorer(), GardenBacklinks()],
  left: [MurmurationCanvas()],
  right: [LeftDrawer()],
  footer: [],
}

export const layout = await loadQuartzLayout({
  defaults: murmurationLayout,
  byPageType: {
    content: murmurationLayout,
    folder: murmurationLayout,
    tag: murmurationLayout,
  },
})
