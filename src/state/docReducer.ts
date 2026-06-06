// Core data model for nanimate.
//
// The whole app rests on a stroke-based model: every stroke records the frame
// it is first born in (`birthFrame`). Frame N renders every stroke whose
// birthFrame <= N. This makes "additive" animation automatic (later frames
// naturally contain earlier strokes) while still allowing old frames to be
// edited — deleting a stroke removes it from every frame, and a stroke added
// while editing frame K appears from frame K onward.

import type { BoxEl, LineEl, TextEl } from '../scene/elements/types'

export type Pt = [x: number, y: number, pressure: number]

/**
 * A crisp vector shape on a frame. Same geometry/style as the whiteboard's
 * shapes (so we can reuse drawSceneElement/bounds/hitTest/translate), plus the
 * animation's frame fields. (Type-only import — types.ts imports Doc/Pt back, so
 * this would be a cycle at runtime, but type imports are erased.)
 */
type FrameFields = { birthFrame: number; seed?: boolean }
export type AnimShape =
  | (BoxEl & FrameFields)
  | (LineEl & FrameFields)
  | (TextEl & FrameFields)

export interface Stroke {
  id: string
  points: Pt[]
  birthFrame: number
  color: string
  size: number
  /** True if carried over (copied) from the previous frame in independent mode. */
  seed?: boolean
}

/** A raster image (remote URL) placed on a frame; behaves like a stroke w.r.t. frames. */
export interface AnimImage {
  id: string
  src: string
  x: number
  y: number
  w: number
  h: number
  birthFrame: number
  /** True if carried over (copied) from the previous frame in independent mode. */
  seed?: boolean
}

/**
 * Animation mode (locked per document once any content exists):
 * - 'additive':    frame N shows every stroke with birthFrame <= N (strokes
 *                  accumulate; editing an old frame propagates forward).
 * - 'independent': frame N shows only strokes with birthFrame === N (each frame
 *                  is its own cel; "完成這一幀" seeds the new frame with a copy
 *                  of the previous one, then edits stay local to that frame).
 */
export type AnimMode = 'additive' | 'independent'

export interface Doc {
  strokes: Stroke[]
  images: AnimImage[]
  shapes: AnimShape[]
  frameCount: number
  fps: number
  mode: AnimMode
}

export type Tool = 'pen' | 'eraser' | 'image' | 'lasso' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text'

export interface EditorState {
  doc: Doc
  currentFrame: number
  color: string
  size: number
  /** Fill for new rect/ellipse shapes ('transparent' = none). */
  fill: string
  /** Font size for new text shapes. */
  fontSize: number
  tool: Tool
  /** Reject touch input (palm/finger) so only Apple Pencil / mouse draws. */
  penOnly: boolean
}

export type Action =
  | { type: 'addStroke'; points: Pt[] }
  | { type: 'removeStroke'; id: string }
  | { type: 'addImage'; id: string; src: string; x: number; y: number; w: number; h: number }
  | { type: 'updateImage'; id: string; patch: Partial<Pick<AnimImage, 'x' | 'y' | 'w' | 'h'>> }
  | { type: 'removeImage'; id: string }
  | { type: 'translateStrokes'; ids: string[]; dx: number; dy: number }
  | { type: 'translateImages'; ids: string[]; dx: number; dy: number }
  | { type: 'translateShapes'; ids: string[]; dx: number; dy: number }
  | { type: 'removeStrokes'; ids: string[] }
  | { type: 'removeImages'; ids: string[] }
  | { type: 'removeShapes'; ids: string[] }
  | { type: 'addShape'; shape: BoxEl | LineEl | TextEl }
  | { type: 'commitFrame' }
  | { type: 'selectFrame'; index: number }
  | { type: 'deleteFrame'; index: number }
  | { type: 'undo' }
  | { type: 'clear' }
  | { type: 'loadDoc'; doc: Doc }
  | { type: 'setColor'; color: string }
  | { type: 'setSize'; size: number }
  | { type: 'setFill'; fill: string }
  | { type: 'setFontSize'; fontSize: number }
  | { type: 'setTool'; tool: Tool }
  | { type: 'setFps'; fps: number }
  | { type: 'setPenOnly'; value: boolean }
  | { type: 'setMode'; mode: AnimMode }

