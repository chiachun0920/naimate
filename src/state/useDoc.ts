import { useEffect, useReducer, useRef } from 'react'
import { DEFAULT_DOC, DEFAULT_STATE, reducer, type Action, type Doc, type EditorState } from './docReducer'

/**
 * Drives one animation document. Controlled: `initialDoc` seeds the reducer once,
 * and every doc change is reported via `onDocChange` (the Scene owns persistence).
 */
export function useDoc(
  initialDoc: Doc,
  onDocChange?: (doc: Doc) => void,
): [EditorState, React.Dispatch<Action>] {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    ...DEFAULT_STATE,
    // Backfill fields that older saved docs may lack (e.g. `images`).
    doc: { ...DEFAULT_DOC, ...initialDoc },
  }))

  // Keep the latest callback without re-running the effect when its identity changes.
  const cb = useRef(onDocChange)
  cb.current = onDocChange

  // Report doc changes upward (skip the initial mount — nothing changed yet).
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    cb.current?.(state.doc)
  }, [state.doc])

  return [state, dispatch]
}
