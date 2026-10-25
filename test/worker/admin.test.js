import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { MANIFEST_KEY } from '../../shared/manifest.js'
import { adminLogin, asAdmin, authed, call, login } from './helpers.js'

const performance = (over = {}) => ({
  id: 'show',
  title: 'Show',
  date: '2026-10-24',
  video: { key: '2026/show/video.mp4' },
  judges: [{ id: 'gem', code: 'GEM', name: 'General Effect – Music', key: '2026/show/gem.m4a', offset: 3, gainDb: -2 }],
  published: false,
  ...over,
})

const put = (p) => asAdmin(`/api/admin/performances/${p.id}`, { method: 'PUT', body: JSON.stringify(p) })
const manifest = async () => JSON.parse(await (await env.MEDIA.get(MANIFEST_KEY)).text())

beforeEach(async () => {
  const listed = await env.MEDIA.list()
  if (listed.objects.length) await env.MEDIA.delete(listed.objects.map((o) => o.key))
})

describe('admin sign-in', () => {
  it('redirects /admin to the admin login', async () => {
    const res = await call('/admin')
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://portal.test/admin/login?next=%2Fadmin')
  })

  it('does not let the parent passcode in', async () => {
    const { cookie } = await login()
    expect((await call('/admin', { headers: { cookie } })).status).toBe(303)
    expect((await call('/api/admin/performances', { headers: { cookie } })).status).toBe(401)
    expect((await adminLogin('Test-Pass')).res.status).toBe(401)
  })

  it('is case-sensitive', async () => {
    expect((await adminLogin('admin-pass-123')).res.status).toBe(401)
  })

  it('signs in and lands on /admin', async () => {
    const { res, cookie } = await adminLogin()
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/admin')
    expect(cookie).toMatch(/^ofab_admin=/)
    expect((await call('/admin', { headers: { cookie } })).status).toBe(200)
  })

  it('keeps admins on admin pages after login', async () => {
    const res = await call('/admin/login', { method: 'POST', body: new URLSearchParams({ passcode: 'Admin-Pass-123', next: '/' }) })
    expect(res.headers.get('location')).toBe('/admin')
  })

  it('lets an admin see the parent site too', async () => {
    const { cookie } = await adminLogin()
    expect((await call('/', { headers: { cookie } })).status).toBe(200)
  })

  it('is switched off when no admin password is set', async () => {
    expect((await call('/admin', {}, { ADMIN_PASSCODE: undefined })).status).toBe(404)
    expect((await call('/', {}, { ADMIN_PASSCODE: undefined })).status).toBe(303)
  })

  it('refuses cross-site writes', async () => {
    const res = await asAdmin('/api/admin/uploads', { method: 'POST', body: '{}', headers: { origin: 'https://evil.example' } })
    expect(res.status).toBe(403)
  })
})

