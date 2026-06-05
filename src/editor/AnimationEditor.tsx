import { useEffect, useRef, useState } from 'react'
import { DrawCanvas, DEFAULT_VIEW, clampScale, type View } from '../canvas/DrawCanvas'
import { Toolbar } from '../components/Toolbar'
import { Timeline } from '../components/Timeline'
import { PlaybackBar } from '../components/PlaybackBar'
import { ExportMenu } from '../components/ExportMenu'
import { ZoomControls } from '../components/ZoomControls'
import { AnimationImageOverlay } from './AnimationImageOverlay'
import { AnimationSelectionOverlay } from './AnimationSelectionOverlay'
import type { LassoSelection } from '../canvas/DrawCanvas'
import { usePlayback } from '../hooks/usePlayback'
import { useDoc } from '../state/useDoc'
import type { Doc, Tool } from '../state/docReducer'

const TOOL_ICON: Record<Tool, string> = { pen: '✏️', eraser: '🧽', image: '🖼', lasso: '⬚' }

const IMG_MAX = 360 // longest side of a freshly inserted image (world units)
let imgIdCounter = 0
const makeImgId = () => `img${(imgIdCounter += 1)}_${Date.now().toString(36)}`

interface Props {
  doc: Doc
  /** Called whenever the document changes, so the Scene can persist it. */
  onChange: (doc: Doc) => void
  /** Return to the whiteboard. */
  onClose: () => void
}

/**
 * The full frame-by-frame animation editor, scoped to a single document. This is
 * the original nanimate app, now a controlled component embedded by the Scene.
 */
