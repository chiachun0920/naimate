import type { Action, EditorState } from '../state/docReducer'
import { isDocEmpty } from '../state/docReducer'

interface Props {
  state: EditorState
  dispatch: React.Dispatch<Action>
  disabled: boolean
  onInsertImage: () => void
}

const COLORS = ['#1a1a1a', '#e63946', '#1d7874', '#2a6fdb', '#f4a261', '#9b5de5']
const FILLS = ['transparent', '#ffe066', '#a0e8af', '#a5d8ff', '#ffc9c9']
const FONT_SIZES = [16, 24, 36, 56]

export function Toolbar({ state, dispatch, disabled, onInsertImage }: Props) {
  const { color, size, fill, fontSize, tool, penOnly, doc } = state
  const mode = doc.mode
  const modeLocked = !isDocEmpty(doc)
  const modeTitle = modeLocked
    ? '已有內容，模式已鎖定；按「清空」後可重新選擇'
    : '累進：筆畫逐幀累加；獨立：每幀獨立，完成時自動帶入上一幀'
  return (
    <div className="toolbar" aria-disabled={disabled}>
      <div className="group">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`swatch${color === c ? ' active' : ''}`}
            style={{ background: c }}
            onClick={() => dispatch({ type: 'setColor', color: c })}
            title={c}
          />
        ))}
        <input
          type="color"
          value={color}
          onChange={(e) => dispatch({ type: 'setColor', color: e.target.value })}
          title="自訂顏色"
        />
      </div>

      <div className="group size-slider">
        <input
          type="range"
          min={1}
          max={40}
          value={size}
          title={`筆刷大小 ${size}`}
          onChange={(e) => dispatch({ type: 'setSize', size: Number(e.target.value) })}
        />
        <span className="size-val">{size}</span>
      </div>

      <div className="group">
        <button
          className={tool === 'pen' ? 'active' : ''}
          onClick={() => dispatch({ type: 'setTool', tool: 'pen' })}
        >
          ✏️ 筆
        </button>
        <button
          className={tool === 'eraser' ? 'active' : ''}
          onClick={() => dispatch({ type: 'setTool', tool: 'eraser' })}
        >
          🧽 橡皮擦
        </button>
        <button
          className={tool === 'image' ? 'active' : ''}
          title="選取/移動/縮放圖片"
          onClick={() => dispatch({ type: 'setTool', tool: 'image' })}
        >
          🖼 圖片
        </button>
        <button
          className={tool === 'lasso' ? 'active' : ''}
          title="套索（圈選筆畫/圖形/圖片）"
          onClick={() => dispatch({ type: 'setTool', tool: 'lasso' })}
        >
          ⬚ 套索
        </button>
        <button onClick={onInsertImage} title="插入圖片（輸入網址）">
          ＋ 圖片
        </button>
        <button onClick={() => dispatch({ type: 'undo' })}>↩︎ 復原</button>
      </div>

      <div className="group">
        <button
          className={tool === 'rect' ? 'active' : ''}
          title="矩形"
          onClick={() => dispatch({ type: 'setTool', tool: 'rect' })}
        >
          ▭
        </button>
        <button
          className={tool === 'ellipse' ? 'active' : ''}
          title="橢圓"
          onClick={() => dispatch({ type: 'setTool', tool: 'ellipse' })}
        >
          ◯
        </button>
        <button
          className={tool === 'line' ? 'active' : ''}
          title="直線"
          onClick={() => dispatch({ type: 'setTool', tool: 'line' })}
        >
          ／
        </button>
        <button
          className={tool === 'arrow' ? 'active' : ''}
          title="箭頭"
          onClick={() => dispatch({ type: 'setTool', tool: 'arrow' })}
        >
          ↗
        </button>
        <button
          className={tool === 'text' ? 'active' : ''}
          title="文字"
          onClick={() => dispatch({ type: 'setTool', tool: 'text' })}
        >
          T
        </button>
      </div>

      {(tool === 'rect' || tool === 'ellipse') && (
        <div className="group" title="填色">
          {FILLS.map((f) => (
            <button
              key={f}
              className={`swatch${fill === f ? ' active' : ''}`}
              style={f === 'transparent' ? { background: '#fff' } : { background: f }}
              title={f === 'transparent' ? '無填色' : '填色'}
              onClick={() => dispatch({ type: 'setFill', fill: f })}
            >
              {f === 'transparent' ? '∅' : ''}
            </button>
          ))}
        </div>
      )}

      {tool === 'text' && (
        <div className="group" title="字級">
          {FONT_SIZES.map((s) => (
            <button
              key={s}
              className={fontSize === s ? 'active' : ''}
              onClick={() => dispatch({ type: 'setFontSize', fontSize: s })}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="group">
        <button
          className={penOnly ? 'active' : ''}
          title="開啟後手掌與手指不會畫出筆畫，只認 Apple Pencil"
          onClick={() => dispatch({ type: 'setPenOnly', value: !penOnly })}
        >
          ✋ 防誤觸{penOnly ? '（開）' : '（關）'}
        </button>
      </div>

      <div className="group" title={modeTitle}>
        <div className="seg" aria-disabled={modeLocked}>
          <button
            className={mode === 'additive' ? 'active' : ''}
            disabled={modeLocked}
            onClick={() => dispatch({ type: 'setMode', mode: 'additive' })}
          >
            累進
          </button>
          <button
            className={mode === 'independent' ? 'active' : ''}
            disabled={modeLocked}
            onClick={() => dispatch({ type: 'setMode', mode: 'independent' })}
          >
            獨立
          </button>
        </div>
        {modeLocked && <span className="lock" title={modeTitle}>🔒</span>}
      </div>

      <div className="group grow">
        <button className="primary" onClick={() => dispatch({ type: 'commitFrame' })}>
          ✓ 完成這一幀
        </button>
      </div>
    </div>
  )
}
