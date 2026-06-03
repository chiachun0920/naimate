import { useCallback, useEffect, useRef } from 'react'
import type { Doc, Pt, Tool } from '../state/docReducer'
import { isBirthOnFrame, isStrokeOnFrame } from '../state/docReducer'
import { subscribeImageLoad, getImage } from '../lib/imageCache'
import { pointInPolygon } from '../scene/elements/geometry'
import { imageBounds, pointInRect, strokeBounds, unionRect } from '../editor/lassoGeom'
import { renderFrame } from './render'
import { strokeToPath } from './strokePath'

export interface LassoSelection {
  strokeIds: string[]
  imageIds: string[]
}

/** Viewport transform: screen = world * scale + t. */
export interface View {
  scale: number
  tx: number
  ty: number
}
export const DEFAULT_VIEW: View = { scale: 1, tx: 0, ty: 0 }
export const MIN_SCALE = 0.2
export const MAX_SCALE = 8
export const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s))

interface Props {
  doc: Doc
  /** Frame being edited (used when not playing). */
  currentFrame: number
  /** When set (playback), show this frame fully and disable input. */
  displayFrame: number | null
  color: string
  size: number
  tool: Tool
  /** Reject touch input (palm/finger) so only Apple Pencil / mouse draws. */
  penOnly: boolean
  view: View
  width: number
  height: number
  onStrokeComplete: (points: Pt[]) => void
  onErase: (id: string) => void
  /** Fires when a stroke starts/ends so the UI chrome can lock out touches. */
  onDrawingChange?: (active: boolean) => void
  /** Commit a new viewport (after a pinch/pan gesture or wheel zoom). */
  onViewChange: (view: View) => void
  /** Lasso tool: current selection (so the canvas can group-move it). */
  selection?: LassoSelection
  /** Lasso completed: report which strokes/images were enclosed. */
  onLassoSelect?: (sel: LassoSelection) => void
  /** Group move of the selection committed (world delta). */
  onSelectionMove?: (dx: number, dy: number) => void
  /** Tap on empty space while lasso tool → clear the selection. */
  onClearSelection?: () => void
}

