import { useEffect, useRef, useState } from 'react'
import type { FrameEl } from './elements/types'

interface Props {
  frames: FrameEl[]
  selectedIds: string[]
  onGo: (frame: FrameEl) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onReorder: (orderedIds: string[]) => void
}

/**
 * Floating list of frames: tap a name to jump, double-tap to rename, 🗑 delete,
 * drag the ≡ handle to reorder. Reordering uses pointer events (not HTML5 DnD)
 * so it works under iPad Safari touch.
 */
export function FrameListPanel({ frames, selectedIds, onGo, onRename, onDelete, onReorder }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [order, setOrder] = useState<string[]>(() => frames.map((f) => f.id))
  const dragging = useRef<string | null>(null)
  const orderRef = useRef(order)
  orderRef.current = order
  const listRef = useRef<HTMLDivElement>(null)

  // Track frame add/remove while not mid-drag (preserves a manual reorder).
  useEffect(() => {
    if (!dragging.current) setOrder(frames.map((f) => f.id))
  }, [frames])

  if (frames.length === 0) return null

  const byId = new Map(frames.map((f) => [f.id, f]))
  const ordered = order.map((id) => byId.get(id)).filter((f): f is FrameEl => Boolean(f))

  const startEdit = (f: FrameEl) => {
    setEditingId(f.id)
    setDraft(f.name)
  }
  const commitEdit = () => {
    if (editingId) {
      const name = draft.trim()
      if (name) onRename(editingId, name)
    }
    setEditingId(null)
  }

  const onHandleDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragging.current = id
  }
  const onHandleMove = (e: React.PointerEvent) => {
    if (!dragging.current || !listRef.current) return
    const from = dragging.current
    const rows = [...listRef.current.querySelectorAll<HTMLElement>('[data-id]')]
    let targetId: string | null = null
    for (const row of rows) {
      const r = row.getBoundingClientRect()
      if (e.clientY < r.top + r.height / 2) {
        targetId = row.dataset.id ?? null
        break
      }
    }
    setOrder((prev) => {
      const next = prev.filter((x) => x !== from)
      const at = targetId ? next.indexOf(targetId) : next.length
      next.splice(at < 0 ? next.length : at, 0, from)
      return next
    })
  }
  const onHandleUp = (e: React.PointerEvent) => {
    if (!dragging.current) return
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    dragging.current = null
    onReorder(orderRef.current)
  }

  return (
    <div className="frame-list panel" ref={listRef}>
      <div className="frame-list-head">框架</div>
      {ordered.map((f) => (
        <div
          key={f.id}
          data-id={f.id}
          className={`frame-row${selectedIds.includes(f.id) ? ' active' : ''}`}
        >
          <button
            className="frame-row-drag"
            title="拖曳排序"
            onPointerDown={(e) => onHandleDown(e, f.id)}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          >
            ≡
          </button>
          {editingId === f.id ? (
            <input
              className="frame-row-input"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                else if (e.key === 'Escape') setEditingId(null)
              }}
            />
          ) : (
            <button
              className="frame-row-name"
              title="跳到此框架（雙擊改名）"
              onClick={() => onGo(f)}
              onDoubleClick={() => startEdit(f)}
            >
              {f.name}
            </button>
          )}
          <button className="frame-row-del danger" title="刪除框架" onClick={() => onDelete(f.id)}>
            🗑
          </button>
        </div>
      ))}
    </div>
  )
}
