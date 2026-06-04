import type { FrameEl } from './elements/types'
import type { View } from './WhiteboardCanvas'

interface Props {
  frames: FrameEl[]
  view: View
}

/**
 * Screen-space name labels at each frame's top-left corner. Constant on-screen
 * size (not scaled with the view) and click-through so the canvas keeps input.
 */
export function FrameLabelsOverlay({ frames, view }: Props) {
  if (frames.length === 0) return null
  return (
    <>
      {frames.map((f) => (
        <div
          key={f.id}
          className="frame-label"
          style={{
            left: f.x * view.scale + view.tx,
            top: f.y * view.scale + view.ty,
          }}
        >
          {f.name}
        </div>
      ))}
    </>
  )
}
