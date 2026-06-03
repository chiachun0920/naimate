import type { Style } from './elements/types'
import type { Tool } from './WhiteboardCanvas'

interface Props {
  tool: Tool
  onTool: (t: Tool) => void
  style: Style
  fontSize: number
  onStyle: (patch: Partial<Style>) => void
  onFontSize: (n: number) => void
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  hasSelection: boolean
  onDelete: () => void
  onInsertAnim: () => void
  onInsertImage: () => void
}

const TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: 'select', label: '⤢', title: '選取' },
  { id: 'pen', label: '✏️', title: '筆' },
  { id: 'rect', label: '▭', title: '矩形' },
  { id: 'ellipse', label: '◯', title: '橢圓' },
  { id: 'line', label: '／', title: '直線' },
  { id: 'arrow', label: '↗', title: '箭頭' },
  { id: 'text', label: 'T', title: '文字' },
]
const COLORS = ['#1a1a1a', '#e63946', '#1d7874', '#2a6fdb', '#f4a261', '#9b5de5']
const WIDTHS = [2, 4, 8, 16]
const FILLS = ['transparent', '#ffe066', '#a0e8af', '#a5d8ff', '#ffc9c9']
const FONT_SIZES = [16, 24, 36, 56]

export function SceneToolbar({
  tool,
  onTool,
  style,
  fontSize,
  onStyle,
  onFontSize,
  scale,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  hasSelection,
  onDelete,
  onInsertAnim,
  onInsertImage,
}: Props) {
  return (
    <div className="scene-toolbar">
      <div className="group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={tool === t.id ? 'tool active' : 'tool'}
            title={t.title}
            onClick={() => onTool(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="group">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`swatch${style.strokeColor === c ? ' active' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => onStyle({ strokeColor: c })}
          />
        ))}
      </div>

      <div className="group">
        {WIDTHS.map((w) => (
          <button
            key={w}
            className={`size${style.strokeWidth === w ? ' active' : ''}`}
            title={`線寬 ${w}`}
            onClick={() => onStyle({ strokeWidth: w })}
          >
            <span className="dot" style={{ width: w + 2, height: w + 2 }} />
          </button>
        ))}
      </div>

      {tool === 'text' ? (
        <div className="group">
          {FONT_SIZES.map((s) => (
            <button
              key={s}
              className={fontSize === s ? 'active' : ''}
              onClick={() => onFontSize(s)}
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        <div className="group">
          {FILLS.map((f) => (
            <button
              key={f}
              className={`swatch${style.fill === f ? ' active' : ''}`}
              style={f === 'transparent' ? { background: '#fff' } : { background: f }}
              title={f === 'transparent' ? '無填色' : '填色'}
              onClick={() => onStyle({ fill: f })}
            >
              {f === 'transparent' ? '∅' : ''}
            </button>
          ))}
        </div>
      )}

      <div className="group">
        <button className="primary" onClick={onInsertAnim} title="插入動畫物件">
          ＋ 動畫
        </button>
        <button onClick={onInsertImage} title="插入圖片（輸入網址）">
          🖼 圖片
        </button>
        {hasSelection && (
          <button className="danger" onClick={onDelete} title="刪除選取">
            🗑
          </button>
        )}
      </div>

      <div className="group zoom">
        <button onClick={onZoomOut}>−</button>
        <button className="pct" onClick={onZoomReset}>
          {Math.round(scale * 100)}%
        </button>
        <button onClick={onZoomIn}>＋</button>
      </div>
    </div>
  )
}
