import { useEffect, useRef } from 'react'

const DRIFT_TOLERANCE = 0.25

// Keeps an <audio> element locked to a <video> element, where
// audioTime = videoTime + offset.
export function useSyncedAudio(videoRef, audioRef, offset, trackKey) {
  const enabled = Boolean(trackKey)
  const offsetRef = useRef(offset)

  useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio || !enabled) return undefined

    const target = () => video.currentTime + offsetRef.current
    const inRange = (t) => t >= 0 && (!Number.isFinite(audio.duration) || t < audio.duration)

    const sync = (force = false) => {
      const t = target()
      if (!inRange(t)) {
        if (!audio.paused) audio.pause()
        return
      }
      if (force || Math.abs(audio.currentTime - t) > DRIFT_TOLERANCE) {
        audio.currentTime = t
      }
      audio.playbackRate = video.playbackRate
      const shouldPlay = !video.paused && !video.ended && video.readyState >= 3
      if (shouldPlay && audio.paused) {
        audio.play().catch(() => {})
      } else if (!shouldPlay && !audio.paused) {
        audio.pause()
      }
    }

    const onPause = () => audio.pause()
    const forceSync = () => sync(true)
    const softSync = () => sync(false)

    video.addEventListener('play', forceSync)
    video.addEventListener('playing', forceSync)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onPause)
    video.addEventListener('seeked', forceSync)
    video.addEventListener('ratechange', softSync)
    video.addEventListener('timeupdate', softSync)
    audio.addEventListener('loadedmetadata', forceSync)
    audio.addEventListener('canplay', softSync)

    forceSync()

    return () => {
      video.removeEventListener('play', forceSync)
      video.removeEventListener('playing', forceSync)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onPause)
      video.removeEventListener('seeked', forceSync)
      video.removeEventListener('ratechange', softSync)
      video.removeEventListener('timeupdate', softSync)
      audio.removeEventListener('loadedmetadata', forceSync)
      audio.removeEventListener('canplay', softSync)
      audio.pause()
    }
  }, [videoRef, audioRef, enabled, trackKey])

  // Re-align immediately when the offset is nudged.
  useEffect(() => {
    offsetRef.current = offset
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio || !enabled) return
    const t = video.currentTime + offset
    if (t >= 0) audio.currentTime = t
  }, [videoRef, audioRef, offset, enabled])
}
