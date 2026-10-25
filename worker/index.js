// Serves the app and media from the private R2 bucket. Every request (pages,
// assets, media) goes through this Worker so access is gated in one place.

import { handleAdminApi } from './admin.js'
import { json } from './http.js'
import { isPublished, ManifestError, readManifest } from './manifest.js'
import { ADMIN, handleLogin, hasSession, isConfigured, PARENT, redirectToLogin } from './passcode.js'

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

// Published performances only; drafts are for the admin page.
async function servePerformances(env) {
  try {
    const { data } = await readManifest(env)
    return json({ performances: data.performances.filter(isPublished) })
  } catch (error) {
    if (error instanceof ManifestError) return json({ error: error.message, problems: error.problems }, 500)
    throw error
  }
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

  const path = url.pathname
  const isAdminPath = path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/')

  if (isAdminPath) {
    if (!isConfigured(ADMIN, env)) return new Response('Admin is not set up.', { status: 404 })
    if (path === ADMIN.loginPath) return handleLogin(ADMIN, request, env)
    if (!(await hasSession(ADMIN, request, env))) {
      return path.startsWith('/api/') ? json({ error: 'Signed out.' }, 401) : redirectToLogin(ADMIN, request)
    }
    if (path.startsWith('/api/admin/')) return handleAdminApi(request, env, url)
    return serveAsset(request, env)
  }

  if (!isConfigured(PARENT, env)) {
    return new Response('SITE_PASSCODE is not configured.', { status: 500 })
  }

  if (path === PARENT.loginPath) {
    return handleLogin(PARENT, request, env)
  }

  // Admins can see everything parents can.
  const signedIn = (await hasSession(PARENT, request, env)) || (await hasSession(ADMIN, request, env))
  if (!signedIn) {
    if (path.startsWith('/api/')) return json({ error: 'Signed out.' }, 401)
    return path.startsWith('/media/') ? new Response('Unauthorized', { status: 401 }) : redirectToLogin(PARENT, request)
  }

  if (path.startsWith('/api/')) {
    if (path === '/api/performances' && request.method === 'GET') return servePerformances(env)
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

  return serveAsset(request, env)
}

async function serveAsset(request, env) {
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
