import { getStroke } from 'perfect-freehand'
import type { Pt } from '../state/docReducer'

const STROKE_OPTIONS = {
  // Lower thinning so width swings less with pressure — large pressure jitter at
  // fat sizes was the main source of the spiky "毛邊" outline.
  thinning: 0.45,
  // A touch more outline smoothing softens corners.
  smoothing: 0.62,
  // Lower streamline keeps the line closer to the pen tip (less trailing lag).
  streamline: 0.35,
  // We feed real Apple Pencil pressure (and 0.5 for mouse), so don't simulate.
  simulatePressure: false,
}

/**
 * Moving-average each channel to remove the per-sample jitter Apple Pencil
 * reports. Pressure jitter wobbles the stroke radius (barbs on fat strokes);
 * x/y jitter wobbles the centre line (ragged edges on thin strokes). A light
 * window on position keeps handwriting corners crisp; a wider one on pressure
 * preserves the pressure feel while killing the spikes.
 */
function smoothPoints(points: Pt[], posWindow = 3, pressWindow = 5): Pt[] {
  const n = points.length
  if (n < 3) return points
  const avg = (i: number, half: number, ch: 0 | 1 | 2) => {
    let sum = 0
    let count = 0
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= n) continue
      sum += points[j][ch]
      count++
    }
    return sum / count
  }
  const posHalf = Math.floor(posWindow / 2)
  const prHalf = Math.floor(pressWindow / 2)
  return points.map(
    (_, i) => [avg(i, posHalf, 0), avg(i, posHalf, 1), avg(i, prHalf, 2)] as Pt,
  )
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
  const pts = smoothPoints(points)
  const outline = getStroke(pts, { size, ...STROKE_OPTIONS, last: isLast })
  return new Path2D(outlineToSvg(outline as number[][]))
}
