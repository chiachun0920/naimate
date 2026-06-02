import type { Action, Doc } from '../state/docReducer'

interface Props {
  doc: Doc
  isPlaying: boolean
  loop: boolean
  onToggle: () => void
  onLoopChange: (loop: boolean) => void
  dispatch: React.Dispatch<Action>
}

export function PlaybackBar({ doc, isPlaying, loop, onToggle, onLoopChange, dispatch }: Props) {
  return (
    <div className="playback">
      <button className="play" onClick={onToggle}>
        {isPlaying ? '⏸ 暫停' : '▶ 播放'}
      </button>

      <label className="fps">
        速度 {doc.fps} fps
        <input
          type="range"
          min={1}
          max={24}
          value={doc.fps}
          onChange={(e) => dispatch({ type: 'setFps', fps: Number(e.target.value) })}
        />
      </label>

      <label className="loop">
        <input type="checkbox" checked={loop} onChange={(e) => onLoopChange(e.target.checked)} />
        循環
      </label>

      <span className="count">{doc.frameCount} 幀</span>
    </div>
  )
}
