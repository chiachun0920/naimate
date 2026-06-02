import { getStroke } from 'perfect-freehand'
import type { Pt } from '../state/docReducer'

const STROKE_OPTIONS = {
  thinning: 0.6,
  smoothing: 0.5,
  // Lower streamline keeps the line closer to the pen tip (less trailing lag).
  streamline: 0.35,
  // We feed real Apple Pencil pressure (and 0.5 for mouse), so don't simulate.
  simulatePressure: false,
}

/** Turn an array of outline points from perfect-freehand into an SVG path string. */
function outlineToSvg(points: number[][]): string {
  if (points.length === 0) return ''
  const d: (string | number)[] = ['M', points[0][0], points[0][1], 'Q']
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    d.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  d.push('Z')
  return d.join(' ')
}

/**
 * Build a fillable Path2D for a stroke at the given base size.
 * Pass `isLast = false` for an in-progress stroke so the tail isn't capped yet.
 */
export function strokeToPath(points: Pt[], size: number, isLast = true): Path2D {
  const outline = getStroke(points, { size, ...STROKE_OPTIONS, last: isLast })
  return new Path2D(outlineToSvg(outline as number[][]))
}
