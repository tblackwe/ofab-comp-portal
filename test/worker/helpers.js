import { env } from 'cloudflare:workers'
import worker from '../../worker/index.js'

export const ORIGIN = 'https://portal.test'

// The real ASSETS binding comes from the Vite build; tests use a stand-in.
const assets = {
  fetch: (request) => {
    const { pathname } = new URL(request.url)
    if (pathname === '/favicon.ico') return new Response('ico', { headers: { 'content-type': 'image/x-icon' } })
    return new Response('<!doctype html><title>app</title>', {
      headers: { 'content-type': 'text/html', 'cache-control': 'public, max-age=3600' },
    })
  },
}

export function testEnv(overrides = {}) {
  return { ...env, ASSETS: assets, ...overrides }
}

export function call(path, init = {}, envOverrides) {
  return worker.fetch(new Request(ORIGIN + path, { redirect: 'manual', ...init }), testEnv(envOverrides))
}

export async function login(passcode = 'Test-Pass') {
  const res = await call('/login', {
    method: 'POST',
    body: new URLSearchParams({ passcode, next: '/' }),
  })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? null
  return { res, cookie }
}

export async function authed(path, init = {}) {
  const { cookie } = await login()
  const headers = new Headers(init.headers)
  headers.set('cookie', cookie)
  return call(path, { ...init, headers })
}
