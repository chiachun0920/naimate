import type { Doc, Pt } from '../../state/docReducer'

/** Common visual style for drawn elements. fill='transparent' means no fill. */
export interface Style {
  strokeColor: string
  strokeWidth: number
  fill: string
}

interface Base extends Style {
  id: string
}

export interface FreedrawEl extends Base {
  type: 'freedraw'
  points: Pt[] // world coords
}
export interface BoxEl extends Base {
  type: 'rect' | 'ellipse'
  x: number
  y: number
  w: number
  h: number
}
export interface LineEl extends Base {
  type: 'line' | 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
}
export interface TextEl extends Base {
  type: 'text'
  x: number
  y: number
  text: string
  fontSize: number // strokeColor doubles as the text colour
}

/** A raster image referenced by a remote URL, drawn on the canvas. */
export interface ImageEl {
  type: 'image'
  id: string
  x: number
  y: number
  w: number
  h: number
  src: string // remote image URL
}

/** An embedded animation document, rendered as a DOM card (not on the canvas). */
export interface AnimEl {
  type: 'animation'
  id: string
  x: number
  y: number
  w: number
  h: number
  name: string
  doc: Doc
}

export type SceneElement = FreedrawEl | BoxEl | LineEl | TextEl | ImageEl | AnimEl
export type DrawnElement = Exclude<SceneElement, AnimEl>
export type ElementType = SceneElement['type']

export const FONT_FAMILY = "system-ui, -apple-system, 'PingFang TC', sans-serif"
export const LINE_HEIGHT = 1.25
