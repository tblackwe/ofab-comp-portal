import { findOffset, spectralFlux, suggestGainDb } from '../lib/align'

self.onmessage = ({ data }) => {
  const { id, type } = data
  try {
    if (type === 'flux') {
      self.postMessage({ id, result: spectralFlux(data.samples) })
    } else if (type === 'tape') {
      const { offset, agree, total } = findOffset(spectralFlux(data.align), data.videoFlux)
      self.postMessage({ id, result: { offset, agree, total, gainDb: suggestGainDb(data.loudness) } })
    }
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) })
  }
}
