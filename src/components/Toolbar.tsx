import type { Action, EditorState } from '../state/docReducer'
import { isDocEmpty } from '../state/docReducer'

interface Props {
  state: EditorState
  dispatch: React.Dispatch<Action>
  disabled: boolean
}

const COLORS = ['#1a1a1a', '#e63946', '#1d7874', '#2a6fdb', '#f4a261', '#9b5de5']
const SIZES = [4, 8, 16, 28]

export function Toolbar({ state, dispatch, disabled }: Props) {
  const { color, size, tool, penOnly, doc } = state
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

      <div className="group">
        {SIZES.map((s) => (
          <button
            key={s}
            className={`size${size === s ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'setSize', size: s })}
          >
            <span className="dot" style={{ width: s, height: s }} />
          </button>
        ))}
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
        <button onClick={() => dispatch({ type: 'undo' })}>↩︎ 復原</button>
      </div>

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
