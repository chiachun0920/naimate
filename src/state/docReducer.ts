// Core data model for nanimate.
//
// The whole app rests on a stroke-based model: every stroke records the frame
// it is first born in (`birthFrame`). Frame N renders every stroke whose
// birthFrame <= N. This makes "additive" animation automatic (later frames
// naturally contain earlier strokes) while still allowing old frames to be
// edited — deleting a stroke removes it from every frame, and a stroke added
// while editing frame K appears from frame K onward.

export type Pt = [x: number, y: number, pressure: number]

export interface Stroke {
  id: string
  points: Pt[]
  birthFrame: number
  color: string
  size: number
}

export interface Doc {
  strokes: Stroke[]
  frameCount: number
  fps: number
}

export type Tool = 'pen' | 'eraser'

export interface EditorState {
  doc: Doc
  currentFrame: number
  color: string
  size: number
  tool: Tool
  /** Reject touch input (palm/finger) so only Apple Pencil / mouse draws. */
  penOnly: boolean
}

export type Action =
  | { type: 'addStroke'; points: Pt[] }
  | { type: 'removeStroke'; id: string }
  | { type: 'commitFrame' }
  | { type: 'selectFrame'; index: number }
  | { type: 'deleteFrame'; index: number }
  | { type: 'undo' }
  | { type: 'clear' }
  | { type: 'loadDoc'; doc: Doc }
  | { type: 'setColor'; color: string }
  | { type: 'setSize'; size: number }
  | { type: 'setTool'; tool: Tool }
  | { type: 'setFps'; fps: number }
  | { type: 'setPenOnly'; value: boolean }

export const DEFAULT_DOC: Doc = { strokes: [], frameCount: 1, fps: 6 }

export const DEFAULT_STATE: EditorState = {
  doc: DEFAULT_DOC,
  currentFrame: 0,
  color: '#1a1a1a',
  size: 8,
  tool: 'pen',
  penOnly: true,
}

let idCounter = 0
function makeId(): string {
  idCounter += 1
  return `s${idCounter}_${idCounter * 2654435761 % 1000000}`
}

/** Strokes visible at frame `index` (birthFrame <= index), in draw order. */
export function framesUpTo(doc: Doc, index: number): Stroke[] {
  return doc.strokes.filter((s) => s.birthFrame <= index)
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
    case 'commitFrame': {
      const newCount = doc.frameCount + 1
      return { ...state, doc: { ...doc, frameCount: newCount }, currentFrame: newCount - 1 }
    }
    case 'selectFrame':
      return { ...state, currentFrame: clamp(action.index, 0, doc.frameCount - 1) }
    case 'deleteFrame': {
      if (doc.frameCount <= 1) return { ...state, doc: { ...doc, strokes: [] } }
      const i = action.index
      // Drop strokes born on this frame, shift later births down by one.
      const strokes = doc.strokes
        .filter((s) => s.birthFrame !== i)
        .map((s) => (s.birthFrame > i ? { ...s, birthFrame: s.birthFrame - 1 } : s))
      const frameCount = doc.frameCount - 1
      return {
        ...state,
        doc: { ...doc, strokes, frameCount },
        currentFrame: clamp(state.currentFrame > i ? state.currentFrame - 1 : state.currentFrame, 0, frameCount - 1),
      }
    }
    case 'undo':
      return { ...state, doc: { ...doc, strokes: doc.strokes.slice(0, -1) } }
    case 'clear':
      return { ...state, doc: { ...DEFAULT_DOC, fps: doc.fps }, currentFrame: 0 }
    case 'loadDoc':
      return { ...state, doc: action.doc, currentFrame: clamp(0, 0, action.doc.frameCount - 1) }
    case 'setColor':
      return { ...state, color: action.color }
    case 'setSize':
      return { ...state, size: action.size }
    case 'setTool':
      return { ...state, tool: action.tool }
    case 'setFps':
      return { ...state, doc: { ...doc, fps: clamp(action.fps, 1, 60) } }
    case 'setPenOnly':
      return { ...state, penOnly: action.value }
    default:
      return state
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
