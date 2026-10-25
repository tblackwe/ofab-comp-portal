// Serves media from the private R2 bucket. The bucket is never exposed publicly;
// every file goes through this Worker so access can be gated in one place.

// TODO(auth): replace with "Login with BAND" session check.
async function isAuthorized() {
  return true
}

const CONTENT_TYPES = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
}

async function serveMedia(request, env, key) {
  const isHead = request.method === 'HEAD'
  const object = isHead
    ? await env.MEDIA.head(key)
    : await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers })

  if (!object) {
    return new Response('Not found', { status: 404 })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  if (!headers.has('content-type')) {
    const ext = key.split('.').pop().toLowerCase()
    headers.set('content-type', CONTENT_TYPES[ext] ?? 'application/octet-stream')
  }
  headers.set('etag', object.httpEtag)
  headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', 'private, max-age=3600')

  // Precondition (If-None-Match etc.) matched: R2 returns metadata without a body.
  if (!isHead && !('body' in object)) {
    return new Response(null, { status: 304, headers })
  }

  if (isHead) {
    headers.set('content-length', String(object.size))
    return new Response(null, { status: 200, headers })
  }

  const range = object.range
  if (range && request.headers.has('range')) {
    const offset = range.offset ?? object.size - range.suffix
    const length = range.length ?? object.size - offset
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`)
    headers.set('content-length', String(length))
    return new Response(object.body, { status: 206, headers })
  }

  headers.set('content-length', String(object.size))
  return new Response(object.body, { status: 200, headers })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/media/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405 })
      }
      if (!(await isAuthorized(request, env))) {
        return new Response('Unauthorized', { status: 401 })
      }
      const key = decodeURIComponent(url.pathname.slice('/media/'.length))
      if (!key || key.includes('..')) {
        return new Response('Bad request', { status: 400 })
      }
      return serveMedia(request, env, key)
    }

    return new Response('Not found', { status: 404 })
  },
}
