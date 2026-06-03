import { useRef } from 'react'
import { bounds, normBox, scaleTo, type Box } from './elements/geometry'
import type { SceneElement } from './elements/types'
import { screenBox, type View } from './WhiteboardCanvas'

type Handle = 'nw' | 'ne' | 'sw' | 'se'

interface Props {
  el: SceneElement
  view: View
  onUpdate: (el: SceneElement) => void
  onDelete: () => void
  onOpenAnim: (id: string) => void
}

const MIN = 10 // min size in world units

export function SelectionOverlay({ el, view, onUpdate, onDelete, onOpenAnim }: Props) {
  const sb = screenBox(el, view)
  const drag = useRef<{ handle: Handle; sx: number; sy: number; el0: SceneElement; box0: Box } | null>(
    null,
  )

  const onHandleDown = (e: React.PointerEvent, handle: Handle) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { handle, sx: e.clientX, sy: e.clientY, el0: el, box0: bounds(el) }
  }

  const onHandleMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    let dwx = (e.clientX - d.sx) / view.scale
    let dwy = (e.clientY - d.sy) / view.scale
    // Images keep their aspect ratio: drive both axes from the dominant drag.
    if (el.type === 'image' && d.box0.w && d.box0.h) {
      const ratio = d.box0.w / d.box0.h
      if (Math.abs(dwx) > Math.abs(dwy) * ratio) dwy = dwx / ratio
      else dwx = dwy * ratio
    }
    let { x, y, w, h } = d.box0
    if (d.handle === 'se') {
      w += dwx
      h += dwy
    } else if (d.handle === 'sw') {
      x += dwx
      w -= dwx
      h += dwy
    } else if (d.handle === 'ne') {
      y += dwy
      w += dwx
      h -= dwy
    } else {
      x += dwx
      y += dwy
      w -= dwx
      h -= dwy
    }
    if (Math.abs(w) < MIN) w = w < 0 ? -MIN : MIN
    if (Math.abs(h) < MIN) h = h < 0 ? -MIN : MIN
    onUpdate(scaleTo(d.el0, d.box0, normBox(x, y, w, h)))
  }

  const onHandleUp = (e: React.PointerEvent) => {
    if (drag.current) {
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
      drag.current = null
    }
  }

  const handles: Handle[] = ['nw', 'ne', 'sw', 'se']
  const hpos = (h: Handle): React.CSSProperties => ({
    left: h === 'nw' || h === 'sw' ? -6 : undefined,
    right: h === 'ne' || h === 'se' ? -6 : undefined,
    top: h === 'nw' || h === 'ne' ? -6 : undefined,
    bottom: h === 'sw' || h === 'se' ? -6 : undefined,
  })

  return (
    <div className="sel-box" style={{ left: sb.left, top: sb.top, width: sb.width, height: sb.height }}>
      <div className="sel-actions">
        {el.type === 'animation' && (
          <button onClick={() => onOpenAnim(el.id)} title="編輯動畫">
            編輯
          </button>
        )}
        <button className="danger" onClick={onDelete} title="刪除">
          🗑
        </button>
      </div>
      {handles.map((h) => (
        <div
          key={h}
          className="sel-handle"
          style={hpos(h)}
          onPointerDown={(e) => onHandleDown(e, h)}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        />
      ))}
    </div>
  )
}
