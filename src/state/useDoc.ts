import { useEffect, useReducer } from 'react'
import { DEFAULT_STATE, reducer, type Action, type EditorState } from './docReducer'
import { loadDoc, saveDoc } from '../lib/storage'

function init(): EditorState {
  const stored = loadDoc()
  return stored ? { ...DEFAULT_STATE, doc: stored } : DEFAULT_STATE
}

export function useDoc(): [EditorState, React.Dispatch<Action>] {
  const [state, dispatch] = useReducer(reducer, undefined, init)

  useEffect(() => {
    saveDoc(state.doc)
  }, [state.doc])

  return [state, dispatch]
}
