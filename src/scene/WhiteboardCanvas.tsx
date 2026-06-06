import { useCallback, useEffect, useRef } from 'react'
import { clampScale } from '../canvas/DrawCanvas'
import { strokeToPath } from '../canvas/strokePath'
import { drawSceneElement } from './elements/draw'
import { subscribeImageLoad } from './elements/imageCache'
import { boxInPolygon, bounds, hitTest, normBox, translate, unionBounds, type Box } from './elements/geometry'
import { FONT_FAMILY, type BoxEl, type DrawnElement, type SceneElement, type Style } from './elements/types'
import { makeId } from './sceneModel'

export interface View {
  scale: number
  tx: number
  ty: number
}

export type Tool = 'select' | 'lasso' | 'frame' | 'pen' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text'

interface Props {
  elements: SceneElement[]
  view: View
  tool: Tool
  style: Style
  width: number
  height: number
  selectedIds: string[]
  onViewChange: (v: View) => void
  onAddElement: (el: SceneElement) => void
  onUpdateElements: (els: SceneElement[]) => void
  onSelect: (id: string | null) => void
  onSelectMany: (ids: string[]) => void
  onOpenAnim: (id: string) => void
  onStartText: (worldX: number, worldY: number) => void
  /** Frame tool: a rectangle was dragged out (world-space box). */
  onAddFrame: (box: Box) => void
}

const FRAME_STROKE = 'rgba(80, 90, 110, 0.7)'

/** Draw a frame's outline in world coordinates (caller has set the view transform). */
function strokeFrameOutline(g: CanvasRenderingContext2D, b: Box, scale: number) {
  g.save()
  g.strokeStyle = FRAME_STROKE
  g.lineWidth = 1.5 / scale
  g.strokeRect(b.x, b.y, b.w, b.h)
  g.restore()
}

/** Drag-preview ghost for an animation card (it lives in the DOM, so the canvas
 * has to stand in for it during a move). Dashed box + the name, centred. */
