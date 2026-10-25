// Suggests each judge tape's offset and gain. A JavaScript port of scripts/align_offsets.py
// that runs in the browser (in a Web Worker) on audio already decoded to mono Float32Arrays.
//
// offset: judge recorders pick up the band, so the tape's onsets (spectral flux) are
//         cross-correlated with the video's. offset = tapeTime - videoTime.
// gainDb: BS.1770 integrated loudness, corrected to TARGET_LUFS.

export const ALIGN_RATE = 8000
export const LOUDNESS_RATE = 16000
export const TARGET_LUFS = -16

const HOP = 160
const FPS = ALIGN_RATE / HOP
const NFFT = 1024
const SEGMENT_SECONDS = 60

// ---- filters -------------------------------------------------------------

function biquad(x, [b0, b1, b2, a0, a1, a2]) {
  const y = new Float32Array(x.length)
  const nb0 = b0 / a0, nb1 = b1 / a0, nb2 = b2 / a0, na1 = a1 / a0, na2 = a2 / a0
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = nb0 * x[i] + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2
    x2 = x1
    x1 = x[i]
    y2 = y1
    y1 = v
    y[i] = v
  }
  return y
}

function lowpass(fc, fs, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * fc) / fs, c = Math.cos(w), alpha = Math.sin(w) / (2 * q)
  return [(1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha]
}

function highpass(fc, fs, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * fc) / fs, c = Math.cos(w), alpha = Math.sin(w) / (2 * q)
  return [(1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha]
}

// K-weighting stage 1 and 2 for any sample rate, as derived in libebur128 (what ffmpeg uses).
function kShelf(fs) {
  const K = Math.tan((Math.PI * 1681.974450955533) / fs), Q = 0.7071752369554196
  const Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416
  const a0 = 1 + K / Q + K * K
  return [Vh + (Vb * K) / Q + K * K, 2 * (K * K - Vh), Vh - (Vb * K) / Q + K * K, a0, 2 * (K * K - 1), 1 - K / Q + K * K]
}

function kHighpass(fs) {
  const K = Math.tan((Math.PI * 38.13547087602444) / fs), Q = 0.5003270373238773
  const a0 = 1 + K / Q + K * K
  return [a0, -2 * a0, a0, a0, 2 * (K * K - 1), 1 - K / Q + K * K]
}

// ---- FFT -----------------------------------------------------------------

// In-place radix-2 complex FFT. n must be a power of two.
function fft(re, im, inverse = false) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n
      im[i] /= n
    }
  }
}

const nextPow2 = (n) => 2 ** Math.ceil(Math.log2(n))

// ---- onset features -----------------------------------------------------------

function bandEdges() {
  const bins = NFFT / 2 + 1
  const lo = Math.log(4), hi = Math.log(bins - 1)
  const edges = []
  for (let i = 0; i < 33; i++) edges.push(Math.floor(Math.exp(lo + ((hi - lo) * i) / 32) + 1e-9))
  return [...new Set(edges)]
}

// Spectral flux per log-spaced band, z-normalized. Returns { frames, bands, data } (row-major).
export function spectralFlux(samples) {
  const filtered = biquad(biquad(samples, highpass(60, ALIGN_RATE)), lowpass(1500, ALIGN_RATE))
  const edges = bandEdges()
  const nb = edges.length - 1
  const frames = Math.max(0, Math.floor((filtered.length - NFFT) / HOP))
  const window = new Float64Array(NFFT).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (NFFT - 1)))
  const bands = new Float64Array(frames * nb)
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT)

  for (let f = 0; f < frames; f++) {
    const at = f * HOP
    for (let i = 0; i < NFFT; i++) {
      re[i] = filtered[at + i] * window[i]
      im[i] = 0
    }
    fft(re, im)
    for (let b = 0; b < nb; b++) {
      let sum = 0
      for (let k = edges[b]; k < edges[b + 1]; k++) sum += Math.sqrt(re[k] * re[k] + im[k] * im[k])
      bands[f * nb + b] = Math.log1p(sum * 10)
    }
  }

  const n = Math.max(0, frames - 1)
  const data = new Float64Array(n * nb)
  for (let b = 0; b < nb; b++) {
    let mean = 0
    for (let f = 0; f < n; f++) {
      const v = Math.max(bands[(f + 1) * nb + b] - bands[f * nb + b], 0)
      data[f * nb + b] = v
      mean += v
    }
    mean /= n || 1
    let variance = 0
    for (let f = 0; f < n; f++) variance += (data[f * nb + b] - mean) ** 2
    const std = Math.sqrt(variance / (n || 1)) + 1e-9
    for (let f = 0; f < n; f++) data[f * nb + b] = (data[f * nb + b] - mean) / std
  }
  return { frames: n, bands: nb, data }
}

