declare module 'gif.js' {
  interface GIFOptions {
    workers?: number
    quality?: number
    workerScript?: string
    width?: number
    height?: number
    repeat?: number
    background?: string
    transparent?: number | null
    dither?: boolean | string
  }
  interface FrameOptions {
    delay?: number
    copy?: boolean
  }
  export default class GIF {
    constructor(opts?: GIFOptions)
    addFrame(image: CanvasImageSource | CanvasRenderingContext2D, opts?: FrameOptions): void
    on(event: 'finished', cb: (blob: Blob) => void): void
    on(event: 'progress', cb: (p: number) => void): void
    on(event: 'start' | 'abort', cb: () => void): void
    render(): void
    abort(): void
  }
}

declare module 'gif.js/dist/gif.worker.js?url' {
  const url: string
  export default url
}
