import { useEffect, useRef, useState } from 'react'
import { clampScale } from '../canvas/DrawCanvas'
import { AnimationEditor } from '../editor/AnimationEditor'
import { AnimationObjectCard } from './AnimationObjectCard'
import { SceneToolbar } from './SceneToolbar'
import { SelectionOverlay } from './SelectionOverlay'
import { WhiteboardCanvas, type Tool, type View } from './WhiteboardCanvas'
import { useScene } from './useScene'
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_STYLE,
  OBJ_H,
  OBJ_W,
  makeId,
  newAnimationElement,
  newImageElement,
} from './sceneModel'
import type { SceneElement, Style, TextEl } from './elements/types'

export function SceneEditor() {
  const { scene, addElement, replaceElement, replaceElements, removeElements, updateAnimDoc } =
    useScene()
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 })
  const [tool, setTool] = useState<Tool>('select')
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE)
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const selectOne = (id: string | null) => setSelectedIds(id ? [id] : [])
  const [editingText, setEditingText] = useState<{ x: number; y: number; value: string } | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null) // null = dialog closed
  const [chromeHidden, setChromeHidden] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ width: window.innerWidth, height: window.innerHeight })
  // Re-run across the open/return cycle (openId): when an animation opens the
  // whiteboard unmounts, so we disconnect the old observer; on return we measure
  // and observe the *fresh* viewport node. The 0-guard ignores the transient
  // zero a detaching node reports (which would otherwise blank the canvas).
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w > 0 && h > 0) setStage({ width: w, height: h })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [openId])

  const selectedEls = scene.elements.filter((e) => selectedIds.includes(e.id))
  const animElements = scene.elements.filter((e) => e.type === 'animation')
  const openEl = openId ? scene.elements.find((e) => e.id === openId) : null

  // While an animation is open, render ONLY the editor — unmounting the whiteboard
  // (its own <canvas> + DOM cards + stacking-context overlay) restores the clean
  // top-level layer tree that lets the editor's desynchronized canvas keep its
  // low-latency ink path (otherwise Apple Pencil strokes trail the tip).
  if (openEl && openEl.type === 'animation') {
    return (
      <AnimationEditor
        key={openEl.id}
        doc={openEl.doc}
        onChange={(d) => updateAnimDoc(openEl.id, d)}
        onClose={() => setOpenId(null)}
      />
    )
  }

  const applyStyle = (patch: Partial<Style>) => {
    setStyle((s) => ({ ...s, ...patch }))
    const targets = selectedEls.filter((e) => e.type !== 'animation')
    if (targets.length) replaceElements(targets.map((e) => ({ ...e, ...patch }) as SceneElement))
  }
  const applyFontSize = (n: number) => {
    setFontSize(n)
    const targets = selectedEls.filter((e) => e.type === 'text')
    if (targets.length) replaceElements(targets.map((e) => ({ ...e, fontSize: n }) as SceneElement))
  }
  const deleteSelected = () => {
    if (selectedIds.length === 0) return
    removeElements(selectedIds)
    setSelectedIds([])
  }

  const zoomBy = (f: number) => {
    const cx = stage.width / 2
    const cy = stage.height / 2
    const ns = clampScale(view.scale * f)
    const k = ns / view.scale
    setView({ scale: ns, tx: cx - k * (cx - view.tx), ty: cy - k * (cy - view.ty) })
  }

  const insertAnim = () => {
    const cx = stage.width / 2
    const cy = stage.height / 2
    const wx = (cx - view.tx) / view.scale - OBJ_W / 2
    const wy = (cy - view.ty) / view.scale - OBJ_H / 2
    const el = newAnimationElement(wx, wy, animElements.length + 1)
    addElement(el)
    setSelectedIds([el.id])
    setTool('select')
  }

  const submitImage = () => {
    const url = (imageUrl ?? '').trim()
    setImageUrl(null)
    if (!url) return
    const cx = stage.width / 2
    const cy = stage.height / 2
    const wx = (cx - view.tx) / view.scale
    const wy = (cy - view.ty) / view.scale
    const img = new Image()
    img.onload = () => {
      const el = newImageElement(url, img.naturalWidth, img.naturalHeight, wx, wy)
      addElement(el)
      setSelectedIds([el.id])
      setTool('select')
    }
    img.onerror = () => alert('圖片載入失敗，請確認網址是公開可存取的圖片')
    img.src = url
  }

  const commitText = () => {
    if (!editingText) return
    const text = editingText.value.replace(/\s+$/, '')
    if (text) {
      const el: TextEl = {
        type: 'text',
        id: makeId(),
        strokeColor: style.strokeColor,
        strokeWidth: style.strokeWidth,
        fill: style.fill,
        x: editingText.x,
        y: editingText.y,
        text,
        fontSize,
      }
      addElement(el)
      setSelectedIds([el.id])
    }
    setEditingText(null)
    setTool('select')
  }

  return (
    <>
      <div className="scene-viewport" ref={viewportRef}>
        <WhiteboardCanvas
          elements={scene.elements}
          view={view}
          tool={tool}
          style={style}
          width={stage.width}
          height={stage.height}
          selectedIds={selectedIds}
          onViewChange={setView}
          onAddElement={(el: SceneElement) => {
            addElement(el)
            setSelectedIds([el.id])
          }}
          onUpdateElements={replaceElements}
          onSelect={selectOne}
          onSelectMany={setSelectedIds}
          onOpenAnim={setOpenId}
          onStartText={(x, y) => setEditingText({ x, y, value: '' })}
        />

        <div
          className="scene-world"
          style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}
        >
          {animElements.map((el) => (
            <AnimationObjectCard key={el.id} el={el} scale={view.scale} />
          ))}
        </div>

        {selectedEls.length > 0 && (
          <SelectionOverlay
            els={selectedEls}
            view={view}
            onUpdate={replaceElement}
            onDelete={deleteSelected}
            onOpenAnim={setOpenId}
          />
        )}

        {editingText && (
          <textarea
            className="text-editor"
            autoFocus
            value={editingText.value}
            style={{
              left: editingText.x * view.scale + view.tx,
              top: editingText.y * view.scale + view.ty,
              fontSize: fontSize * view.scale,
              color: style.strokeColor,
            }}
            onChange={(e) => setEditingText((t) => (t ? { ...t, value: e.target.value } : t))}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                commitText()
              } else if (e.key === 'Escape') {
                setEditingText(null)
              }
            }}
          />
        )}

        {scene.elements.length === 0 && (
          <div className="scene-empty">用上方工具在白板上畫圖，或「＋ 動畫」插入動畫物件</div>
        )}
      </div>

      {!chromeHidden && (
        <SceneToolbar
          tool={tool}
          onTool={setTool}
          style={style}
          fontSize={fontSize}
          onStyle={applyStyle}
          onFontSize={applyFontSize}
          scale={view.scale}
          onZoomIn={() => zoomBy(1.25)}
          onZoomOut={() => zoomBy(1 / 1.25)}
          onZoomReset={() => setView({ scale: 1, tx: 0, ty: 0 })}
          hasSelection={selectedEls.length > 0}
          onDelete={deleteSelected}
          onInsertAnim={insertAnim}
          onInsertImage={() => setImageUrl('')}
        />
      )}

      <button
        className="chrome-fab"
        title={chromeHidden ? '顯示工具列' : '純畫布（隱藏工具）'}
        onClick={() => setChromeHidden((h) => !h)}
      >
        {chromeHidden ? '🧰' : '⛶'}
      </button>

      {imageUrl !== null && (
        <div className="url-dialog">
          <div className="panel url-panel">
            <label>圖片網址</label>
            <input
              type="url"
              autoFocus
              placeholder="https://example.com/image.png"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitImage()
                else if (e.key === 'Escape') setImageUrl(null)
              }}
            />
            <div className="url-actions">
              <button onClick={() => setImageUrl(null)}>取消</button>
              <button className="primary" onClick={submitImage}>
                插入
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
