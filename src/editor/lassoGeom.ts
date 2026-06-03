import type { AnimImage, Stroke } from '../state/docReducer'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** World-space bounding box of a stroke (padded by half its width). */
export function strokeBounds(s: Stroke): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const pad = s.size / 2
  for (const [x, y] of s.points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
}

export function imageBounds(im: AnimImage): Rect {
  return { x: im.x, y: im.y, w: im.w, h: im.h }
}

/** Combined bbox of strokes + images (empty → zero rect). */
export function unionRect(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    if (r.x < minX) minX = r.x
    if (r.y < minY) minY = r.y
    if (r.x + r.w > maxX) maxX = r.x + r.w
    if (r.y + r.h > maxY) maxY = r.y + r.h
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
}
