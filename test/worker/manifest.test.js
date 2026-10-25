import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { MANIFEST_KEY, validateManifest } from '../../shared/manifest.js'
import { authed, call } from './helpers.js'

const judge = (over = {}) => ({ id: 'gem', code: 'GEM', name: 'General Effect – Music', key: 'a/gem.m4a', offset: 1.5, gainDb: -2, ...over })
const performance = (over = {}) => ({
  id: 'show',
  title: 'Show',
  ensemble: 'Band',
  date: '2026-10-24',
  video: { key: 'a/video.mp4' },
  judges: [judge()],
  ...over,
})

describe('validateManifest', () => {
  it('accepts a valid manifest', () => {
    expect(validateManifest({ performances: [performance()] })).toEqual([])
  })

  it('accepts an empty list, no judges, and a missing gainDb', () => {
    expect(validateManifest({ performances: [] })).toEqual([])
    expect(validateManifest({ performances: [performance({ judges: [] })] })).toEqual([])
    expect(validateManifest({ performances: [performance({ judges: [judge({ gainDb: undefined })] })] })).toEqual([])
  })

  it.each([null, [], {}, { performances: {} }])('rejects the wrong shape (%j)', (data) => {
    expect(validateManifest(data)).toEqual(['The file must look like { "performances": [ ... ] }'])
  })

  it.each([
    [performance({ title: '' }), '(show): "title" is required'],
    [performance({ date: '10/24/2026' }), '"date" must be YYYY-MM-DD'],
    [performance({ video: {} }), '(show).video: "key"'],
    [performance({ judges: undefined }), '"judges" must be a list'],
    [performance({ judges: [judge({ offset: '38.8' })] }), '(GEM): "offset" must be a number'],
    [performance({ judges: [judge({ gainDb: null })] }), '"gainDb" must be a number'],
    [performance({ judges: [judge({ key: 'a/../b.m4a' })] }), 'must not contain ".."'],
    [performance({ judges: [judge(), judge()] }), 'id "gem" is used more than once'],
    [performance({ published: 'yes' }), '"published" must be true or false'],
  ])('reports a readable problem (%#)', (p, message) => {
    const problems = validateManifest({ performances: [p] })
    expect(problems.join('\n')).toContain(message)
  })

  it('rejects duplicate performance ids', () => {
    expect(validateManifest({ performances: [performance(), performance()] })).toContain(
      'performances: id "show" is used more than once',
    )
  })
})

describe('GET /api/performances', () => {
  beforeEach(() => env.MEDIA.delete(MANIFEST_KEY))

  it('requires a session', async () => {
    const res = await call('/api/performances')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Signed out.' })
  })

  it('returns the manifest from the bucket', async () => {
    const data = { performances: [performance()] }
    await env.MEDIA.put(MANIFEST_KEY, JSON.stringify(data))
    const res = await authed('/api/performances')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
    expect(await res.json()).toEqual(data)
  })

  it('treats a missing file as no performances yet', async () => {
    const res = await authed('/api/performances')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ performances: [] })
  })

  it('hides drafts from parents', async () => {
    const data = { performances: [performance(), performance({ id: 'draft', published: false })] }
    await env.MEDIA.put(MANIFEST_KEY, JSON.stringify(data))
    const body = await (await authed('/api/performances')).json()
    expect(body.performances.map((p) => p.id)).toEqual(['show'])
  })

  it('refuses to serve broken JSON', async () => {
    await env.MEDIA.put(MANIFEST_KEY, '{ nope')
    const res = await authed('/api/performances')
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('not valid JSON')
  })

  it('refuses to serve an invalid manifest and says why', async () => {
    await env.MEDIA.put(MANIFEST_KEY, JSON.stringify({ performances: [performance({ date: 'soon' })] }))
    const body = await (await authed('/api/performances')).json()
    expect(body.problems).toEqual(['performances[0] (show): "date" must be YYYY-MM-DD'])
  })

  it('404s unknown API routes and non-GET methods', async () => {
    expect((await authed('/api/nope')).status).toBe(404)
    expect((await authed('/api/performances', { method: 'POST' })).status).toBe(404)
  })
})
