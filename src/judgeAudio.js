import { useEffect } from 'react'

// Routes judge <audio> elements through Web Audio so we can (a) boost quiet tapes above
// 100% and (b) control volume on iOS, where HTMLMediaElement.volume is read-only.
// A limiter catches peaks from boosted tapes, many of which already clip.

let context = null
let limiter = null
const graphs = new WeakMap()

function getContext() {
  if (context) return context
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  context = new Ctx()
  limiter = context.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.003
  limiter.release.value = 0.1
  limiter.connect(context.destination)

  // Browsers start audio contexts suspended until a user gesture.
  const resume = () => context.state !== 'running' && context.resume().catch(() => {})
  for (const type of ['pointerdown', 'keydown', 'touchend']) {
    window.addEventListener(type, resume, { capture: true, passive: true })
  }
  return context
}

function graphFor(audio) {
  let graph = graphs.get(audio)
  if (graph) return graph
  const ctx = getContext()
  if (!ctx) return null
  const gain = ctx.createGain()
  // An element can only be wrapped once; StrictMode re-runs effects, hence the WeakMap.
  ctx.createMediaElementSource(audio).connect(gain)
  gain.connect(limiter)
  graph = { gain }
  graphs.set(audio, graph)
  return graph
}

export function resumeAudio() {
  if (context && context.state !== 'running') context.resume().catch(() => {})
}

export function dbToGain(db) {
  return 10 ** ((db ?? 0) / 20)
}

export function useJudgeVolume(audioRef, trackKey, gain) {
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !trackKey) return
    const graph = graphFor(audio)
    if (graph) {
      graph.gain.gain.setTargetAtTime(gain, graph.gain.context.currentTime, 0.02)
      audio.volume = 1
    } else {
      audio.volume = Math.min(1, gain)
    }
  }, [audioRef, trackKey, gain])
}
