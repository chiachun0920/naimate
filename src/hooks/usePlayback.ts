import { useCallback, useEffect, useRef, useState } from 'react'

export interface Playback {
  isPlaying: boolean
  playhead: number
  /** True while the playhead (not the edit frame) should be shown — auto or manual. */
  preview: boolean
  play: () => void
  pause: () => void
  toggle: () => void
  /** Manual step by ±1 (or any delta), paused, clamped to the frame range. */
  step: (delta: number) => void
  /** Manual seek to an absolute frame, paused. */
  seek: (frame: number) => void
  /** Leave preview and return to the edit view. */
  exitPreview: () => void
}

/** Drive a frame index at `fps` (auto) or step/seek it manually (preview). */
export function usePlayback(frameCount: number, fps: number, loop: boolean): Playback {
  const [isPlaying, setIsPlaying] = useState(false)
  const [manualPreview, setManualPreview] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const acc = useRef(0)
  const last = useRef(0)

  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    acc.current = 0
    last.current = performance.now()
    const interval = 1000 / Math.max(1, fps)

    const tick = (t: number) => {
      acc.current += t - last.current
      last.current = t
      while (acc.current >= interval) {
        acc.current -= interval
        setPlayhead((p) => {
          const next = p + 1
          if (next >= frameCount) {
            if (loop) return 0
            setIsPlaying(false)
            return frameCount - 1
          }
          return next
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, fps, frameCount, loop])

  const clamp = (n: number) => Math.max(0, Math.min(frameCount - 1, n))

  const play = useCallback(() => {
    setManualPreview(false)
    setPlayhead((p) => (p >= frameCount - 1 ? 0 : p))
    setIsPlaying(true)
  }, [frameCount])
  const pause = useCallback(() => setIsPlaying(false), [])
  const toggle = useCallback(() => (isPlaying ? pause() : play()), [isPlaying, pause, play])

  const step = useCallback((delta: number) => {
    setIsPlaying(false)
    setManualPreview(true)
    setPlayhead((p) => Math.max(0, Math.min(frameCount - 1, p + delta)))
  }, [frameCount])
  const seek = useCallback((frame: number) => {
    setIsPlaying(false)
    setManualPreview(true)
    setPlayhead(clamp(frame))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameCount])
  const exitPreview = useCallback(() => {
    setIsPlaying(false)
    setManualPreview(false)
  }, [])

  return {
    isPlaying,
    playhead,
    preview: isPlaying || manualPreview,
    play,
    pause,
    toggle,
    step,
    seek,
    exitPreview,
  }
}