export function DrawCanvas({
  doc,
  currentFrame,
  displayFrame,
  color,
  size,
  tool,
  penOnly,
  view,
  width,
  height,
  onStrokeComplete,
  onErase,
  onDrawingChange,
  onViewChange,
  selection,
  onLassoSelect,
  onSelectionMove,
  onClearSelection,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Cached "static" layer: committed strokes of the shown frame, rendered once
  // (and only when the doc/frame/view changes) — never on every pointer move.
  const bgRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const points = useRef<Pt[]>([])
  const drawing = useRef(false)
  const rafId = useRef<number | null>(null)
  const sawPen = useRef(false)
  // Active touch points (screen px), for two-finger pan/zoom detection.
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<
    null | { scale0: number; tx0: number; ty0: number; cx: number; cy: number; d0: number; live: View }
  >(null)
  // Lasso tool: in-progress polygon (world coords) / group-move delta.
  const lasso = useRef<number[][] | null>(null)
  const selMove = useRef<{ sx: number; sy: number; dx: number; dy: number } | null>(null)
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const interactive = displayFrame === null

  const screenPos = (e: PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const toWorldPt = (e: PointerEvent): Pt => {
    const { x, y } = screenPos(e)
    const p = e.pressure
    return [(x - view.tx) / view.scale, (y - view.ty) / view.scale, p && p > 0 ? p : 0.5]
  }
  const setViewTransform = useCallback(
    (g: CanvasRenderingContext2D, v: View) => {
      g.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.tx, dpr * v.ty)
    },
    [dpr],
  )

  // Re-render the cached static layer at the committed view.
  const renderBackground = useCallback(() => {
    const bg = bgRef.current
    if (!bg) return
    const g = bg.getContext('2d')
    if (!g) return
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, bg.width, bg.height)
    setViewTransform(g, view)
    const frame = displayFrame ?? currentFrame
    renderFrame(g, doc, frame, { width, height, dimOlder: displayFrame === null })
  }, [doc, currentFrame, displayFrame, width, height, view, setViewTransform])

  // Blit the cached layer onto the visible canvas. `delta` (a uniform
  // scale+translate in CSS px) lets a live gesture transform the cached bitmap
  // cheaply instead of re-rendering every stroke.
  const blit = (g: CanvasRenderingContext2D, delta?: { s: number; ex: number; ey: number }) => {
    const bg = bgRef.current
    if (!bg || bg.width === 0 || bg.height === 0) return
    g.save()
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, bg.width, bg.height)
    if (delta) g.setTransform(delta.s, 0, 0, delta.s, delta.ex * dpr, delta.ey * dpr)
    g.drawImage(bg, 0, 0)
    g.restore()
  }

  const paintStatic = useCallback(() => {
    const g = ctxRef.current
    if (!g) return
    renderBackground()
    blit(g)
  }, [renderBackground])

  // Render the current frame into the bg cache, but excluding the lasso
  // selection — used during a group move so the originals aren't shown.
  const renderBgExceptSelection = (sel: LassoSelection) => {
    const bg = bgRef.current
    if (!bg || bg.width === 0 || bg.height === 0) return
    const g = bg.getContext('2d')
    if (!g) return
    const sset = new Set(sel.strokeIds)
    const iset = new Set(sel.imageIds)
    const filtered: Doc = {
      ...doc,
      strokes: doc.strokes.filter((s) => !sset.has(s.id)),
      images: (doc.images ?? []).filter((im) => !iset.has(im.id)),
    }
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, bg.width, bg.height)
    setViewTransform(g, view)
    renderFrame(g, filtered, currentFrame, { width, height, dimOlder: true })
  }

  // Live repaint during a stroke: blit the unchanged cache + only the current
  // stroke (world coords, under the view transform).
  const paintLive = () => {
    const g = ctxRef.current
    if (!g) return
    blit(g)
    setViewTransform(g, view)
    // Lasso polygon being drawn.
    if (lasso.current && lasso.current.length > 1) {
      const poly = lasso.current
      g.save()
      g.lineJoin = 'round'
      g.lineWidth = 1.5 / view.scale
      g.setLineDash([6 / view.scale, 4 / view.scale])
      g.strokeStyle = '#2a6fdb'
      g.fillStyle = 'rgba(42, 111, 219, 0.08)'
      g.beginPath()
      g.moveTo(poly[0][0], poly[0][1])
      for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0], poly[i][1])
      g.closePath()
      g.fill()
      g.stroke()
      g.restore()
      return
    }
    // Group move of the lasso selection (bg already excludes it).
    if (selMove.current && selection) {
      const { dx, dy } = selMove.current
      const sset = new Set(selection.strokeIds)
      const iset = new Set(selection.imageIds)
      g.save()
      g.translate(dx, dy)
      for (const s of doc.strokes) {
        if (!sset.has(s.id)) continue
        g.fillStyle = s.color
        g.fill(strokeToPath(s.points, s.size))
      }
      g.restore()
      for (const im of doc.images ?? []) {
        if (!iset.has(im.id)) continue
        const img = getImage(im.src)
        if (img) g.drawImage(img, im.x + dx, im.y + dy, im.w, im.h)
      }
      return
    }
    if (points.current.length === 0) return
    g.fillStyle = color
    g.fill(strokeToPath(points.current, size, false))
  }

  const paintGesture = () => {
    const g = ctxRef.current
    const ges = gesture.current
    if (!g || !ges) return
    const live = ges.live
    const s = live.scale / ges.scale0
    blit(g, { s, ex: live.tx - s * ges.tx0, ey: live.ty - s * ges.ty0 })
  }

  const schedule = (fn: () => void) => {
    if (rafId.current != null) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null
      fn()
    })
  }

  // Size visible + background canvases for high-DPI.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    if (!bgRef.current) bgRef.current = document.createElement('canvas')
    const bg = bgRef.current
    const w = Math.round(width * dpr)
    const h = Math.round(height * dpr)
    for (const el of [c, bg]) {
      el.width = w
      el.height = h
    }
    c.style.width = `${width}px`
    c.style.height = `${height}px`
    if (!ctxRef.current) ctxRef.current = c.getContext('2d', { desynchronized: true })
    paintStatic()
  }, [width, height, dpr, paintStatic])

  // Repaint when the document / frame / view changes.
  useEffect(() => {
    paintStatic()
  }, [paintStatic])

  // Repaint once a referenced image finishes loading (async, not mid-draw).
  useEffect(() => subscribeImageLoad(() => paintStatic()), [paintStatic])

  useEffect(
    () => () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current)
    },
    [],
  )

  // --- Gestures ---------------------------------------------------------------

  const startGesture = () => {
    const pts = [...touches.current.values()]
    if (pts.length < 2) return
    const [a, b] = pts
    gesture.current = {
      scale0: view.scale,
      tx0: view.tx,
      ty0: view.ty,
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      live: { ...view },
    }
    if (drawing.current) {
      drawing.current = false
      onDrawingChange?.(false)
      points.current = []
    }
  }

  const updateGesture = () => {
    const ges = gesture.current
    if (!ges || touches.current.size < 2) return
    const [a, b] = [...touches.current.values()]
    const c1x = (a.x + b.x) / 2
    const c1y = (a.y + b.y) / 2
    const d1 = Math.hypot(a.x - b.x, a.y - b.y) || 1
    const liveScale = clampScale(ges.scale0 * (d1 / ges.d0))
    // Keep the world point under the start centroid pinned to the current one.
    const wx = (ges.cx - ges.tx0) / ges.scale0
    const wy = (ges.cy - ges.ty0) / ges.scale0
    ges.live = { scale: liveScale, tx: c1x - liveScale * wx, ty: c1y - liveScale * wy }
    schedule(paintGesture)
  }

  const endTouch = (id: number) => {
    if (!touches.current.has(id)) return
    touches.current.delete(id)
    if (gesture.current && touches.current.size < 2) {
      const live = gesture.current.live
      gesture.current = null
      if (rafId.current != null) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
      onViewChange(live)
    }
  }

  // --- Drawing / erasing ------------------------------------------------------

  const eraseAt = (sx: number, sy: number) => {
    const g = ctxRef.current
    if (!g) return
    setViewTransform(g, view)
    for (let i = doc.strokes.length - 1; i >= 0; i--) {
      const s = doc.strokes[i]
      if (!isStrokeOnFrame(s, currentFrame, doc.mode)) continue
      if (g.isPointInPath(strokeToPath(s.points, s.size), sx * dpr, sy * dpr)) {
        onErase(s.id)
        return
      }
    }
  }

  // --- Lasso (animation editor) ----------------------------------------------

  const selectionRect = (sel: LassoSelection) => {
    const sset = new Set(sel.strokeIds)
    const iset = new Set(sel.imageIds)
    const rects = []
    for (const s of doc.strokes) if (sset.has(s.id)) rects.push(strokeBounds(s))
    for (const im of doc.images ?? []) if (iset.has(im.id)) rects.push(imageBounds(im))
    return unionRect(rects)
  }

  const computeLassoSelection = (poly: number[][]): LassoSelection => {
    const strokeIds: string[] = []
    const imageIds: string[] = []
    for (const s of doc.strokes) {
      if (!isStrokeOnFrame(s, currentFrame, doc.mode)) continue
      let hit = s.points.some(([x, y]) => pointInPolygon(x, y, poly))
      if (!hit) {
        const b = strokeBounds(s)
        hit = pointInPolygon(b.x + b.w / 2, b.y + b.h / 2, poly)
      }
      if (hit) strokeIds.push(s.id)
    }
    for (const im of doc.images ?? []) {
      if (!isBirthOnFrame(im.birthFrame, currentFrame, doc.mode)) continue
      const b = imageBounds(im)
      const pts: [number, number][] = [
        [b.x + b.w / 2, b.y + b.h / 2],
        [b.x, b.y],
        [b.x + b.w, b.y],
        [b.x, b.y + b.h],
        [b.x + b.w, b.y + b.h],
      ]
      if (pts.some(([x, y]) => pointInPolygon(x, y, poly))) imageIds.push(im.id)
    }
    return { strokeIds, imageIds }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    const ne = e.nativeEvent
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, screenPos(ne))
      canvasRef.current?.setPointerCapture(e.pointerId)
      if (touches.current.size >= 2) {
        startGesture()
        return
      }
      if (penOnly || sawPen.current) return // single touch never draws in pen mode
      // else: finger-drawing allowed, fall through
    } else if (e.pointerType === 'pen') {
      sawPen.current = true
    }
    // Lasso tool: drag inside an existing selection → group move; else draw a
    // polygon. (finger pan/pinch already handled above.)
    if (tool === 'lasso') {
      canvasRef.current?.setPointerCapture(e.pointerId)
      const [wx, wy] = toWorldPt(ne)
      const sel = selection
      const hasSel = !!sel && (sel.strokeIds.length > 0 || sel.imageIds.length > 0)
      if (hasSel && pointInRect(wx, wy, selectionRect(sel!))) {
        selMove.current = { sx: wx, sy: wy, dx: 0, dy: 0 }
        renderBgExceptSelection(sel!)
        paintLive()
      } else {
        lasso.current = [[wx, wy]]
        paintLive()
      }
      return
    }
    // Image tool: manipulation is handled by the DOM overlay above the canvas;
    // the canvas only keeps two-finger pan/zoom (handled above) here.
    if (tool === 'image') return
    const { x, y } = screenPos(ne)
    if (tool === 'eraser') {
      canvasRef.current?.setPointerCapture(e.pointerId)
      eraseAt(x, y)
      return
    }
    if (e.pointerType !== 'touch') canvasRef.current?.setPointerCapture(e.pointerId)
    drawing.current = true
    onDrawingChange?.(true)
    points.current = [toWorldPt(ne)]
    paintLive()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    const ne = e.nativeEvent
    if (gesture.current && e.pointerType === 'touch') {
      if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, screenPos(ne))
      updateGesture()
      return
    }
    if (lasso.current) {
      const coalesced = typeof ne.getCoalescedEvents === 'function' ? ne.getCoalescedEvents() : [ne]
      for (const ev of coalesced.length ? coalesced : [ne]) {
        const [wx, wy] = toWorldPt(ev)
        lasso.current.push([wx, wy])
      }
      schedule(paintLive)
      return
    }
    if (selMove.current) {
      const [wx, wy] = toWorldPt(ne)
      selMove.current.dx = wx - selMove.current.sx
      selMove.current.dy = wy - selMove.current.sy
      schedule(paintLive)
      return
    }
    if (!drawing.current) return
    if (e.pointerType === 'touch' && (penOnly || sawPen.current)) return
    const coalesced =
      typeof ne.getCoalescedEvents === 'function' ? ne.getCoalescedEvents() : [ne]
    for (const ev of coalesced.length ? coalesced : [ne]) points.current.push(toWorldPt(ev))
    schedule(paintLive)
  }

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') endTouch(e.pointerId)
    if (lasso.current) {
      const poly = lasso.current
      lasso.current = null
      if (rafId.current != null) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
      // A near-zero polygon = a tap on empty space → clear the selection.
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const [x, y] of poly) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
      const tap = poly.length < 3 || (maxX - minX) * view.scale < 6 || (maxY - minY) * view.scale < 6
      if (tap) onClearSelection?.()
      else onLassoSelect?.(computeLassoSelection(poly))
      paintStatic()
      return
    }
    if (selMove.current) {
      const { dx, dy } = selMove.current
      selMove.current = null
      if (rafId.current != null) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
      if (dx !== 0 || dy !== 0) onSelectionMove?.(dx, dy)
      paintStatic()
      return
    }
    if (!interactive || !drawing.current) return
    if (e.pointerType === 'touch' && (penOnly || sawPen.current)) return
    drawing.current = false
    onDrawingChange?.(false)
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current)
      rafId.current = null
    }
    const pts = points.current
    points.current = []
    if (pts.length > 0) onStrokeComplete(pts)
  }

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    const { x, y } = screenPos(e.nativeEvent as unknown as PointerEvent)
    const newScale = clampScale(view.scale * Math.exp(-e.deltaY * 0.0015))
    const k = newScale / view.scale
    onViewChange({ scale: newScale, tx: x - k * (x - view.tx), ty: y - k * (y - view.ty) })
  }

  return (
    <canvas
      ref={canvasRef}
      className="draw-canvas"
      style={{ touchAction: 'none', cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
      onPointerLeave={finishStroke}
      onWheel={onWheel}
    />
  )
}
