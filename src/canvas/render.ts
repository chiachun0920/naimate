import type { Doc } from '../state/docReducer'
import { isStrokeOnFrame } from '../state/docReducer'
import { strokeToPath } from './strokePath'

export interface RenderOpts {
  width: number
  height: number
  /** Fade strokes from earlier frames so the "new" strokes of this frame stand out. */
  dimOlder?: boolean
  background?: string
}

/**
 * Render a single animation frame. Frame N = every stroke whose birthFrame <= N.
 * Shared by the live canvas, timeline thumbnails, and export.
 *
 * Draws the white "paper" rect at world [0,0,width,height] + the strokes. Does
 * NOT clear the device — the caller clears and sets the (view) transform first,
 * so under zoom/pan the area outside the page stays transparent (showing the
 * gray stage), making the page boundary visible.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  doc: Doc,
  frameIndex: number,
  opts: RenderOpts,
): void {
  const { width, height, dimOlder = false, background = '#ffffff' } = opts
  ctx.save()
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }
  for (const s of doc.strokes) {
    if (!isStrokeOnFrame(s, frameIndex, doc.mode)) continue
    ctx.globalAlpha = dimOlder && s.birthFrame < frameIndex ? 0.22 : 1
    ctx.fillStyle = s.color
    ctx.fill(strokeToPath(s.points, s.size))
  }
  ctx.restore()
}