// Per-band spectra of the tape, computed once and reused for every comparison.
function tapeSpectra(tape, n) {
  const spectra = []
  for (let b = 0; b < tape.bands; b++) {
    const re = new Float64Array(n), im = new Float64Array(n)
    for (let f = 0; f < tape.frames; f++) re[f] = tape.data[f * tape.bands + b]
    fft(re, im)
    spectra.push([re, im])
  }
  return spectra
}

// Summed cross-correlation over bands against video frames [start, end).
// Returns the best lag in frames (tape index - video index).
function bestLag(spectra, video, n, start, end) {
  const sumRe = new Float64Array(n), sumIm = new Float64Array(n)
  const br = new Float64Array(n), bi = new Float64Array(n)
  spectra.forEach(([ar, ai], b) => {
    br.fill(0)
    bi.fill(0)
    for (let f = start; f < end; f++) br[f] = video.data[f * video.bands + b]
    fft(br, bi)
    for (let k = 0; k < n; k++) {
      // A * conj(B)
      sumRe[k] += ar[k] * br[k] + ai[k] * bi[k]
      sumIm[k] += ai[k] * br[k] - ar[k] * bi[k]
    }
  })
  fft(sumRe, sumIm, true)
  let best = 0
  for (let k = 1; k < n; k++) if (sumRe[k] > sumRe[best]) best = k
  return best > n / 2 ? best - n : best
}

// offset (seconds) plus how many one-minute video segments independently agree (within 0.5 s).
export function findOffset(tapeFlux, videoFlux) {
  const n = nextPow2(tapeFlux.frames + videoFlux.frames)
  const spectra = tapeSpectra(tapeFlux, n)
  const offset = bestLag(spectra, videoFlux, n, 0, videoFlux.frames) / FPS
  const seg = SEGMENT_SECONDS * FPS
  let agree = 0, total = 0
  for (let start = 0; start < videoFlux.frames - seg; start += seg) {
    const lag = bestLag(spectra, videoFlux, n, start, start + seg) / FPS
    total++
    if (Math.abs(lag - offset) < 0.5) agree++
  }
  return { offset: Math.round(offset * 100) / 100, agree, total }
}

// ---- loudness ----------------------------------------------------------------

// BS.1770 integrated loudness (LUFS) of a mono signal at LOUDNESS_RATE.
export function integratedLoudness(samples, fs = LOUDNESS_RATE) {
  const k = biquad(biquad(samples, kShelf(fs)), kHighpass(fs))
  const block = Math.round(0.4 * fs), step = Math.round(0.1 * fs)
  const powers = []
  for (let at = 0; at + block <= k.length; at += step) {
    let sum = 0
    for (let i = at; i < at + block; i++) sum += k[i] * k[i]
    powers.push(sum / block)
  }
  const lufs = (p) => -0.691 + 10 * Math.log10(p)
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
  const absolute = powers.filter((p) => lufs(p) > -70)
  if (!absolute.length) return -Infinity
  const relativeGate = lufs(mean(absolute)) - 10
  const gated = absolute.filter((p) => lufs(p) > relativeGate)
  return lufs(mean(gated))
}

export function suggestGainDb(samples, fs = LOUDNESS_RATE) {
  const lufs = integratedLoudness(samples, fs)
  return Number.isFinite(lufs) ? Math.round((TARGET_LUFS - lufs) * 10) / 10 || 0 : 0
}
