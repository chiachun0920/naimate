import type { Doc } from '../state/docReducer'
import { isBirthOnFrame, isStrokeOnFrame } from '../state/docReducer'
import { getImage } from '../lib/imageCache'
import { drawSceneElement } from '../scene/elements/draw'
import { strokeToPath } from './strokePath'

export interface RenderOpts {
  width: number
  height: number
  /** Fade strokes from earlier frames so the "new" strokes of this frame stand out. */
  dimOlder?: boolean
  background?: string
  /** Use CORS-clean images (for export, so reading pixels never throws). */
  cors?: boolean
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
  const { width, height, dimOlder = false, background = '#ffffff', cors = false } = opts
  // Fade content carried over from an earlier frame so the current frame's new
  // strokes stand out. Additive: anything born before this frame. Independent:
  // the seeded copies brought in by "完成這一幀". Editing aid only — callers
  // pass dimOlder:false for playback/thumbnails/export, so output stays solid.
  const isDimmed = (born: number, seed?: boolean) =>
    dimOlder && (doc.mode === 'independent' ? !!seed : born < frameIndex)
  ctx.save()
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }
  // Images render under the strokes so you can draw on top of them.
  for (const im of doc.images ?? []) {
    if (!isBirthOnFrame(im.birthFrame, frameIndex, doc.mode)) continue
    const img = getImage(im.src, cors)
    if (img) {
      ctx.globalAlpha = isDimmed(im.birthFrame, im.seed) ? 0.22 : 1
      ctx.drawImage(img, im.x, im.y, im.w, im.h)
    }
  }
  ctx.globalAlpha = 1
  // Shapes render above images but below strokes (ink annotates on top).
  for (const sh of doc.shapes ?? []) {
    if (!isBirthOnFrame(sh.birthFrame, frameIndex, doc.mode)) continue
    ctx.globalAlpha = isDimmed(sh.birthFrame, sh.seed) ? 0.22 : 1
    drawSceneElement(ctx, sh) // AnimShape is structurally a DrawnElement
  }
  ctx.globalAlpha = 1
  for (const s of doc.strokes) {
    if (!isStrokeOnFrame(s, frameIndex, doc.mode)) continue
    ctx.globalAlpha = isDimmed(s.birthFrame, s.seed) ? 0.22 : 1
    ctx.fillStyle = s.color
    ctx.fill(strokeToPath(s.points, s.size))
  }
  ctx.restore()
}

/**
 * Draw ONLY the content born exactly on `birthIndex` (no background, no dimming).
 * Used for incremental additive thumbnail building: frame N's image = frame N-1's
 * image + this frame's contribution, turning the timeline's O(frames²) thumbnail
 * cost into O(frames + strokes). Sub-order matches renderFrame (images→shapes→strokes).
 */
export function renderFrameContribution(
  ctx: CanvasRenderingContext2D,
  doc: Doc,
  birthIndex: number,
  opts: { cors?: boolean } = {},
): void {
  const { cors = false } = opts
  ctx.save()
  for (const im of doc.images ?? []) {
    if (im.birthFrame !== birthIndex) continue
    const img = getImage(im.src, cors)
    if (img) ctx.drawImage(img, im.x, im.y, im.w, im.h)
  }
  for (const sh of doc.shapes ?? []) {
    if (sh.birthFrame !== birthIndex) continue
    drawSceneElement(ctx, sh)
  }
  for (const s of doc.strokes) {
    if (s.birthFrame !== birthIndex) continue
    ctx.fillStyle = s.color
    ctx.fill(strokeToPath(s.points, s.size))
  }
  ctx.restore()
}
