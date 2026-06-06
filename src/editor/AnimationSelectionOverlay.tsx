import type { View } from '../canvas/DrawCanvas'
import type { LassoSelection } from '../canvas/DrawCanvas'
import type { Doc } from '../state/docReducer'
import { bounds } from '../scene/elements/geometry'
import { imageBounds, strokeBounds, unionRect } from './lassoGeom'

interface Props {
  doc: Doc
  view: View
  selection: LassoSelection
  onDelete: () => void
}

/**
 * Screen-space frame + delete button around the lasso selection. The box is
 * click-through so dragging falls to the canvas (group move); only 🗑 takes taps.
 */
export function AnimationSelectionOverlay({ doc, view, selection, onDelete }: Props) {
  const sset = new Set(selection.strokeIds)
  const iset = new Set(selection.imageIds)
  const shset = new Set(selection.shapeIds)
  const rects = []
  for (const s of doc.strokes) if (sset.has(s.id)) rects.push(strokeBounds(s))
  for (const im of doc.images ?? []) if (iset.has(im.id)) rects.push(imageBounds(im))
  for (const sh of doc.shapes ?? []) if (shset.has(sh.id)) rects.push(bounds(sh))
  if (rects.length === 0) return null
  const b = unionRect(rects)
  const style: React.CSSProperties = {
    left: b.x * view.scale + view.tx,
    top: b.y * view.scale + view.ty,
    width: b.w * view.scale,
    height: b.h * view.scale,
    pointerEvents: 'none',
  }
  return (
    <div className="aimg-box selected" style={style}>
      <button
        className="aimg-del danger"
        title="刪除選取"
        style={{ pointerEvents: 'auto' }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onDelete}
      >
        🗑
      </button>
    </div>
  )
}
