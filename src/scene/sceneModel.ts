import { DEFAULT_DOC } from '../state/docReducer'
import type { AnimEl, ImageEl, SceneElement, Style } from './elements/types'

export type { SceneElement } from './elements/types'

export interface Scene {
  elements: SceneElement[]
}

export const DEFAULT_SCENE: Scene = { elements: [] }

/** Default on-canvas size of an animation object (whiteboard world units). */
export const OBJ_W = 360
export const OBJ_H = 270

export const DEFAULT_STYLE: Style = {
  strokeColor: '#1a1a1a',
  strokeWidth: 4,
  fill: 'transparent',
}
export const DEFAULT_FONT_SIZE = 24

let counter = 0
export function makeId(): string {
  counter += 1
  return `e${counter}_${Date.now().toString(36)}`
}

/** Longest-side cap for a freshly inserted image (whiteboard world units). */
export const IMG_MAX = 360

/** An image element fit to IMG_MAX, centered on (cx, cy) in world coords. */
export function newImageElement(
  src: string,
  naturalW: number,
  naturalH: number,
  cx: number,
  cy: number,
): ImageEl {
  const ratio = naturalW > 0 && naturalH > 0 ? naturalW / naturalH : 1
  const w = ratio >= 1 ? IMG_MAX : IMG_MAX * ratio
  const h = ratio >= 1 ? IMG_MAX / ratio : IMG_MAX
  return { type: 'image', id: makeId(), x: cx - w / 2, y: cy - h / 2, w, h, src }
}

/** A fresh, empty animation element at the given top-left world position. */
export function newAnimationElement(x: number, y: number, index: number): AnimEl {
  return {
    type: 'animation',
    id: makeId(),
    x,
    y,
    w: OBJ_W,
    h: OBJ_H,
    name: `動畫 ${index}`,
    doc: { ...DEFAULT_DOC },
  }
}