function strokeAnimGhost(g: CanvasRenderingContext2D, b: Box, name: string, scale: number) {
  g.save()
  g.lineWidth = 1.5 / scale
  g.setLineDash([6 / scale, 4 / scale])
  g.strokeStyle = '#2a6fdb'
  g.fillStyle = 'rgba(42, 111, 219, 0.08)'
  g.beginPath()
  g.rect(b.x, b.y, b.w, b.h)
  g.fill()
  g.stroke()
  g.setLineDash([])
  g.fillStyle = '#2a6fdb'
  g.font = `${13 / scale}px ${FONT_FAMILY}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(name, b.x + b.w / 2, b.y + b.h / 2)
  g.restore()
}

export function WhiteboardCanvas({
  elements,
  view,
  tool,
  style,
  width,
  height,
  selectedIds,
  onViewChange,
  onAddElement,
  onUpdateElements,
  onSelect,
  onSelectMany,
  onOpenAnim,
  onStartText,
  onAddFrame,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const rafId = useRef<number | null>(null)
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

  const viewRef = useRef(view)
  viewRef.current = view
  const elementsRef = useRef(elements)
  elementsRef.current = elements
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<
    | null
    | { kind: 'pan'; sx: number; sy: number; tx0: number; ty0: number }
    | { kind: 'pinch'; scale0: number; tx0: number; ty0: number; cx: number; cy: number; d0: number }
  >(null)
  const draft = useRef<DrawnElement | null>(null)
  const move = useRef<
    | null
    | { sx: number; sy: number; els0: SceneElement[]; live: SceneElement[] }
  >(null)
  // Lasso polygon (world coords) while the lasso tool is dragging.
  const lasso = useRef<number[][] | null>(null)
  // Frame rectangle (world coords) while the frame tool is dragging.
  const frameDraft = useRef<Box | null>(null)
  const lastTap = useRef<{ t: number; id: string | null }>({ t: 0, id: null })

  const rel = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const toWorld = (sx: number, sy: number) => {
    const v = viewRef.current
    return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale }
  }
  // Intentionally a no-op: we do NOT use setPointerCapture. On iPadOS Safari its
  // capture lifecycle swallows the next quickly-arriving pointerdown (a fast 2nd
  // stroke gets no events at all). The canvas covers the whole board and
  // touch-action:none is set, so capture isn't needed.
  const capture = (_id: number) => {}

  const setViewTransform = useCallback(
    (g: CanvasRenderingContext2D) => {
      const v = viewRef.current
      g.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.tx, dpr * v.ty)
    },
    [dpr],
  )

  const renderBg = useCallback(
    (exceptIds?: Set<string>) => {
      const bg = bgRef.current
      if (!bg || bg.width === 0 || bg.height === 0) return
      const g = bg.getContext('2d')
      if (!g) return
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, bg.width, bg.height)
      setViewTransform(g)
      const scale = viewRef.current.scale
      // Frames first so their outlines sit behind the drawn content.
      for (const el of elementsRef.current) {
        if (el.type !== 'frame') continue
        if (exceptIds?.has(el.id)) continue
        strokeFrameOutline(g, bounds(el), scale)
      }
      for (const el of elementsRef.current) {
        if (el.type === 'animation' || el.type === 'frame') continue // anim = DOM card, frame = above
        if (exceptIds?.has(el.id)) continue
        drawSceneElement(g, el as DrawnElement)
      }
    },
    [setViewTransform],
  )

  const blit = () => {
    const g = ctxRef.current
    const bg = bgRef.current
    if (!g || !bg || bg.width === 0 || bg.height === 0) return
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, bg.width, bg.height)
    g.drawImage(bg, 0, 0)
  }

  const paintStatic = useCallback(() => {
    renderBg()
    blit()
  }, [renderBg])

  const paintLive = () => {
    const g = ctxRef.current
    if (!g) return
    blit()
    setViewTransform(g)
    if (draft.current) {
      const d = draft.current
      if (d.type === 'freedraw') {
        // In-progress freedraw mutates one points array in place; draw it with
        // isLast=false so it bypasses the strokeToPath cache (which is keyed by
        // the array reference and would otherwise return a stale path).
        g.save()
        g.lineJoin = 'round'
        g.lineCap = 'round'
        g.fillStyle = d.strokeColor
        g.fill(strokeToPath(d.points, d.strokeWidth, false))
        g.restore()
      } else {
        drawSceneElement(g, d)
      }
    } else if (move.current) {
      for (const el of move.current.live) {
        if (el.type === 'frame') strokeFrameOutline(g, bounds(el), viewRef.current.scale)
        else if (el.type === 'animation')
          strokeAnimGhost(g, bounds(el), el.name, viewRef.current.scale)
        else drawSceneElement(g, el as DrawnElement)
      }
    } else if (frameDraft.current) {
      const b = normBox(frameDraft.current.x, frameDraft.current.y, frameDraft.current.w, frameDraft.current.h)
      g.save()
      g.lineJoin = 'round'
      g.lineWidth = 1.5 / viewRef.current.scale
      g.setLineDash([6 / viewRef.current.scale, 4 / viewRef.current.scale])
      g.strokeStyle = '#2a6fdb'
      g.fillStyle = 'rgba(42, 111, 219, 0.06)'
      g.beginPath()
      g.rect(b.x, b.y, b.w, b.h)
      g.fill()
      g.stroke()
      g.restore()
    } else if (lasso.current && lasso.current.length > 1) {
      const poly = lasso.current
      g.save()
      g.lineJoin = 'round'
      g.lineWidth = 1.5 / viewRef.current.scale
      g.setLineDash([6 / viewRef.current.scale, 4 / viewRef.current.scale])
      g.strokeStyle = '#2a6fdb'
      g.fillStyle = 'rgba(42, 111, 219, 0.08)'
      g.beginPath()
      g.moveTo(poly[0][0], poly[0][1])
      for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0], poly[i][1])
      g.closePath()
      g.fill()
      g.stroke()
      g.restore()
    }
  }

  const schedule = (fn: () => void) => {
    if (rafId.current != null) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null
      fn()
    })
  }

  // Size canvases for high-DPI.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    if (width <= 0 || height <= 0) return // not measured yet (e.g. just remounted)
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

  // Repaint when elements or the committed view changes (not mid-draw/move).
  useEffect(() => {
    paintStatic()
  }, [elements, view, paintStatic])

  useEffect(
    () => () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current)
    },
    [],
  )

  // iPadOS Safari swallows a rapid SECOND Apple Pencil tap (its double-tap /
  // gesture recognizer eats it before any pointer/touch event is dispatched).
  // preventDefault on a non-passive touchstart for stylus touches disengages
  // that recognizer so the second stroke is delivered. Finger touches untouched.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const onTouchStart = (e: TouchEvent) => {
      for (const t of Array.from(e.touches)) {
        if ((t as Touch & { touchType?: string }).touchType === 'stylus') {
          e.preventDefault()
          break
        }
      }
    }
    c.addEventListener('touchstart', onTouchStart, { passive: false })
    return () => c.removeEventListener('touchstart', onTouchStart)
  }, [])

  // Repaint once a referenced image finishes loading (async, not mid-draw).
  useEffect(() => subscribeImageLoad(() => paintStatic()), [paintStatic])

  // --- gestures -------------------------------------------------------------
  const startPinch = () => {
    const pts = [...pointers.current.values()]
    if (pts.length < 2) return
    const [a, b] = pts
    const v = viewRef.current
    gesture.current = {
      kind: 'pinch',
      scale0: v.scale,
      tx0: v.tx,
      ty0: v.ty,
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    }
    draft.current = null
    move.current = null
  }

  const hitTopmost = (wx: number, wy: number): SceneElement | null => {
    const tol = 8 / viewRef.current.scale
    const els = elementsRef.current
    // Content takes priority; frames are lowest so a click inside a frame grabs
    // the content over it, and only empty frame interior selects the frame.
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i]
      if (el.type === 'frame') continue
      if (hitTest(el, wx, wy, tol)) return el
    }
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i]
      if (el.type === 'frame' && hitTest(el, wx, wy, tol)) return el
    }
    return null
  }

  const newDraft = (wx: number, wy: number, pressure: number): DrawnElement => {
    const base = { id: makeId(), ...style }
    if (tool === 'pen') return { ...base, type: 'freedraw', points: [[wx, wy, pressure]] }
    if (tool === 'line' || tool === 'arrow')
      return { ...base, type: tool, x1: wx, y1: wy, x2: wx, y2: wy }
    return { ...base, type: tool === 'ellipse' ? 'ellipse' : 'rect', x: wx, y: wy, w: 0, h: 0 }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const p = rel(e.nativeEvent)
    const isTouch = e.pointerType === 'touch'
    // Palm rejection: ignore a touch that lands while a pen operation is in
    // progress (drawing / dragging / lasso / frame), so a resting hand can't
    // start a pan that hijacks the stroke.
    if (isTouch && (draft.current || move.current || lasso.current || frameDraft.current)) return
    capture(e.pointerId)
    // Only touch pointers drive pan/pinch. A pen/mouse must never be counted —
    // otherwise a leftover pointerId from a fast previous stroke makes the next
    // pen down look like a 2-finger pinch and the stroke is dropped.
    if (isTouch) {
      pointers.current.set(e.pointerId, p)
      if (pointers.current.size >= 2) {
        startPinch()
        return
      }
    }
    const w = toWorld(p.x, p.y)

    if (tool === 'select') {
      const hit = hitTopmost(w.x, w.y)
      if (hit) {
        // double-tap on an animation opens it
        const now = Date.now()
        if (hit.type === 'animation' && lastTap.current.id === hit.id && now - lastTap.current.t < 320) {
          lastTap.current = { t: 0, id: null }
          onOpenAnim(hit.id)
          return
        }
        lastTap.current = { t: now, id: hit.id }
        // Dragging an already-multi-selected element moves the whole group;
        // otherwise collapse to a single selection and move just that one.
        const sel = selectedIdsRef.current
        const groupMove = sel.length > 1 && sel.includes(hit.id)
        const ids = groupMove ? sel : [hit.id]
        if (!groupMove) onSelect(hit.id)
        const els0 = elementsRef.current.filter((el) => ids.includes(el.id))
        move.current = { sx: p.x, sy: p.y, els0, live: els0 }
        renderBg(new Set(ids))
      } else {
        onSelect(null)
        const v = viewRef.current
        gesture.current = { kind: 'pan', sx: p.x, sy: p.y, tx0: v.tx, ty0: v.ty }
      }
      return
    }

    if (tool === 'lasso') {
      // finger pans / pinches; pen/mouse draws the lasso polygon
      if (isTouch) {
        const v = viewRef.current
        gesture.current = { kind: 'pan', sx: p.x, sy: p.y, tx0: v.tx, ty0: v.ty }
        return
      }
      // Pressing inside the current selection drags the whole group (like the
      // animation editor); pressing outside starts a fresh lasso polygon.
      const sel = selectedIdsRef.current
      if (sel.length > 0) {
        const selEls = elementsRef.current.filter((e) => sel.includes(e.id))
        const b = unionBounds(selEls)
        const tol = 6 / viewRef.current.scale
        if (w.x >= b.x - tol && w.x <= b.x + b.w + tol && w.y >= b.y - tol && w.y <= b.y + b.h + tol) {
          move.current = { sx: p.x, sy: p.y, els0: selEls, live: selEls }
          renderBg(new Set(sel))
          return
        }
      }
      lasso.current = [[w.x, w.y]]
      renderBg()
      paintLive()
      return
    }

    // drawing tools: finger pans, pen/mouse draws
    if (isTouch) {
      const v = viewRef.current
      gesture.current = { kind: 'pan', sx: p.x, sy: p.y, tx0: v.tx, ty0: v.ty }
      return
    }
    if (tool === 'text') {
      onStartText(w.x, w.y)
      return
    }
    if (tool === 'frame') {
      frameDraft.current = { x: w.x, y: w.y, w: 0, h: 0 }
      renderBg()
      paintLive()
      return
    }
    draft.current = newDraft(w.x, w.y, e.pressure && e.pressure > 0 ? e.pressure : 0.5)
    renderBg()
    paintLive()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = rel(e.nativeEvent)
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p)
    // Recover a dropped `pointerdown` on a fast hover→contact (hover-capable
    // Apple Pencil): start a freedraw on the first contact move.
    if (
      !gesture.current &&
      !draft.current &&
      !move.current &&
      !lasso.current &&
      !frameDraft.current &&
      tool === 'pen' &&
      e.pointerType !== 'touch' &&
      ((e.pressure ?? 0) > 0 || (e.buttons & 1) === 1)
    ) {
      const w = toWorld(p.x, p.y)
      draft.current = newDraft(w.x, w.y, e.pressure && e.pressure > 0 ? e.pressure : 0.5)
      capture(e.pointerId)
      renderBg()
      schedule(paintLive)
      return
    }
    // A pen operation in progress takes priority over any (palm) gesture:
    // ignore touch moves entirely, and route the pen's own moves to its draft
    // rather than letting a stray pan/pinch consume them.
    const penOp = !!(draft.current || move.current || lasso.current || frameDraft.current)
    if (penOp && e.pointerType === 'touch') return
    const g = gesture.current

    if (g && !penOp && g.kind === 'pinch') {
      const pts = [...pointers.current.values()]
      if (pts.length < 2) return
      const [a, b] = pts
      const cx1 = (a.x + b.x) / 2
      const cy1 = (a.y + b.y) / 2
      const d1 = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const scale = clampScale(g.scale0 * (d1 / g.d0))
      const wx = (g.cx - g.tx0) / g.scale0
      const wy = (g.cy - g.ty0) / g.scale0
      onViewChange({ scale, tx: cx1 - scale * wx, ty: cy1 - scale * wy })
      return
    }
    if (g && !penOp && g.kind === 'pan') {
      onViewChange({ scale: viewRef.current.scale, tx: g.tx0 + (p.x - g.sx), ty: g.ty0 + (p.y - g.sy) })
      return
    }
    if (frameDraft.current) {
      const w = toWorld(p.x, p.y)
      frameDraft.current.w = w.x - frameDraft.current.x
      frameDraft.current.h = w.y - frameDraft.current.y
      schedule(paintLive)
      return
    }
    if (lasso.current) {
      const ne = e.nativeEvent
      const evs = typeof ne.getCoalescedEvents === 'function' ? ne.getCoalescedEvents() : [ne]
      for (const ev of evs.length ? evs : [ne]) {
        const r = rel(ev)
        const q = toWorld(r.x, r.y)
        lasso.current.push([q.x, q.y])
      }
      schedule(paintLive)
      return
    }
    if (draft.current) {
      const w = toWorld(p.x, p.y)
      const d = draft.current
      switch (d.type) {
        case 'freedraw': {
          const ne = e.nativeEvent
          const evs = typeof ne.getCoalescedEvents === 'function' ? ne.getCoalescedEvents() : [ne]
          for (const ev of evs.length ? evs : [ne]) {
            const r = rel(ev)
            const q = toWorld(r.x, r.y)
            d.points.push([q.x, q.y, ev.pressure && ev.pressure > 0 ? ev.pressure : 0.5])
          }
          break
        }
        case 'line':
        case 'arrow':
          d.x2 = w.x
          d.y2 = w.y
          break
        case 'rect':
        case 'ellipse':
          d.w = w.x - d.x
          d.h = w.y - d.y
          break
      }
      schedule(paintLive)
      return
    }
    if (move.current) {
      const m = move.current
      const dwx = (p.x - m.sx) / viewRef.current.scale
      const dwy = (p.y - m.sy) / viewRef.current.scale
      m.live = m.els0.map((el) => translate(el, dwx, dwy))
      schedule(paintLive)
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current)
      rafId.current = null
    }
    if (gesture.current) {
      if (gesture.current.kind === 'pinch' && pointers.current.size >= 2) return
      gesture.current = null
      return
    }
    if (frameDraft.current) {
      const d = frameDraft.current
      frameDraft.current = null
      const b = normBox(d.x, d.y, d.w, d.h)
      if (b.w < 2 && b.h < 2) {
        paintStatic()
        return
      }
      onAddFrame(b)
      return
    }
    if (lasso.current) {
      const poly = lasso.current
      lasso.current = null
      const ids =
        poly.length >= 3
          ? elementsRef.current.filter((el) => boxInPolygon(bounds(el), poly)).map((el) => el.id)
          : []
      onSelectMany(ids)
      paintStatic()
      return
    }
    if (draft.current) {
      const d = draft.current
      draft.current = null
      if (d.type === 'rect' || d.type === 'ellipse') {
        const box = d as BoxEl
        const b = normBox(box.x, box.y, box.w, box.h)
        if (b.w < 2 && b.h < 2) {
          paintStatic()
          return
        }
        onAddElement({ ...box, x: b.x, y: b.y, w: b.w, h: b.h })
      } else {
        onAddElement(d)
      }
      return
    }
    if (move.current) {
      const live = move.current.live
      move.current = null
      onUpdateElements(live)
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="wb-canvas"
      style={{ touchAction: 'none', cursor: tool === 'select' ? 'default' : 'crosshair' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
    />
  )
}

/** Screen bbox of an element under a view, for the selection overlay. */
export function screenBox(el: SceneElement, view: View) {
  const b = bounds(el)
  return {
    left: b.x * view.scale + view.tx,
    top: b.y * view.scale + view.ty,
    width: b.w * view.scale,
    height: b.h * view.scale,
  }
}
