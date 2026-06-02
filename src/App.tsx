import { useEffect, useRef, useState } from 'react'
import { DrawCanvas, DEFAULT_VIEW, clampScale, type View } from './canvas/DrawCanvas'
import { Toolbar } from './components/Toolbar'
import { Timeline } from './components/Timeline'
import { PlaybackBar } from './components/PlaybackBar'
import { ExportMenu } from './components/ExportMenu'
import { ZoomControls } from './components/ZoomControls'
import { usePlayback } from './hooks/usePlayback'
import { useDoc } from './state/useDoc'

export default function App() {
  const [state, dispatch] = useDoc()
  const { doc, currentFrame, color, size, tool, penOnly } = state

  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ width: 800, height: 600 })
  const [loop, setLoop] = useState(true)
  const [timelineOpen, setTimelineOpen] = useState(true)
  const [view, setView] = useState<View>(DEFAULT_VIEW)

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

  const { isPlaying, playhead, toggle } = usePlayback(doc.frameCount, doc.fps, loop)

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
          displayFrame={isPlaying ? playhead : null}
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
        />
        {!isPlaying && (
          <div className="stage-badge">
            編輯第 {currentFrame + 1} / {doc.frameCount} 幀
          </div>
        )}
      </div>

      <div className="overlay overlay-top">
        <div className="panel">
          <Toolbar state={state} dispatch={dispatch} disabled={isPlaying} />
        </div>
        <div className="panel">
          <ZoomControls scale={view.scale} onZoom={zoomBy} onReset={() => setView(DEFAULT_VIEW)} />
        </div>
        <div className="panel">
          <ExportMenu doc={doc} width={stage.width} height={stage.height} dispatch={dispatch} />
        </div>
      </div>

      <div className="overlay overlay-bottom">
        <div className="panel bottom-panel">
          <div className="bottom-row">
            <PlaybackBar
              doc={doc}
              isPlaying={isPlaying}
              loop={loop}
              onToggle={toggle}
              onLoopChange={setLoop}
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
              playhead={isPlaying ? playhead : null}
              canvasWidth={stage.width}
              canvasHeight={stage.height}
              dispatch={dispatch}
            />
          )}
        </div>
      </div>
    </div>
  )
}
