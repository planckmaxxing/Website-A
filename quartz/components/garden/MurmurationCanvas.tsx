// @ts-ignore
import murmurationScript from "./scripts/murmuration.inline"
import { QuartzComponent, QuartzComponentConstructor } from "../types"

const MurmurationCanvas: QuartzComponent = () => {
  return (
    <section class="canvas-pane" aria-label="3D Starling Murmuration">
      <canvas id="swarmCanvas"></canvas>
    </section>
  )
}

MurmurationCanvas.afterDOMLoaded = murmurationScript

export default (() => MurmurationCanvas) satisfies QuartzComponentConstructor
