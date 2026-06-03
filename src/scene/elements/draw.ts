import { strokeToPath } from '../../canvas/strokePath'
import { normBox } from './geometry'
import { getImage } from './imageCache'
import { FONT_FAMILY, LINE_HEIGHT, type DrawnElement } from './types'

/** Draw one non-animation element in world coordinates (caller sets transform). */
export function drawSceneElement(ctx: CanvasRenderingContext2D, el: DrawnElement): void {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  switch (el.type) {
    case 'freedraw': {
      ctx.fillStyle = el.strokeColor
      ctx.fill(strokeToPath(el.points, el.strokeWidth))
      break
    }
    case 'rect': {
      const b = normBox(el.x, el.y, el.w, el.h)
      if (el.fill !== 'transparent') {
        ctx.fillStyle = el.fill
        ctx.fillRect(b.x, b.y, b.w, b.h)
      }
      ctx.strokeStyle = el.strokeColor
      ctx.lineWidth = el.strokeWidth
      ctx.strokeRect(b.x, b.y, b.w, b.h)
      break
    }
    case 'ellipse': {
      const b = normBox(el.x, el.y, el.w, el.h)
      ctx.beginPath()
      ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2)
      if (el.fill !== 'transparent') {
        ctx.fillStyle = el.fill
        ctx.fill()
      }
      ctx.strokeStyle = el.strokeColor
      ctx.lineWidth = el.strokeWidth
      ctx.stroke()
      break
    }
    case 'line':
    case 'arrow': {
      ctx.strokeStyle = el.strokeColor
      ctx.lineWidth = el.strokeWidth
      ctx.beginPath()
      ctx.moveTo(el.x1, el.y1)
      ctx.lineTo(el.x2, el.y2)
      ctx.stroke()
      if (el.type === 'arrow') {
        const ang = Math.atan2(el.y2 - el.y1, el.x2 - el.x1)
        const len = Math.max(10, el.strokeWidth * 3)
        const a = Math.PI / 7
        ctx.beginPath()
        ctx.moveTo(el.x2, el.y2)
        ctx.lineTo(el.x2 - len * Math.cos(ang - a), el.y2 - len * Math.sin(ang - a))
        ctx.moveTo(el.x2, el.y2)
        ctx.lineTo(el.x2 - len * Math.cos(ang + a), el.y2 - len * Math.sin(ang + a))
        ctx.stroke()
      }
      break
    }
    case 'text': {
      ctx.fillStyle = el.strokeColor
      ctx.font = `${el.fontSize}px ${FONT_FAMILY}`
      ctx.textBaseline = 'top'
      const lh = el.fontSize * LINE_HEIGHT
      el.text.split('\n').forEach((line, i) => {
        ctx.fillText(line, el.x, el.y + i * lh)
      })
      break
    }
    case 'image': {
      const img = getImage(el.src)
      if (img) {
        ctx.drawImage(img, el.x, el.y, el.w, el.h)
      } else {
        // Placeholder while loading (or if the URL failed).
        ctx.fillStyle = '#eef1f5'
        ctx.fillRect(el.x, el.y, el.w, el.h)
        ctx.strokeStyle = '#cbd5e1'
        ctx.lineWidth = 1
        ctx.strokeRect(el.x, el.y, el.w, el.h)
        ctx.fillStyle = '#94a3b8'
        ctx.font = `14px ${FONT_FAMILY}`
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'center'
        ctx.fillText('讀取中…', el.x + el.w / 2, el.y + el.h / 2)
      }
      break
    }
  }
  ctx.restore()
}
