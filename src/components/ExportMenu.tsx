import { useRef, useState } from 'react'
import type { Action, Doc } from '../state/docReducer'
import { exportGif, exportWebm } from '../lib/export'
import { exportJson, importJson } from '../lib/storage'

interface Props {
  doc: Doc
  width: number
  height: number
  dispatch: React.Dispatch<Action>
}

export function ExportMenu({ doc, width, height, dispatch }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const run = async (label: string, fn: () => Promise<void> | void) => {
    setBusy(label)
    try {
      await fn()
    } catch (err) {
      alert(`匯出失敗：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  const onImport = async (file: File) => {
    try {
      const loaded = await importJson(file)
      dispatch({ type: 'loadDoc', doc: loaded })
    } catch (err) {
      alert(`載入失敗：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="export-menu">
      <button disabled={!!busy} onClick={() => run('gif', () => exportGif(doc, { width, height }))}>
        {busy === 'gif' ? '匯出 GIF…' : '匯出 GIF'}
      </button>
      <button disabled={!!busy} onClick={() => run('webm', () => exportWebm(doc, { width, height }))}>
        {busy === 'webm' ? '錄製 WebM…' : '匯出 WebM'}
      </button>
      <button disabled={!!busy} onClick={() => exportJson(doc)}>
        儲存 JSON
      </button>
      <button disabled={!!busy} onClick={() => fileRef.current?.click()}>
        載入 JSON
      </button>
      <button
        className="danger"
        disabled={!!busy}
        onClick={() => {
          if (confirm('清空整本筆記本？')) dispatch({ type: 'clear' })
        }}
      >
        清空
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onImport(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
