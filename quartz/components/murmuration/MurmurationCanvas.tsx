import { QuartzComponent, QuartzComponentConstructor } from "../types"
// @ts-ignore
import murmurationScript from "./murmuration.inline"

export default (() => {
  const MurmurationCanvas: QuartzComponent = () => {
    return (
      <section
        class="canvas-pane"
        id="swarmPane"
        data-persist=""
        aria-label="3D Starling Murmuration"
      >
        <canvas id="swarmCanvas"></canvas>
      </section>
    )
  }

  MurmurationCanvas.afterDOMLoaded = murmurationScript
  return MurmurationCanvas
}) satisfies QuartzComponentConstructor
