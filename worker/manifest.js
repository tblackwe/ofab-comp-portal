// Reading and updating performances.json in the bucket.
import { MANIFEST_KEY, validateManifest } from '../shared/manifest.js'

export class ManifestError extends Error {
  constructor(message, problems = []) {
    super(message)
    this.problems = problems
  }
}

// A missing file means no performances yet.
export async function readManifest(env) {
  const object = await env.MEDIA.get(MANIFEST_KEY)
  if (!object) return { data: { performances: [] }, etag: null }
  let data
  try {
    data = await object.json()
  } catch {
    throw new ManifestError(`${MANIFEST_KEY} is not valid JSON.`)
  }
  const problems = validateManifest(data)
  if (problems.length) throw new ManifestError(`${MANIFEST_KEY} has problems.`, problems)
  return { data, etag: object.etag }
}

// Applies change(data) and saves, retrying if someone else saved in between.
export async function updateManifest(env, change) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, etag } = await readManifest(env)
    const next = change(structuredClone(data))
    const problems = validateManifest(next)
    if (problems.length) throw new ManifestError('That change would make the performance list invalid.', problems)
    const body = JSON.stringify(next, null, 2) + '\n'
    const options = { httpMetadata: { contentType: 'application/json', cacheControl: 'no-cache' } }
    if (etag) options.onlyIf = { etagMatches: etag }
    const written = await env.MEDIA.put(MANIFEST_KEY, body, options)
    if (written) return next
  }
  throw new ManifestError('The performance list changed while saving. Try again.')
}

export const isPublished = (p) => p.published !== false
