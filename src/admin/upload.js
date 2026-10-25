// Uploads a File to R2 through the Worker in 10 MiB parts (3 at a time), retrying failed parts.
import { ApiError, api, signInAgain } from './api'

const PART_SIZE = 10 * 1024 * 1024
const PARALLEL = 3
const RETRIES = 4

function putPart(url, blob, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => onProgress(e.loaded)
    xhr.onload = () => {
      if (xhr.status === 401) signInAgain()
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response)
      else reject(new ApiError(xhr.response?.error ?? `Upload failed (${xhr.status}).`, xhr.status))
    }
    xhr.onerror = () => reject(new ApiError('Network error while uploading.', 0))
    xhr.onabort = () => reject(new DOMException('Upload cancelled.', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(blob)
  })
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const retryable = (e) => e.name !== 'AbortError' && (e.status === 0 || e.status >= 500)

export async function uploadFile(file, key, { onProgress = () => {}, signal } = {}) {
  const start = await api('POST', '/api/admin/uploads', { key, size: file.size, contentType: file.type })
  if (start.exists) {
    onProgress(1)
    return { key, skipped: true }
  }
  const base = `/api/admin/uploads/${encodeURIComponent(start.uploadId)}`
  const keyParam = `key=${encodeURIComponent(key)}`
  const count = Math.max(1, Math.ceil(file.size / PART_SIZE))
  const loaded = new Array(count).fill(0)
  const report = () => onProgress(Math.min(1, loaded.reduce((a, b) => a + b, 0) / file.size))
  const parts = []
  let next = 0

  async function lane() {
    while (next < count) {
      const i = next++
      const blob = file.slice(i * PART_SIZE, Math.min(file.size, (i + 1) * PART_SIZE))
      for (let attempt = 0; ; attempt++) {
        signal?.throwIfAborted()
        try {
          parts[i] = await putPart(`${base}/parts/${i + 1}?${keyParam}`, blob, (n) => ((loaded[i] = n), report()), signal)
          loaded[i] = blob.size
          report()
          break
        } catch (e) {
          loaded[i] = 0
          if (attempt >= RETRIES || !retryable(e)) throw e
          await wait(1000 * 2 ** attempt)
        }
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL, count) }, lane))
    return await api('POST', `${base}/complete`, { key, parts })
  } catch (e) {
    api('DELETE', `${base}?${keyParam}`).catch(() => {})
    throw e
  }
}
