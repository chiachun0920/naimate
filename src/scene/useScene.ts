import { useEffect, useState } from 'react'
import type { Doc } from '../state/docReducer'
import { loadScene, saveScene } from '../lib/storage'
import type { Scene } from './sceneModel'
import type { SceneElement } from './elements/types'

export function useScene() {
  const [scene, setScene] = useState<Scene>(() => loadScene())

  useEffect(() => {
    saveScene(scene)
  }, [scene])

  const addElement = (el: SceneElement) =>
    setScene((s) => ({ elements: [...s.elements, el] }))

  const updateElement = (id: string, patch: Partial<SceneElement>) =>
    setScene((s) => ({
      elements: s.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as SceneElement) : e)),
    }))

  const replaceElement = (el: SceneElement) =>
    setScene((s) => ({ elements: s.elements.map((e) => (e.id === el.id ? el : e)) }))

  const removeElement = (id: string) =>
    setScene((s) => ({ elements: s.elements.filter((e) => e.id !== id) }))

  const updateAnimDoc = (id: string, doc: Doc) =>
    setScene((s) => ({
      elements: s.elements.map((e) =>
        e.id === id && e.type === 'animation' ? { ...e, doc } : e,
      ),
    }))

  return { scene, addElement, updateElement, replaceElement, removeElement, updateAnimDoc }
}
