// Suggests each judge tape's offset against the video, plus a gain that levels its loudness.
// Decoding needs the main thread (Web Audio); the math runs in a pool of Web Workers.
import { ALIGN_RATE, LOUDNESS_RATE } from '../lib/align'
import { mediaUrl } from '../lib/media'

async function bytesOf(source) {
  if (source.file) return source.file.arrayBuffer()
  const res = await fetch(mediaUrl(source.key))
  if (!res.ok) throw new Error(`Couldn’t download ${source.key} (${res.status}).`)
  return res.arrayBuffer()
}

// decodeAudioData resamples to the context's rate; it also detaches the buffer, hence slice().
async function decodeMono(bytes, rate) {
  const ctx = new OfflineAudioContext(1, 1, rate)
  const audio = await ctx.decodeAudioData(bytes.slice(0))
  const out = new Float32Array(audio.length)
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c)
    for (let i = 0; i < out.length; i++) out[i] += ch[i] / audio.numberOfChannels
  }
  return out
}

function createPool(size) {
  const workers = Array.from({ length: size }, () => new Worker(new URL('./alignWorker.js', import.meta.url), { type: 'module' }))
  const idle = [...workers]
  const waiting = []
  let seq = 0

  const run = (message, transfer) =>
    new Promise((resolve, reject) => {
      const go = (worker) => {
        const id = ++seq
        worker.onmessage = ({ data }) => {
          if (data.id !== id) return
          const nextJob = waiting.shift()
          if (nextJob) nextJob(worker)
          else idle.push(worker)
          if (data.error) reject(new Error(data.error))
          else resolve(data.result)
        }
        worker.onerror = (e) => reject(new Error(e.message || 'Alignment worker crashed.'))
        worker.postMessage({ ...message, id }, transfer)
      }
      const free = idle.pop()
      if (free) go(free)
      else waiting.push(go)
    })

  return { run, close: () => workers.forEach((w) => w.terminate()) }
}

// video: { file?, key }; tapes: [{ rowId, file?, key }]. onResult(rowId, result | { error }) per tape.
export async function autoAlign(video, tapes, { onStatus = () => {}, onResult = () => {} } = {}) {
  const pool = createPool(Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)))
  try {
    onStatus('Reading the video’s audio…')
    const videoSamples = await decodeMono(await bytesOf(video), ALIGN_RATE)
    const videoFlux = await pool.run({ type: 'flux', samples: videoSamples }, [videoSamples.buffer])

    const jobs = []
    for (const [i, tape] of tapes.entries()) {
      onStatus(`Reading judge tape ${i + 1} of ${tapes.length}…`)
      try {
        const bytes = await bytesOf(tape)
        const align = await decodeMono(bytes, ALIGN_RATE)
        const loudness = await decodeMono(bytes, LOUDNESS_RATE)
        jobs.push(
          pool
            .run({ type: 'tape', align, loudness, videoFlux }, [align.buffer, loudness.buffer])
            .then((r) => onResult(tape.rowId, r), (e) => onResult(tape.rowId, { error: e.message })),
        )
      } catch (e) {
        onResult(tape.rowId, { error: e.message || 'Couldn’t read this file.' })
      }
    }
    onStatus('Matching tapes to the video…')
    await Promise.all(jobs)
  } finally {
    pool.close()
  }
}