export function AnimationEditor({ doc: initialDoc, onChange, onClose }: Props) {
  const [state, dispatch] = useDoc(initialDoc, onChange)
  const { doc, currentFrame, color, size, tool, penOnly } = state

  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ width: 800, height: 600 })
  const [loop, setLoop] = useState(true)
  const [timelineOpen, setTimelineOpen] = useState(true)
  const [view, setView] = useState<View>(DEFAULT_VIEW)
  const [imageUrl, setImageUrl] = useState<string | null>(null) // null = dialog closed
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [chromeHidden, setChromeHidden] = useState(false)
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false)
  const [lassoSel, setLassoSel] = useState<LassoSelection>({ strokeIds: [], imageIds: [] })
  const clearLasso = () => setLassoSel({ strokeIds: [], imageIds: [] })
  // Drop the lasso selection when the tool or the edited frame changes.
  useEffect(() => clearLasso(), [tool, currentFrame])

  // While drawing, lock the chrome out of touches (palm-near-edge protection).
  // Restore a beat after the stroke ends so a lifting palm can't trigger a tap.
  const [isDrawing, setIsDrawing] = useState(false)
  const releaseTimer = useRef<number | null>(null)
  const handleDrawingChange = (active: boolean) => {
    if (releaseTimer.current != null) {
      clearTimeout(releaseTimer.current)
      releaseTimer.current = null
    }
    if (active) setIsDrawing(true)
    else releaseTimer.current = window.setTimeout(() => setIsDrawing(false), 250)
  }

  // Track the drawing area size.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => setStage({ width: el.clientWidth, height: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { isPlaying, playhead, preview, toggle, step, seek, exitPreview } = usePlayback(
    doc.frameCount,
    doc.fps,
    loop,
  )
  // Picking an edit frame (timeline thumbnail / commitFrame) leaves manual preview.
  useEffect(() => exitPreview(), [currentFrame, exitPreview])

  const submitImage = () => {
    const url = (imageUrl ?? '').trim()
    setImageUrl(null)
    if (!url) return
    const img = new Image()
    img.onload = () => {
      const ratio = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1
      const w = ratio >= 1 ? IMG_MAX : IMG_MAX * ratio
      const h = ratio >= 1 ? IMG_MAX / ratio : IMG_MAX
      const cx = (stage.width / 2 - view.tx) / view.scale
      const cy = (stage.height / 2 - view.ty) / view.scale
      const id = makeImgId()
      dispatch({ type: 'addImage', id, src: url, x: cx - w / 2, y: cy - h / 2, w, h })
      dispatch({ type: 'setTool', tool: 'image' })
      setSelectedImageId(id)
    }
    img.onerror = () => alert('圖片載入失敗，請確認網址是公開可存取的圖片')
    img.src = url
  }

  // Zoom around the viewport centre, keeping that point fixed.
  const zoomBy = (factor: number) => {
    const cx = stage.width / 2
    const cy = stage.height / 2
    const newScale = clampScale(view.scale * factor)
    const k = newScale / view.scale
    setView({ scale: newScale, tx: cx - k * (cx - view.tx), ty: cy - k * (cy - view.ty) })
  }

  return (
    <div className={isDrawing ? 'app drawing' : 'app'}>
      <div className="stage" ref={stageRef}>
        <DrawCanvas
          doc={doc}
          currentFrame={currentFrame}
          displayFrame={preview ? playhead : null}
          color={color}
          size={size}
          tool={tool}
          penOnly={penOnly}
          view={view}
          width={stage.width}
          height={stage.height}
          onStrokeComplete={(points) => dispatch({ type: 'addStroke', points })}
          onErase={(id) => dispatch({ type: 'removeStroke', id })}
          onDrawingChange={handleDrawingChange}
          onViewChange={setView}
          selection={lassoSel}
          onLassoSelect={setLassoSel}
          onSelectionMove={(dx, dy) => {
            dispatch({ type: 'translateStrokes', ids: lassoSel.strokeIds, dx, dy })
            dispatch({ type: 'translateImages', ids: lassoSel.imageIds, dx, dy })
          }}
          onClearSelection={clearLasso}
        />
        {!isPlaying && tool === 'image' && (
          <AnimationImageOverlay
            doc={doc}
            currentFrame={currentFrame}
            view={view}
            selectedId={selectedImageId}
            onSelect={setSelectedImageId}
            onUpdate={(id, patch) => dispatch({ type: 'updateImage', id, patch })}
            onRemove={(id) => {
              dispatch({ type: 'removeImage', id })
              setSelectedImageId(null)
            }}
          />
        )}
        {!isPlaying && tool === 'lasso' && (lassoSel.strokeIds.length > 0 || lassoSel.imageIds.length > 0) && (
          <AnimationSelectionOverlay
            doc={doc}
            view={view}
            selection={lassoSel}
            onDelete={() => {
              dispatch({ type: 'removeStrokes', ids: lassoSel.strokeIds })
              dispatch({ type: 'removeImages', ids: lassoSel.imageIds })
              clearLasso()
            }}
          />
        )}
        {!isPlaying && (
          <div className="stage-badge">
            編輯第 {currentFrame + 1} / {doc.frameCount} 幀 · {doc.mode === 'independent' ? '獨立' : '累進'}
          </div>
        )}
      </div>

      {!chromeHidden && toolbarCollapsed && (
        <div className="overlay overlay-top">
          <div className="panel toolbar-pill">
            <button title="目前工具（點擊展開工具列）" onClick={() => setToolbarCollapsed(false)}>
              {TOOL_ICON[tool] ?? '✏️'}
            </button>
            <button
              className="tb-collapse"
              title="展開工具列"
              onClick={() => setToolbarCollapsed(false)}
            >
              ⌄
            </button>
          </div>
        </div>
      )}

      {!chromeHidden && !toolbarCollapsed && (
      <div className="overlay overlay-top">
        <div className="panel">
          <button className="back" onClick={onClose} title="返回畫布">
            ← 返回畫布
          </button>
        </div>
        <div className="panel">
          <Toolbar
            state={state}
            dispatch={dispatch}
            disabled={isPlaying}
            onInsertImage={() => setImageUrl('')}
          />
        </div>
        <div className="panel">
          <ZoomControls scale={view.scale} onZoom={zoomBy} onReset={() => setView(DEFAULT_VIEW)} />
        </div>
        <div className="panel">
          <ExportMenu doc={doc} width={stage.width} height={stage.height} dispatch={dispatch} />
        </div>
        <div className="panel">
          <button className="tb-collapse" title="收折工具列" onClick={() => setToolbarCollapsed(true)}>
            ⌃
          </button>
        </div>
      </div>
      )}

      {!chromeHidden && (
      <div className="overlay overlay-bottom">
        <div className="panel bottom-panel">
          <div className="bottom-row">
            <PlaybackBar
              doc={doc}
              isPlaying={isPlaying}
              loop={loop}
              position={preview ? playhead : currentFrame}
              onToggle={toggle}
              onLoopChange={setLoop}
              onStep={step}
              onSeek={seek}
              dispatch={dispatch}
            />
            <button
              className="tl-toggle"
              title={timelineOpen ? '收合幀列' : '展開幀列'}
              onClick={() => setTimelineOpen((o) => !o)}
            >
              {timelineOpen ? '⌄' : '⌃'}
            </button>
          </div>
          {timelineOpen && (
            <Timeline
              doc={doc}
              currentFrame={currentFrame}
              playhead={preview ? playhead : null}
              canvasWidth={stage.width}
              canvasHeight={stage.height}
              dispatch={dispatch}
            />
          )}
        </div>
      </div>
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
    </div>
  )
}
