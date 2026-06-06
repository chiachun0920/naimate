import { useEffect, useRef, useState } from 'react'
import type { Action, Doc } from '../state/docReducer'
import { renderFrame, renderFrameContribution } from '../canvas/render'

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
const CHUNK = 4 // thumbnails rendered per animation frame (keeps the UI responsive)
const LOADING_DELAY = 150 // ms before showing the cover, so quick rebuilds don't flash it

export function Timeline({ doc, currentFrame, playhead, canvasWidth, canvasHeight, dispatch }: Props) {
  const frames = Array.from({ length: doc.frameCount }, (_, i) => i)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const [loading, setLoading] = useState(false)

  // Build every thumbnail. Additive mode accumulates frame-by-frame into an
  // offscreen canvas (frame N = frame N-1 + content born on N) so the cost is
  // O(frames + strokes) instead of O(frames²); independent frames are standalone.
  // Rendering is chunked across rAF so expanding never freezes the UI.
  useEffect(() => {
    if (canvasWidth <= 0 || canvasHeight <= 0) return
    const scale = Math.min(THUMB_W / canvasWidth, THUMB_H / canvasHeight)
    const acc = document.createElement('canvas')
    acc.width = THUMB_W
    acc.height = THUMB_H
    const accCtx = acc.getContext('2d')
    if (accCtx) {
      accCtx.fillStyle = '#ffffff'
      accCtx.fillRect(0, 0, THUMB_W, THUMB_H)
    }

    let i = 0
    let raf: number | null = null
    let cancelled = false
    const loadTimer = window.setTimeout(() => {
      if (!cancelled) setLoading(true)
    }, LOADING_DELAY)

    const finish = () => {
      clearTimeout(loadTimer)
      if (!cancelled) setLoading(false)
    }

    const step = () => {
      const end = Math.min(i + CHUNK, doc.frameCount)
      for (; i < end; i++) {
        const c = canvasRefs.current[i]
        const ctx = c?.getContext('2d')
        if (!ctx) continue
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, THUMB_W, THUMB_H)
        if (doc.mode === 'independent') {
          ctx.setTransform(scale, 0, 0, scale, 0, 0)
          renderFrame(ctx, doc, i, { width: canvasWidth, height: canvasHeight })
          ctx.setTransform(1, 0, 0, 1, 0, 0)
        } else if (accCtx) {
          accCtx.setTransform(scale, 0, 0, scale, 0, 0)
          renderFrameContribution(accCtx, doc, i)
          accCtx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.drawImage(acc, 0, 0)
        }
      }
      if (i < doc.frameCount) {
        raf = requestAnimationFrame(step)
      } else {
        finish()
      }
    }
    raf = requestAnimationFrame(step)

    return () => {
      cancelled = true
      clearTimeout(loadTimer)
      if (raf != null) cancelAnimationFrame(raf)
    }
  }, [doc, canvasWidth, canvasHeight])

  return (
    <div className="timeline-wrap">
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
            <canvas
              ref={(el) => {
                canvasRefs.current[i] = el
              }}
              width={THUMB_W}
              height={THUMB_H}
              className="thumb"
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
      {loading && (
        <div className="timeline-loading">
          <div className="spinner" />
          產生縮圖…
        </div>
      )}
    </div>
  )
}