export const DEFAULT_DOC: Doc = { strokes: [], images: [], shapes: [], frameCount: 1, fps: 6, mode: 'additive' }

export const DEFAULT_STATE: EditorState = {
  doc: DEFAULT_DOC,
  currentFrame: 0,
  color: '#1a1a1a',
  size: 8,
  fill: 'transparent',
  fontSize: 24,
  tool: 'pen',
  penOnly: true,
}

let idCounter = 0
function makeId(): string {
  idCounter += 1
  return `s${idCounter}_${idCounter * 2654435761 % 1000000}`
}

/** Whether content born on `birthFrame` is visible on `frameIndex` under the mode. */
export function isBirthOnFrame(birthFrame: number, frameIndex: number, mode: AnimMode): boolean {
  return mode === 'independent' ? birthFrame === frameIndex : birthFrame <= frameIndex
}

/** Whether a stroke is visible on frame `frameIndex` under the given mode. */
export function isStrokeOnFrame(s: Stroke, frameIndex: number, mode: AnimMode): boolean {
  return isBirthOnFrame(s.birthFrame, frameIndex, mode)
}

/** The document has no content yet, so the animation mode is still selectable. */
export function isDocEmpty(doc: Doc): boolean {
  return (
    doc.strokes.length === 0 &&
    (doc.images?.length ?? 0) === 0 &&
    (doc.shapes?.length ?? 0) === 0 &&
    doc.frameCount === 1
  )
}

