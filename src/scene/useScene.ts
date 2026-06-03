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

  /** Replace several elements in one update (by id). */
  const replaceElements = (els: SceneElement[]) =>
    setScene((s) => {
      const byId = new Map(els.map((e) => [e.id, e]))
      return { elements: s.elements.map((e) => byId.get(e.id) ?? e) }
    })

  const removeElement = (id: string) =>
    setScene((s) => ({ elements: s.elements.filter((e) => e.id !== id) }))

  /** Remove several elements in one update. */
  const removeElements = (ids: string[]) =>
    setScene((s) => {
      const drop = new Set(ids)
      return { elements: s.elements.filter((e) => !drop.has(e.id)) }
    })

  const updateAnimDoc = (id: string, doc: Doc) =>
    setScene((s) => ({
      elements: s.elements.map((e) =>
        e.id === id && e.type === 'animation' ? { ...e, doc } : e,
      ),
    }))

  return {
    scene,
    addElement,
    updateElement,
    replaceElement,
    replaceElements,
    removeElement,
    removeElements,
    updateAnimDoc,
  }
}
