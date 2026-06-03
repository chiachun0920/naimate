import { FONT_FAMILY, LINE_HEIGHT, type SceneElement } from './types'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

let measureCtx: CanvasRenderingContext2D | null = null
export function measureText(text: string, fontSize: number): { w: number; h: number } {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  const lines = text.length ? text.split('\n') : ['']
  const lh = fontSize * LINE_HEIGHT
  let maxW = 0
  if (measureCtx) {
    measureCtx.font = `${fontSize}px ${FONT_FAMILY}`
    for (const l of lines) maxW = Math.max(maxW, measureCtx.measureText(l || ' ').width)
  }
  return { w: Math.max(maxW, fontSize), h: lh * lines.length }
}

/** Normalize a box that may have negative width/height into a positive one. */
export function normBox(x: number, y: number, w: number, h: number): Box {
  return { x: w < 0 ? x + w : x, y: h < 0 ? y + h : y, w: Math.abs(w), h: Math.abs(h) }
}

export function bounds(el: SceneElement): Box {
  switch (el.type) {
    case 'freedraw': {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      const pad = el.strokeWidth / 2
      for (const [x, y] of el.points) {
        if (x - pad < minX) minX = x - pad
        if (y - pad < minY) minY = y - pad
        if (x + pad > maxX) maxX = x + pad
        if (y + pad > maxY) maxY = y + pad
      }
      if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    }
    case 'rect':
    case 'ellipse':
      return normBox(el.x, el.y, el.w, el.h)
    case 'line':
    case 'arrow': {
      const pad = el.strokeWidth / 2 + 4
      const minX = Math.min(el.x1, el.x2) - pad
      const minY = Math.min(el.y1, el.y2) - pad
      const maxX = Math.max(el.x1, el.x2) + pad
      const maxY = Math.max(el.y1, el.y2) + pad
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    }
    case 'text': {
      const m = measureText(el.text, el.fontSize)
      return { x: el.x, y: el.y, w: m.w, h: m.h }
    }
    case 'image':
    case 'animation':
      return { x: el.x, y: el.y, w: el.w, h: el.h }
  }
}

export function translate(el: SceneElement, dx: number, dy: number): SceneElement {
  switch (el.type) {
    case 'freedraw':
      return { ...el, points: el.points.map(([x, y, p]) => [x + dx, y + dy, p]) }
    case 'line':
    case 'arrow':
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy }
    default:
      return { ...el, x: el.x + dx, y: el.y + dy }
  }
}

/** Scale an element so its old bounding box maps onto the new one. */
export function scaleTo(el: SceneElement, oldBox: Box, newBox: Box): SceneElement {
  const sx = oldBox.w ? newBox.w / oldBox.w : 1
  const sy = oldBox.h ? newBox.h / oldBox.h : 1
  const mapX = (x: number) => newBox.x + (x - oldBox.x) * sx
  const mapY = (y: number) => newBox.y + (y - oldBox.y) * sy
  switch (el.type) {
    case 'freedraw':
      return { ...el, points: el.points.map(([x, y, p]) => [mapX(x), mapY(y), p]) }
    case 'line':
    case 'arrow':
      return { ...el, x1: mapX(el.x1), y1: mapY(el.y1), x2: mapX(el.x2), y2: mapY(el.y2) }
    case 'text':
      return { ...el, x: mapX(el.x), y: mapY(el.y), fontSize: Math.max(6, el.fontSize * sy) }
    default:
      return { ...el, x: mapX(el.x), y: mapY(el.y), w: el.w * sx, h: el.h * sy }
  }
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

export function hitTest(el: SceneElement, px: number, py: number, tol: number): boolean {
  switch (el.type) {
    case 'freedraw': {
      const r = el.strokeWidth / 2 + tol
      for (let i = 1; i < el.points.length; i++) {
        const [x1, y1] = el.points[i - 1]
        const [x2, y2] = el.points[i]
        if (distToSeg(px, py, x1, y1, x2, y2) <= r) return true
      }
      if (el.points.length === 1) {
        const [x, y] = el.points[0]
        return Math.hypot(px - x, py - y) <= r
      }
      return false
    }
    case 'rect': {
      const b = normBox(el.x, el.y, el.w, el.h)
      if (el.fill !== 'transparent') {
        return px >= b.x - tol && px <= b.x + b.w + tol && py >= b.y - tol && py <= b.y + b.h + tol
      }
      const inX = px >= b.x - tol && px <= b.x + b.w + tol
      const inY = py >= b.y - tol && py <= b.y + b.h + tol
      const nearV = Math.abs(px - b.x) <= tol || Math.abs(px - (b.x + b.w)) <= tol
      const nearH = Math.abs(py - b.y) <= tol || Math.abs(py - (b.y + b.h)) <= tol
      return (inY && nearV) || (inX && nearH)
    }
    case 'ellipse': {
      const b = normBox(el.x, el.y, el.w, el.h)
      const cx = b.x + b.w / 2
      const cy = b.y + b.h / 2
      const rx = b.w / 2 || 1
      const ry = b.h / 2 || 1
      const v = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2
      if (el.fill !== 'transparent') return v <= 1.1
      return Math.abs(v - 1) <= 0.35
    }
    case 'line':
    case 'arrow':
      return distToSeg(px, py, el.x1, el.y1, el.x2, el.y2) <= el.strokeWidth / 2 + tol + 3
    case 'text':
    case 'image':
    case 'animation': {
      const b = bounds(el)
      return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h
    }
  }
}
