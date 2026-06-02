import { useEffect, useRef } from 'react'
import type { Action, Doc } from '../state/docReducer'
import { renderFrame } from '../canvas/render'

interface Props {
  doc: Doc
  currentFrame: number
  playhead: number | null
  canvasWidth: number
  canvasHeight: number
  dispatch: React.Dispatch<Action>
}

const THUMB_W = 112
const THUMB_H = 84

export function Timeline({ doc, currentFrame, playhead, canvasWidth, canvasHeight, dispatch }: Props) {
  const frames = Array.from({ length: doc.frameCount }, (_, i) => i)
  return (
    <div className="timeline">
      {frames.map((i) => (
        <div
          key={i}
          className={
            'frame' +
            (i === currentFrame ? ' current' : '') +
            (i === playhead ? ' playing' : '')
          }
        >
          <FrameThumb
            doc={doc}
            index={i}
            srcW={canvasWidth}
            srcH={canvasHeight}
            onClick={() => dispatch({ type: 'selectFrame', index: i })}
          />
          <div className="frame-bar">
            <span>#{i + 1}</span>
            <button
              className="del"
              title="刪除這一幀"
              onClick={() => dispatch({ type: 'deleteFrame', index: i })}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function FrameThumb({
  doc,
  index,
  srcW,
  srcH,
  onClick,
}: {
  doc: Doc
  index: number
  srcW: number
  srcH: number
  onClick: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, THUMB_W, THUMB_H)
    // Strokes use absolute canvas coords, so scale the live canvas size to fit.
    const scale = Math.min(THUMB_W / srcW, THUMB_H / srcH)
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    renderFrame(ctx, doc, index, { width: srcW, height: srcH })
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }, [doc, index, srcW, srcH])

  return <canvas ref={ref} width={THUMB_W} height={THUMB_H} className="thumb" onClick={onClick} />
}
