import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { authed } from './helpers.js'

const BODY = '0123456789'

beforeEach(async () => {
  await env.MEDIA.put('2026/Show/Judge GEV .m4a', BODY)
  await env.MEDIA.put('typed.bin', BODY, { httpMetadata: { contentType: 'video/webm' } })
})

const path = '/media/2026/Show/Judge%20GEV%20.m4a'
const text = async (res) => new TextDecoder().decode(await res.arrayBuffer())

describe('media streaming', () => {
  it('serves a whole file with a content type from its extension', async () => {
    const res = await authed(path)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/mp4')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('content-length')).toBe('10')
    expect(await text(res)).toBe(BODY)
  })

  it('prefers the content type stored in R2', async () => {
    const res = await authed('/media/typed.bin')
    expect(res.headers.get('content-type')).toBe('video/webm')
  })

  it.each([
    ['bytes=2-5', 'bytes 2-5/10', '2345'],
    ['bytes=7-', 'bytes 7-9/10', '789'],
    ['bytes=-3', 'bytes 7-9/10', '789'],
  ])('serves range %s', async (range, contentRange, body) => {
    const res = await authed(path, { headers: { range } })
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe(contentRange)
    expect(res.headers.get('content-length')).toBe(String(body.length))
    expect(await text(res)).toBe(body)
  })

  it('answers HEAD with the size and no body', async () => {
    const res = await authed(path, { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-length')).toBe('10')
    expect(await text(res)).toBe('')
  })

  it('returns 304 when the ETag matches', async () => {
    const etag = (await authed(path)).headers.get('etag')
    const res = await authed(path, { headers: { 'if-none-match': etag } })
    expect(res.status).toBe(304)
  })

  it('returns 404 for a missing file', async () => {
    expect((await authed('/media/nope.mp4')).status).toBe(404)
  })

  it.each(['/media/', '/media/a%2F..%2Fb.mp4', '/media/%E0%A4%A'])('returns 400 for a bad key (%s)', async (p) => {
    expect((await authed(p)).status).toBe(400)
  })

  it('rejects writes', async () => {
    expect((await authed(path, { method: 'PUT', body: 'x' })).status).toBe(405)
  })
})
