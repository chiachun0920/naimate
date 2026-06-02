interface Props {
  scale: number
  onZoom: (factor: number) => void
  onReset: () => void
}

export function ZoomControls({ scale, onZoom, onReset }: Props) {
  return (
    <div className="zoom">
      <button onClick={() => onZoom(1 / 1.25)} title="縮小">
        −
      </button>
      <button className="pct" onClick={onReset} title="重設縮放">
        {Math.round(scale * 100)}%
      </button>
      <button onClick={() => onZoom(1.25)} title="放大">
        ＋
      </button>
      <button onClick={onReset} title="重設縮放/平移">
        ⤢
      </button>
    </div>
  )
}