describe('admin performances', () => {
  it('lists drafts and published performances', async () => {
    await env.MEDIA.put(MANIFEST_KEY, JSON.stringify({ performances: [performance(), performance({ id: 'old', published: undefined })] }))
    const body = await (await asAdmin('/api/admin/performances')).json()
    expect(body.performances.map((p) => [p.id, p.published])).toEqual([
      ['show', false],
      ['old', true],
    ])
  })

  it('refuses to save a performance whose files are not uploaded', async () => {
    const res = await put(performance())
    expect(res.status).toBe(400)
    expect((await res.json()).problems).toEqual([
      'File not uploaded yet: 2026/show/video.mp4',
      'File not uploaded yet: 2026/show/gem.m4a',
    ])
  })

  it('creates, updates and publishes', async () => {
    await env.MEDIA.put('2026/show/video.mp4', 'v')
    await env.MEDIA.put('2026/show/gem.m4a', 'a')

    expect((await put(performance())).status).toBe(200)
    expect((await manifest()).performances).toHaveLength(1)
    expect((await (await authed('/api/performances')).json()).performances).toEqual([])

    await put(performance({ published: true, title: 'Renamed' }))
    const saved = await manifest()
    expect(saved.performances).toHaveLength(1)
    expect(saved.performances[0]).toMatchObject({ title: 'Renamed', published: true })
    expect((await (await authed('/api/performances')).json()).performances[0].title).toBe('Renamed')
  })

  it('rejects an invalid performance with readable problems', async () => {
    await env.MEDIA.put('2026/show/video.mp4', 'v')
    const res = await put(performance({ judges: [], date: 'tomorrow' }))
    expect(res.status).toBe(400)
    expect((await res.json()).problems).toEqual(['performances[0] (show): "date" must be YYYY-MM-DD'])
  })

  it('requires the URL id to match', async () => {
    const res = await asAdmin('/api/admin/performances/other', { method: 'PUT', body: JSON.stringify(performance()) })
    expect(res.status).toBe(400)
  })

  it('deletes a performance, and optionally only the files no one else uses', async () => {
    const shared = { key: '2026/shared.mp4' }
    await env.MEDIA.put(shared.key, 'v')
    await env.MEDIA.put('2026/show/gem.m4a', 'a')
    await env.MEDIA.put(
      MANIFEST_KEY,
      JSON.stringify({ performances: [performance({ video: shared }), performance({ id: 'other', video: shared, judges: [] })] }),
    )

    const res = await asAdmin('/api/admin/performances/show?files=1', { method: 'DELETE' })
    expect(await res.json()).toEqual({ deleted: ['2026/show/gem.m4a'] })
    expect((await manifest()).performances.map((p) => p.id)).toEqual(['other'])
    expect(await env.MEDIA.head(shared.key)).not.toBeNull()
    expect(await env.MEDIA.head('2026/show/gem.m4a')).toBeNull()
  })

  it('404s deleting an unknown performance', async () => {
    expect((await asAdmin('/api/admin/performances/nope', { method: 'DELETE' })).status).toBe(404)
  })
})

describe('admin uploads', () => {
  const MiB = 1024 * 1024

  async function upload(key, bytes, partSize) {
    const start = await asAdmin('/api/admin/uploads', { method: 'POST', body: JSON.stringify({ key, size: bytes.length, contentType: 'video/mp4' }) })
    const started = await start.json()
    if (started.exists) return started
    const parts = []
    for (let n = 1, at = 0; at < bytes.length; n++, at += partSize) {
      const res = await asAdmin(`/api/admin/uploads/${encodeURIComponent(started.uploadId)}/parts/${n}?key=${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: bytes.slice(at, at + partSize),
      })
      expect(res.status).toBe(200)
      parts.push(await res.json())
    }
    const done = await asAdmin(`/api/admin/uploads/${encodeURIComponent(started.uploadId)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ key, parts }),
    })
    return done.json()
  }

  it('uploads a file in parts', async () => {
    const bytes = new Uint8Array(11 * MiB).map((_, i) => i % 251)
    const result = await upload('2026/show/My Video.mp4', bytes, 5 * MiB)
    expect(result).toEqual({ key: '2026/show/My Video.mp4', size: bytes.length })
    const object = await env.MEDIA.get('2026/show/My Video.mp4')
    expect(object.httpMetadata.contentType).toBe('video/mp4')
    const hash = async (b) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].join(',')
    expect(await hash(await object.arrayBuffer())).toBe(await hash(bytes))
  })

  it('skips a file that is already uploaded with the same size', async () => {
    await env.MEDIA.put('2026/show/gem.m4a', 'abc')
    expect(await upload('2026/show/gem.m4a', new Uint8Array(3), MiB)).toEqual({ key: '2026/show/gem.m4a', exists: true })
  })

  it.each(['', '/abs.mp4', 'a/../b.mp4', 'a//b.mp4', MANIFEST_KEY])('rejects the path %j', async (key) => {
    const res = await asAdmin('/api/admin/uploads', { method: 'POST', body: JSON.stringify({ key, size: 1 }) })
    expect(res.status).toBe(400)
  })

  it('can abort an upload', async () => {
    const { uploadId } = await (
      await asAdmin('/api/admin/uploads', { method: 'POST', body: JSON.stringify({ key: 'x.mp4', size: 10 }) })
    ).json()
    const res = await asAdmin(`/api/admin/uploads/${encodeURIComponent(uploadId)}?key=x.mp4`, { method: 'DELETE' })
    expect(await res.json()).toEqual({ aborted: true })
  })
})