export function reducer(state: EditorState, action: Action): EditorState {
  const { doc } = state
  switch (action.type) {
    case 'addStroke': {
      const stroke: Stroke = {
        id: makeId(),
        points: action.points,
        birthFrame: state.currentFrame,
        color: state.color,
        size: state.size,
      }
      return { ...state, doc: { ...doc, strokes: [...doc.strokes, stroke] } }
    }
    case 'removeStroke':
      return {
        ...state,
        doc: { ...doc, strokes: doc.strokes.filter((s) => s.id !== action.id) },
      }
    case 'addImage': {
      const image: AnimImage = {
        id: action.id,
        src: action.src,
        x: action.x,
        y: action.y,
        w: action.w,
        h: action.h,
        birthFrame: state.currentFrame,
      }
      return { ...state, doc: { ...doc, images: [...doc.images, image] } }
    }
    case 'updateImage':
      return {
        ...state,
        doc: {
          ...doc,
          images: doc.images.map((im) => (im.id === action.id ? { ...im, ...action.patch } : im)),
        },
      }
    case 'removeImage':
      return {
        ...state,
        doc: { ...doc, images: doc.images.filter((im) => im.id !== action.id) },
      }
    case 'translateStrokes': {
      const ids = new Set(action.ids)
      const { dx, dy } = action
      return {
        ...state,
        doc: {
          ...doc,
          strokes: doc.strokes.map((s) =>
            ids.has(s.id)
              ? { ...s, points: s.points.map(([x, y, p]) => [x + dx, y + dy, p] as Pt) }
              : s,
          ),
        },
      }
    }
    case 'translateImages': {
      const ids = new Set(action.ids)
      const { dx, dy } = action
      return {
        ...state,
        doc: {
          ...doc,
          images: doc.images.map((im) =>
            ids.has(im.id) ? { ...im, x: im.x + dx, y: im.y + dy } : im,
          ),
        },
      }
    }
    case 'translateShapes': {
      const ids = new Set(action.ids)
      const { dx, dy } = action
      // Inline translate (avoids a runtime import of scene geometry into the state layer).
      return {
        ...state,
        doc: {
          ...doc,
          shapes: (doc.shapes ?? []).map((sh) => {
            if (!ids.has(sh.id)) return sh
            switch (sh.type) {
              case 'line':
              case 'arrow':
                return { ...sh, x1: sh.x1 + dx, y1: sh.y1 + dy, x2: sh.x2 + dx, y2: sh.y2 + dy }
              default:
                return { ...sh, x: sh.x + dx, y: sh.y + dy }
            }
          }),
        },
      }
    }
    case 'removeStrokes': {
      const ids = new Set(action.ids)
      return { ...state, doc: { ...doc, strokes: doc.strokes.filter((s) => !ids.has(s.id)) } }
    }
    case 'removeImages': {
      const ids = new Set(action.ids)
      return { ...state, doc: { ...doc, images: doc.images.filter((im) => !ids.has(im.id)) } }
    }
    case 'removeShapes': {
      const ids = new Set(action.ids)
      return { ...state, doc: { ...doc, shapes: (doc.shapes ?? []).filter((sh) => !ids.has(sh.id)) } }
    }
    case 'addShape': {
      const shape: AnimShape = { ...action.shape, birthFrame: state.currentFrame }
      return { ...state, doc: { ...doc, shapes: [...(doc.shapes ?? []), shape] } }
    }
    case 'commitFrame': {
      const newIndex = doc.frameCount
      const newCount = doc.frameCount + 1
      // Independent mode: seed the new frame with an editable copy of the frame
      // we're finishing, so each cel starts from the previous one.
      const copiedStrokes =
        doc.mode === 'independent'
          ? doc.strokes
              .filter((s) => s.birthFrame === state.currentFrame)
              .map((s) => ({ ...s, id: makeId(), birthFrame: newIndex, seed: true }))
          : []
      const copiedImages =
        doc.mode === 'independent'
          ? doc.images
              .filter((im) => im.birthFrame === state.currentFrame)
              .map((im) => ({ ...im, id: makeId(), birthFrame: newIndex, seed: true }))
          : []
      const copiedShapes =
        doc.mode === 'independent'
          ? (doc.shapes ?? [])
              .filter((sh) => sh.birthFrame === state.currentFrame)
              .map((sh) => ({ ...sh, id: makeId(), birthFrame: newIndex, seed: true }))
          : []
      return {
        ...state,
        doc: {
          ...doc,
          frameCount: newCount,
          strokes: [...doc.strokes, ...copiedStrokes],
          images: [...doc.images, ...copiedImages],
          shapes: [...(doc.shapes ?? []), ...copiedShapes],
        },
        currentFrame: newIndex,
      }
    }
    case 'selectFrame':
      return { ...state, currentFrame: clamp(action.index, 0, doc.frameCount - 1) }
    case 'deleteFrame': {
      if (doc.frameCount <= 1) return { ...state, doc: { ...doc, strokes: [], images: [], shapes: [] } }
      const i = action.index
      // Drop content born on this frame, shift later births down by one.
      const strokes = doc.strokes
        .filter((s) => s.birthFrame !== i)
        .map((s) => (s.birthFrame > i ? { ...s, birthFrame: s.birthFrame - 1 } : s))
      const images = doc.images
        .filter((im) => im.birthFrame !== i)
        .map((im) => (im.birthFrame > i ? { ...im, birthFrame: im.birthFrame - 1 } : im))
      const shapes = (doc.shapes ?? [])
        .filter((sh) => sh.birthFrame !== i)
        .map((sh) => (sh.birthFrame > i ? { ...sh, birthFrame: sh.birthFrame - 1 } : sh))
      const frameCount = doc.frameCount - 1
      return {
        ...state,
        doc: { ...doc, strokes, images, shapes, frameCount },
        currentFrame: clamp(state.currentFrame > i ? state.currentFrame - 1 : state.currentFrame, 0, frameCount - 1),
      }
    }
    case 'undo':
      return { ...state, doc: { ...doc, strokes: doc.strokes.slice(0, -1) } }
    case 'clear':
      return { ...state, doc: { ...DEFAULT_DOC, fps: doc.fps, mode: doc.mode }, currentFrame: 0 }
    case 'loadDoc':
      return { ...state, doc: action.doc, currentFrame: clamp(0, 0, action.doc.frameCount - 1) }
    case 'setColor':
      return { ...state, color: action.color }
    case 'setSize':
      return { ...state, size: action.size }
    case 'setFill':
      return { ...state, fill: action.fill }
    case 'setFontSize':
      return { ...state, fontSize: action.fontSize }
    case 'setTool':
      return { ...state, tool: action.tool }
    case 'setFps':
      return { ...state, doc: { ...doc, fps: clamp(action.fps, 1, 60) } }
    case 'setPenOnly':
      return { ...state, penOnly: action.value }
    case 'setMode':
      // Mode is locked once the document has any content.
      if (!isDocEmpty(doc)) return state
      return { ...state, doc: { ...doc, mode: action.mode } }
    default:
      return state
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
