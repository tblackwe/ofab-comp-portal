// Serves the app and media from the private R2 bucket. Every request (pages,
// assets, media) goes through this Worker so access is gated in one place.

import { MANIFEST_KEY, validateManifest } from '../shared/manifest.js'
import { handleLogin, hasSession, redirectToLogin } from './passcode.js'

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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-cache' },
  })
}

// The performance list, read from the bucket on every request so uploads show up immediately.
async function serveManifest(env) {
  const object = await env.MEDIA.get(MANIFEST_KEY)
  if (!object) {
    return json({ error: `${MANIFEST_KEY} is missing from the bucket.` }, 404)
  }
  let data
  try {
    data = await object.json()
  } catch {
    return json({ error: `${MANIFEST_KEY} is not valid JSON.` }, 500)
  }
  const problems = validateManifest(data)
  if (problems.length) {
    return json({ error: `${MANIFEST_KEY} has problems.`, problems }, 500)
  }
  return json({ performances: data.performances })
}

const ROBOTS = 'User-agent: *\nDisallow: /\n'

async function route(request, env) {
  const url = new URL(request.url)

  if (url.pathname === '/robots.txt') {
    return new Response(ROBOTS, { headers: { 'content-type': 'text/plain' } })
  }

  // Shown on the login page, so it must load before sign-in.
  if (url.pathname === '/favicon.ico') {
    return env.ASSETS.fetch(request)
  }

  if (!env.SITE_PASSCODE) {
    return new Response('SITE_PASSCODE is not configured.', { status: 500 })
  }

  if (url.pathname === '/login') {
    return handleLogin(request, env)
  }

  const isApi = url.pathname.startsWith('/api/')
  if (!(await hasSession(request, env))) {
    if (isApi) return json({ error: 'Signed out.' }, 401)
    return url.pathname.startsWith('/media/') ? new Response('Unauthorized', { status: 401 }) : redirectToLogin(request)
  }

  if (isApi) {
    if (url.pathname === '/api/performances' && request.method === 'GET') return serveManifest(env)
    return json({ error: 'Not found.' }, 404)
  }

  if (url.pathname.startsWith('/media/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 })
    }
    let key
    try {
      key = decodeURIComponent(url.pathname.slice('/media/'.length))
    } catch {
      key = ''
    }
    if (!key || key.includes('..')) {
      return new Response('Bad request', { status: 400 })
    }
    return serveMedia(request, env, key)
  }

  const asset = await env.ASSETS.fetch(request)
  const headers = new Headers(asset.headers)
  // Authenticated content must not be cached by shared caches.
  headers.set('cache-control', 'private, no-cache')
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers })
}

export default {
  async fetch(request, env) {
    const response = await route(request, env)
    const headers = new Headers(response.headers)
    headers.set('x-robots-tag', 'noindex, nofollow')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  },
}
