/**
 * Module-level cache of <img> elements keyed by URL, so repaints don't re-fetch
 * or re-decode. Images load asynchronously; once one finishes, subscribers are
 * notified so canvases can repaint and the image appears.
 *
 * Two variants per URL:
 * - display (default): no crossOrigin, so *any* reachable image renders. This
 *   may taint the visible canvas, which is fine — nothing reads its pixels.
 * - cors:true: crossOrigin='anonymous'. Used for export, where pixels ARE read
 *   (gif.addFrame / captureStream): a CORS-clean image stays exportable, and a
 *   non-CORS one simply fails to load instead of tainting and breaking export.
 */
const cache = new Map<string, HTMLImageElement>()
const listeners = new Set<() => void>()

function keyOf(src: string, cors: boolean) {
  return cors ? `c|${src}` : src
}

function notify() {
  for (const cb of listeners) cb()
}

const isReady = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0

/**
 * Return the loaded <img> for a URL, or null while it loads / on error.
 * Starts loading on first request for an unseen (url, cors) pair.
 */
export function getImage(src: string, cors = false): HTMLImageElement | null {
  const key = keyOf(src, cors)
  const cached = cache.get(key)
  if (cached) return isReady(cached) ? cached : null

  const img = new Image()
  if (cors) img.crossOrigin = 'anonymous'
  img.onload = notify
  img.onerror = notify
  img.src = src
  cache.set(key, img)
  return isReady(img) ? img : null
}

/**
 * Resolve once every URL has finished loading (or failed) in the given variant.
 * Used to preload before a synchronous export render pass.
 */
export function preloadImages(srcs: string[], cors = false): Promise<void> {
  const pending = srcs
    .filter((s) => !cache.get(keyOf(s, cors)) || !isReady(cache.get(keyOf(s, cors))!))
    .map(
      (s) =>
        new Promise<void>((resolve) => {
          const existing = cache.get(keyOf(s, cors))
          const img = existing ?? new Image()
          if (!existing) {
            if (cors) img.crossOrigin = 'anonymous'
            cache.set(keyOf(s, cors), img)
            img.src = s
          }
          if (isReady(img)) return resolve()
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        }),
    )
  return Promise.all(pending).then(() => undefined)
}

/** Subscribe to image-load events. Returns an unsubscribe function. */
export function subscribeImageLoad(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
