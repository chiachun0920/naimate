import type { Doc } from '../state/docReducer'
import { DEFAULT_DOC } from '../state/docReducer'

const KEY = 'nanimate:doc'

export function saveDoc(doc: Doc): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc))
  } catch {
    // storage full / unavailable — ignore for POC
  }
}

export function loadDoc(): Doc | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.strokes)) return null
    return { ...DEFAULT_DOC, ...parsed } as Doc
  } catch {
    return null
  }
}

export function exportJson(doc: Doc): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  download(blob, 'nanimate.json')
}

export function importJson(file: File): Promise<Doc> {
  return file.text().then((text) => {
    const parsed = JSON.parse(text)
    if (!parsed || !Array.isArray(parsed.strokes)) throw new Error('Invalid nanimate file')
    return { ...DEFAULT_DOC, ...parsed } as Doc
  })
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
