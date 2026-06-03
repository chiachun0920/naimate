import { useCallback, useEffect, useRef } from 'react'
import { clampScale } from '../canvas/DrawCanvas'
import { drawSceneElement } from './elements/draw'
import { subscribeImageLoad } from './elements/imageCache'
import { bounds, hitTest, normBox, translate } from './elements/geometry'
import type { BoxEl, DrawnElement, SceneElement, Style } from './elements/types'
import { makeId } from './sceneModel'

export interface View {
  scale: number
  tx: number
  ty: number
}

export type Tool = 'select' | 'pen' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text'

interface Props {
  elements: SceneElement[]
  view: View
  tool: Tool
  style: Style
  width: number
  height: number
  onViewChange: (v: View) => void
  onAddElement: (el: SceneElement) => void
  onUpdateElement: (el: SceneElement) => void
  onSelect: (id: string | null) => void
  onOpenAnim: (id: string) => void
  onStartText: (worldX: number, worldY: number) => void
}

export function WhiteboardCanvas({
  elements,
  view,
  tool,
  style,
  width,
  height,
  onViewChange,
  onAddElement,
  onUpdateElement,
  onSelect,
  onOpenAnim,
  onStartText,
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

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<
    | null
    | { kind: 'pan'; sx: number; sy: number; tx0: number; ty0: number }
    | { kind: 'pinch'; scale0: number; tx0: number; ty0: number; cx: number; cy: number; d0: number }
  >(null)
  const draft = useRef<DrawnElement | null>(null)
  const move = useRef<{ id: string; sx: number; sy: number; el0: SceneElement; live: SceneElement } | null>(null)
  const lastTap = useRef<{ t: number; id: string | null }>({ t: 0, id: null })

  const rel = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const toWorld = (sx: number, sy: number) => {
    const v = viewRef.current
    return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale }
  }

  const setViewTransform = useCallback(
    (g: CanvasRenderingContext2D) => {
      const v = viewRef.current
      g.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.tx, dpr * v.ty)
    },
    [dpr],
  )

  const renderBg = useCallback(
    (exceptId?: string) => {
      const bg = bgRef.current
      if (!bg || bg.width === 0 || bg.height === 0) return
      const g = bg.getContext('2d')
      if (!g) return
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, bg.width, bg.height)
      setViewTransform(g)
      for (const el of elementsRef.current) {
        if (el.type === 'animation') continue // drawn as a DOM card
        if (el.id === exceptId) continue
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
    if (draft.current) drawSceneElement(g, draft.current)
    else if (move.current) {
      const el = move.current.live
      if (el.type !== 'animation') drawSceneElement(g, el as DrawnElement)
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
    for (let i = elementsRef.current.length - 1; i >= 0; i--) {
      const el = elementsRef.current[i]
      if (hitTest(el, wx, wy, tol)) return el
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
    pointers.current.set(e.pointerId, p)
    canvasRef.current?.setPointerCapture(e.pointerId)
    if (pointers.current.size >= 2) {
      startPinch()
      return
    }
    const isTouch = e.pointerType === 'touch'
    const w = toWorld(p.x, p.y)

    if (tool === 'select') {
      const hit = hitTopmost(w.x, w.y)
      if (hit) {
        onSelect(hit.id)
        // double-tap on an animation opens it
        const now = Date.now()
        if (hit.type === 'animation' && lastTap.current.id === hit.id && now - lastTap.current.t < 320) {
          lastTap.current = { t: 0, id: null }
          onOpenAnim(hit.id)
          return
        }
        lastTap.current = { t: now, id: hit.id }
        move.current = { id: hit.id, sx: p.x, sy: p.y, el0: hit, live: hit }
        renderBg(hit.id)
      } else {
        onSelect(null)
        const v = viewRef.current
        gesture.current = { kind: 'pan', sx: p.x, sy: p.y, tx0: v.tx, ty0: v.ty }
      }
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
    draft.current = newDraft(w.x, w.y, e.pressure && e.pressure > 0 ? e.pressure : 0.5)
    renderBg()
    paintLive()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = rel(e.nativeEvent)
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p)
    const g = gesture.current

    if (g?.kind === 'pinch') {
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
    if (g?.kind === 'pan') {
      onViewChange({ scale: viewRef.current.scale, tx: g.tx0 + (p.x - g.sx), ty: g.ty0 + (p.y - g.sy) })
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
      m.live = translate(m.el0, dwx, dwy)
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
      // Only commit if it actually moved.
      onUpdateElement(live)
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
