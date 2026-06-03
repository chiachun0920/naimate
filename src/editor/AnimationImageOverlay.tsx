import { useRef } from 'react'
import type { View } from '../canvas/DrawCanvas'
import type { AnimImage, Doc } from '../state/docReducer'
import { isBirthOnFrame } from '../state/docReducer'

type Handle = 'nw' | 'ne' | 'sw' | 'se'
const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se']
const MIN = 20 // min image size in world units

interface Props {
  doc: Doc
  currentFrame: number
  view: View
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUpdate: (id: string, patch: Partial<Pick<AnimImage, 'x' | 'y' | 'w' | 'h'>>) => void
  onRemove: (id: string) => void
}

/**
 * Screen-space DOM overlay to move/resize/delete images on the current frame.
 * Only mounted while the image tool is active, so it never blocks drawing. The
 * container is click-through; only the image boxes and handles take pointers.
 */
export function AnimationImageOverlay({
  doc,
  currentFrame,
  view,
  selectedId,
  onSelect,
  onUpdate,
  onRemove,
}: Props) {
  const drag = useRef<
    | null
    | { kind: 'move'; id: string; sx: number; sy: number; x0: number; y0: number }
    | { kind: 'resize'; id: string; handle: Handle; sx: number; sy: number; box0: AnimImage }
  >(null)

  const images = (doc.images ?? []).filter((im) =>
    isBirthOnFrame(im.birthFrame, currentFrame, doc.mode),
  )

  const startMove = (e: React.PointerEvent, im: AnimImage) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    onSelect(im.id)
    drag.current = { kind: 'move', id: im.id, sx: e.clientX, sy: e.clientY, x0: im.x, y0: im.y }
  }

  const startResize = (e: React.PointerEvent, im: AnimImage, handle: Handle) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    onSelect(im.id)
    drag.current = { kind: 'resize', id: im.id, handle, sx: e.clientX, sy: e.clientY, box0: im }
  }

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dwx = (e.clientX - d.sx) / view.scale
    const dwy = (e.clientY - d.sy) / view.scale
    if (d.kind === 'move') {
      onUpdate(d.id, { x: d.x0 + dwx, y: d.y0 + dwy })
      return
    }
    // Resize, keeping the image's aspect ratio (driven by the dominant axis).
    const b = d.box0
    const ratio = b.w && b.h ? b.w / b.h : 1
    let ex = dwx
    let ey = dwy
    if (Math.abs(ex) > Math.abs(ey) * ratio) ey = ex / ratio
    else ex = ey * ratio
    let { x, y, w, h } = b
    if (d.handle === 'se') {
      w += ex
      h += ey
    } else if (d.handle === 'sw') {
      x += ex
      w -= ex
      h += ey
    } else if (d.handle === 'ne') {
      y += ey
      w += ex
      h -= ey
    } else {
      x += ex
      y += ey
      w -= ex
      h -= ey
    }
    if (w < MIN || h < MIN) return
    onUpdate(d.id, { x, y, w, h })
  }

  const onUp = (e: React.PointerEvent) => {
    if (drag.current) {
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
      drag.current = null
    }
  }

  const hpos = (h: Handle): React.CSSProperties => ({
    left: h === 'nw' || h === 'sw' ? -6 : undefined,
    right: h === 'ne' || h === 'se' ? -6 : undefined,
    top: h === 'nw' || h === 'ne' ? -6 : undefined,
    bottom: h === 'sw' || h === 'se' ? -6 : undefined,
  })

  return (
    <div className="aimg-layer">
      {images.map((im) => {
        const selected = im.id === selectedId
        const style: React.CSSProperties = {
          left: im.x * view.scale + view.tx,
          top: im.y * view.scale + view.ty,
          width: im.w * view.scale,
          height: im.h * view.scale,
        }
        return (
          <div
            key={im.id}
            className={selected ? 'aimg-box selected' : 'aimg-box'}
            style={style}
            onPointerDown={(e) => startMove(e, im)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {selected && (
              <>
                <button
                  className="aimg-del danger"
                  title="刪除圖片"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onRemove(im.id)}
                >
                  🗑
                </button>
                {HANDLES.map((h) => (
                  <div
                    key={h}
                    className="aimg-handle"
                    style={hpos(h)}
                    onPointerDown={(e) => startResize(e, im, h)}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                  />
                ))}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
