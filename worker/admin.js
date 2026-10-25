// Admin API (/api/admin/*). The caller has already been checked for an admin session.
import { MANIFEST_KEY } from '../shared/manifest.js'
import { json } from './http.js'
import { isPublished, ManifestError, readManifest, updateManifest } from './manifest.js'

const MAX_PART_BYTES = 50 * 1024 * 1024

function badKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 512) return 'A file path is required.'
  if (key.startsWith('/') || key.split('/').some((s) => s === '' || s === '.' || s === '..')) return 'That file path is not allowed.'
  if (key === MANIFEST_KEY) return 'That file name is reserved.'
  // oxlint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(key)) return 'That file path is not allowed.'
  return null
}

async function readJson(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function mediaKeys(performance) {
  return [performance.video?.key, ...(performance.judges ?? []).map((j) => j.key)].filter(Boolean)
}

async function missingFiles(env, performance) {
  const keys = [...new Set(mediaKeys(performance))]
  const heads = await Promise.all(keys.map((key) => env.MEDIA.head(key)))
  return keys.filter((_, i) => !heads[i]).map((key) => `File not uploaded yet: ${key}`)
}

async function savePerformance(request, env, id) {
  const performance = await readJson(request)
  if (!performance || typeof performance !== 'object') return json({ error: 'Expected a performance as JSON.' }, 400)
  if (performance.id !== id) return json({ error: 'The id in the body must match the URL.' }, 400)

  const missing = await missingFiles(env, performance)
  if (missing.length) return json({ error: 'Some files are missing from the bucket.', problems: missing }, 400)

  const data = await updateManifest(env, (manifest) => {
    const index = manifest.performances.findIndex((p) => p.id === id)
    if (index === -1) manifest.performances.push(performance)
    else manifest.performances[index] = performance
    return manifest
  })
  return json({ performance: data.performances.find((p) => p.id === id) })
}

async function deletePerformance(env, id, deleteFiles) {
  let removed = null
  const data = await updateManifest(env, (manifest) => {
    removed = manifest.performances.find((p) => p.id === id) ?? null
    manifest.performances = manifest.performances.filter((p) => p.id !== id)
    return manifest
  })
  if (!removed) return json({ error: 'No performance with that id.' }, 404)

  let deleted = []
  if (deleteFiles) {
    // Only files no other performance still uses.
    const stillUsed = new Set(data.performances.flatMap(mediaKeys))
    deleted = [...new Set(mediaKeys(removed))].filter((key) => !stillUsed.has(key))
    if (deleted.length) await env.MEDIA.delete(deleted)
  }
  return json({ deleted })
}

async function startUpload(request, env) {
  const body = await readJson(request)
  const problem = badKey(body?.key)
  if (problem) return json({ error: problem }, 400)
  if (!Number.isSafeInteger(body.size) || body.size <= 0) return json({ error: 'A file size is required.' }, 400)

  // Same path and size already in the bucket: treat as done, so a retried upload resumes instantly.
  const existing = await env.MEDIA.head(body.key)
  if (existing && existing.size === body.size) return json({ key: body.key, exists: true })

  const contentType = typeof body.contentType === 'string' && body.contentType ? body.contentType : undefined
  const upload = await env.MEDIA.createMultipartUpload(body.key, { httpMetadata: contentType ? { contentType } : undefined })
  return json({ key: body.key, uploadId: upload.uploadId })
}

async function uploadPart(request, env, uploadId, partNumber, key) {
  const problem = badKey(key)
  if (problem) return json({ error: problem }, 400)
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) return json({ error: 'Bad part number.' }, 400)
  if (Number(request.headers.get('content-length')) > MAX_PART_BYTES) return json({ error: 'Part too large.' }, 413)
  // Parts are small (the browser sends 10 MiB), so buffering is fine and gives R2 a known length.
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength === 0) return json({ error: 'Empty part.' }, 400)
  if (bytes.byteLength > MAX_PART_BYTES) return json({ error: 'Part too large.' }, 413)

  const part = await env.MEDIA.resumeMultipartUpload(key, uploadId).uploadPart(partNumber, bytes)
  return json({ partNumber: part.partNumber, etag: part.etag })
}

async function completeUpload(request, env, uploadId) {
  const body = await readJson(request)
  const problem = badKey(body?.key)
  if (problem) return json({ error: problem }, 400)
  if (!Array.isArray(body.parts) || body.parts.length === 0) return json({ error: 'No parts to complete.' }, 400)
  const parts = body.parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })).sort((a, b) => a.partNumber - b.partNumber)
  const object = await env.MEDIA.resumeMultipartUpload(body.key, uploadId).complete(parts)
  return json({ key: object.key, size: object.size })
}

async function abortUpload(env, uploadId, key) {
  const problem = badKey(key)
  if (problem) return json({ error: problem }, 400)
  await env.MEDIA.resumeMultipartUpload(key, uploadId).abort()
  return json({ aborted: true })
}

async function route(request, env, url) {
  const parts = url.pathname.split('/').slice(3).map(decodeURIComponent) // after /api/admin/
  const method = request.method

  if (parts[0] === 'performances') {
    if (parts.length === 1 && method === 'GET') {
      const { data } = await readManifest(env)
      return json({ performances: data.performances.map((p) => ({ ...p, published: isPublished(p) })) })
    }
    if (parts.length === 2 && method === 'PUT') return savePerformance(request, env, parts[1])
    if (parts.length === 2 && method === 'DELETE') return deletePerformance(env, parts[1], url.searchParams.get('files') === '1')
  }

  if (parts[0] === 'uploads') {
    if (parts.length === 1 && method === 'POST') return startUpload(request, env)
    const key = url.searchParams.get('key')
    if (parts.length === 4 && parts[2] === 'parts' && method === 'PUT') return uploadPart(request, env, parts[1], Number(parts[3]), key)
    if (parts.length === 3 && parts[2] === 'complete' && method === 'POST') return completeUpload(request, env, parts[1])
    if (parts.length === 2 && method === 'DELETE') return abortUpload(env, parts[1], key)
  }

  return json({ error: 'Not found.' }, 404)
}

export async function handleAdminApi(request, env, url) {
  // Browsers always send Origin on cross-site writes; refuse them (CSRF).
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.headers.get('origin') !== url.origin) {
    return json({ error: 'Cross-site request refused.' }, 403)
  }
  try {
    return await route(request, env, url)
  } catch (error) {
    if (error instanceof ManifestError) return json({ error: error.message, problems: error.problems }, error.problems.length ? 400 : 409)
    if (error instanceof URIError) return json({ error: 'Bad request.' }, 400)
    console.error(error)
    return json({ error: 'Something went wrong on the server.' }, 500)
  }
}
