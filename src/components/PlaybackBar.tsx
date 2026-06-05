import type { Action, Doc } from '../state/docReducer'

interface Props {
  doc: Doc
  isPlaying: boolean
  loop: boolean
  /** Frame currently shown (playhead while previewing, else the edit frame). */
  position: number
  onToggle: () => void
  onLoopChange: (loop: boolean) => void
  onStep: (delta: number) => void
  onSeek: (frame: number) => void
  dispatch: React.Dispatch<Action>
}

export function PlaybackBar({
  doc,
  isPlaying,
  loop,
  position,
  onToggle,
  onLoopChange,
  onStep,
  onSeek,
  dispatch,
}: Props) {
  const last = doc.frameCount - 1
  return (
    <div className="playback">
      <button className="step" title="上一格" disabled={position <= 0} onClick={() => onStep(-1)}>
        ◀
      </button>
      <button className="play" onClick={onToggle}>
        {isPlaying ? '⏸ 暫停' : '▶ 播放'}
      </button>
      <button className="step" title="下一格" disabled={position >= last} onClick={() => onStep(1)}>
        ▶▌
      </button>

      <input
        className="scrub"
        type="range"
        min={0}
        max={Math.max(0, last)}
        value={position}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <span className="count">
        {position + 1} / {doc.frameCount}
      </span>

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
    </div>
  )
}
