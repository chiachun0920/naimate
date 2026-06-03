import { useEffect, useRef } from 'react'
import { renderFrame } from '../canvas/render'
import { isStrokeOnFrame, type Doc } from '../state/docReducer'
import type { AnimEl } from './elements/types'

interface Props {
  el: AnimEl
  /** Whiteboard zoom, used to keep label/icon a constant screen size. */
  scale: number
}

/** Bounding box (world coords) of the strokes visible on `frame`, or null. */
function frameBounds(doc: Doc, frame: number) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of doc.strokes) {
    if (!isStrokeOnFrame(s, frame, doc.mode)) continue
    const pad = s.size / 2
    for (const [x, y] of s.points) {
      if (x - pad < minX) minX = x - pad
      if (y - pad < minY) minY = y - pad
      if (x + pad > maxX) maxX = x + pad
      if (y + pad > maxY) maxY = y + pad
    }
  }
  if (minX === Infinity) return null
  return { minX, minY, w: maxX - minX, h: maxY - minY }
}

/** Visual-only thumbnail card for an embedded animation (pointer-events handled
 * by the whiteboard canvas underneath / the selection overlay above). */
export function AnimationObjectCard({ el, scale }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewFrame = Math.max(0, el.doc.frameCount - 1)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const W = el.w
    const H = el.h
    c.width = Math.round(W * dpr)
    c.height = Math.round(H * dpr)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    const b = frameBounds(el.doc, previewFrame)
    if (b) {
      const cw = b.w || 1
      const ch = b.h || 1
      const s = Math.min(W / cw, H / ch) * 0.9
      const tx = (W - cw * s) / 2 - b.minX * s
      const ty = (H - ch * s) / 2 - b.minY * s
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty)
      renderFrame(ctx, el.doc, previewFrame, { width: 0, height: 0, background: 'transparent' })
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }
  }, [el.doc, el.w, el.h, previewFrame])

  return (
    <div className="scene-obj" style={{ left: el.x, top: el.y, width: el.w, height: el.h }}>
      <canvas ref={canvasRef} />
      <div
        className="obj-name"
        style={{ fontSize: 13 / scale, padding: `${2 / scale}px ${6 / scale}px` }}
      >
        {el.name}
      </div>
      <div className="obj-play" style={{ fontSize: 22 / scale }}>
        ▶
      </div>
    </div>
  )
}
