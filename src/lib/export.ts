import GIF from 'gif.js'
import workerUrl from 'gif.js/dist/gif.worker.js?url'
import type { Doc } from '../state/docReducer'
import { renderFrame } from '../canvas/render'
import { preloadImages } from './imageCache'
import { download } from './storage'

interface ExportOpts {
  width: number
  height: number
}

/**
 * Preload the doc's images as CORS-clean copies before a synchronous export
 * pass. Only images whose server allows CORS will load (others fail silently and
 * are omitted) — this guarantees the export canvas is never tainted, so reading
 * its pixels (gif.addFrame / captureStream) never throws.
 */
function preloadExportImages(doc: Doc): Promise<void> {
  return preloadImages(doc.images.map((im) => im.src), true)
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  return { canvas, ctx }
}

/** Encode every frame into an animated GIF via gif.js web workers. */
export async function exportGif(doc: Doc, { width, height }: ExportOpts): Promise<void> {
  await preloadExportImages(doc)
  const { ctx } = makeCanvas(width, height)
  const delay = Math.round(1000 / Math.max(1, doc.fps))
  const gif = new GIF({ workers: 2, quality: 10, workerScript: workerUrl, width, height })

  for (let f = 0; f < doc.frameCount; f++) {
    renderFrame(ctx, doc, f, { width, height, cors: true })
    gif.addFrame(ctx, { delay, copy: true })
  }

  return new Promise((resolve) => {
    gif.on('finished', (blob) => {
      download(blob, 'nanimate.gif')
      resolve()
    })
    gif.render()
  })
}

/** Record every frame into a webm using MediaRecorder on a canvas stream. */
export async function exportWebm(doc: Doc, { width, height }: ExportOpts): Promise<void> {
  await preloadExportImages(doc)
  const { canvas, ctx } = makeCanvas(width, height)
  const stream = canvas.captureStream()
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm'
  const recorder = new MediaRecorder(stream, { mimeType })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  const stopped = new Promise<void>((res) => {
    recorder.onstop = () => res()
  })

  const frameMs = 1000 / Math.max(1, doc.fps)
  recorder.start()
  for (let f = 0; f < doc.frameCount; f++) {
    renderFrame(ctx, doc, f, { width, height, cors: true })
    await sleep(frameMs)
  }
  recorder.stop()
  await stopped
  download(new Blob(chunks, { type: 'video/webm' }), 'nanimate.webm')
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}
