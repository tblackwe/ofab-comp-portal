import { describe, expect, it } from 'vitest'
import { authed, call, login } from './helpers.js'

describe('passcode gate', () => {
  it('redirects pages to /login with the original path', async () => {
    const res = await call('/some/page?tune')
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://portal.test/login?next=%2Fsome%2Fpage%3Ftune')
  })

  it('returns 401 for media without a session', async () => {
    const res = await call('/media/a.mp4')
    expect(res.status).toBe(401)
  })

  it('serves robots.txt and favicon without a session', async () => {
    expect(await (await call('/robots.txt')).text()).toContain('Disallow: /')
    expect((await call('/favicon.ico')).status).toBe(200)
  })

  it('shows the login form', async () => {
    const res = await call('/login?next=/x')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('name="passcode"')
    expect(html).toContain('value="/x"')
  })

  it('rejects a wrong passcode', async () => {
    const { res, cookie } = await login('nope')
    expect(res.status).toBe(401)
    expect(cookie).toBeNull()
    expect(await res.text()).toContain('didn’t work')
  })

  it('accepts the passcode ignoring case and surrounding spaces', async () => {
    const { res, cookie } = await login('  test-PASS ')
    expect(res.status).toBe(303)
    expect(cookie).toMatch(/^jt_session=/)
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Lax; Secure/)
  })

  it('lets a signed-in visitor through to the app', async () => {
    const res = await authed('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
  })

  it('rejects a forged cookie', async () => {
    const res = await call('/', { headers: { cookie: 'jt_session=forged' } })
    expect(res.status).toBe(303)
  })

  it('signs everyone out when the passcode changes', async () => {
    const { cookie } = await login()
    const res = await call('/', { headers: { cookie } }, { SITE_PASSCODE: 'new-pass' })
    expect(res.status).toBe(303)
  })

  it.each([
    ['//evil.example', '/'],
    ['https://evil.example', '/'],
    ['/login', '/'],
    ['/?tune', '/?tune'],
  ])('only redirects to same-site paths after login (%s)', async (next, expected) => {
    const res = await call('/login', { method: 'POST', body: new URLSearchParams({ passcode: 'Test-Pass', next }) })
    expect(res.headers.get('location')).toBe(expected)
  })

  it('escapes the next parameter in the login page', async () => {
    const html = await (await call('/login?next=/"><script>')).text()
    expect(html).not.toContain('"><script>')
  })

  it('fails closed when no passcode is configured', async () => {
    const res = await call('/', {}, { SITE_PASSCODE: undefined })
    expect(res.status).toBe(500)
  })

  it('marks every response noindex', async () => {
    for (const path of ['/', '/login', '/robots.txt', '/media/x']) {
      expect((await call(path)).headers.get('x-robots-tag')).toBe('noindex, nofollow')
    }
  })
})
