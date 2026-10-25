import { describe, expect, it } from 'vitest'
import { ALIGN_RATE, findOffset, integratedLoudness, spectralFlux, suggestGainDb } from '../../src/lib/align.js'

// Deterministic pseudo-random numbers so failures are reproducible.
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1
}

// Seconds of "band": noise bursts at random times, like drum hits and phrases.
function band(seconds, seed) {
  const rand = rng(seed)
  const out = new Float32Array(seconds * ALIGN_RATE)
  for (let t = 0; t < out.length; ) {
    const len = Math.floor((0.05 + Math.abs(rand()) * 0.4) * ALIGN_RATE)
    const amp = 0.1 + Math.abs(rand()) * 0.5
    for (let i = 0; i < len && t + i < out.length; i++) out[t + i] = rand() * amp
    t += len + Math.floor(Math.abs(rand()) * 0.5 * ALIGN_RATE)
  }
  return out
}

function sine(seconds, rate, amp, freq = 997) {
  return new Float32Array(seconds * rate).map((_, i) => amp * Math.sin((2 * Math.PI * freq * i) / rate))
}

describe('findOffset', () => {
  it('finds where the video starts in a judge tape', () => {
    const video = band(150, 1)
    const lead = 7.3 * ALIGN_RATE // judge started recording 7.3 s before the video
    const noise = rng(2)
    const tape = new Float32Array(lead + video.length + 4 * ALIGN_RATE).map((_, i) => {
      const v = i >= lead && i - lead < video.length ? video[i - lead] * 0.4 : 0
      return v + noise() * 0.02 // the judge's mic picks up the band quieter, plus room noise
    })
    const result = findOffset(spectralFlux(tape), spectralFlux(video))
    expect(result.offset).toBeCloseTo(7.3, 1)
    expect(result.agree).toBe(result.total)
    expect(result.total).toBe(2)
  })

  it('handles a tape that starts after the video (negative offset)', () => {
    const video = band(90, 3)
    const tape = video.slice(2 * ALIGN_RATE)
    expect(findOffset(spectralFlux(tape), spectralFlux(video)).offset).toBeCloseTo(-2, 1)
  })
})

describe('loudness', () => {
  it('measures a full-scale 997 Hz sine at -3.01 LUFS (BS.1770 reference)', () => {
    expect(integratedLoudness(sine(10, 16000, 1))).toBeCloseTo(-3.01, 1)
  })

  it('suggests the gain that brings a tape to -16 LUFS', () => {
    expect(suggestGainDb(sine(10, 16000, 10 ** (-20 / 20)))).toBeCloseTo(7, 1)
  })

  it('suggests no change for silence', () => {
    expect(suggestGainDb(new Float32Array(16000 * 5))).toBe(0)
  })
})
