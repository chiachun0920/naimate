import { useEffect, useRef, useState } from 'react'

export interface Playback {
  isPlaying: boolean
  playhead: number
  play: () => void
  pause: () => void
  toggle: () => void
}

/** Drive a frame index forward at `fps` using requestAnimationFrame. */
export function usePlayback(frameCount: number, fps: number, loop: boolean): Playback {
  const [isPlaying, setIsPlaying] = useState(false)
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

  const play = () => {
    setPlayhead(0)
    setIsPlaying(true)
  }
  const pause = () => setIsPlaying(false)
  const toggle = () => (isPlaying ? pause() : play())

  return { isPlaying, playhead, play, pause, toggle }
}
