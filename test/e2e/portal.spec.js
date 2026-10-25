import { expect, test } from '@playwright/test'

const TOLERANCE = 0.35

async function signIn(page, path = '/') {
  await page.goto(path)
  await page.getByLabel('Passcode').fill(process.env.E2E_PASSCODE)
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByRole('heading', { name: 'Newer Show', level: 2 })).toBeVisible()
}

// Where the judge tape is vs. where it should be (videoTime + offset).
function drift(page, offset) {
  return page.evaluate((offset) => {
    const v = document.querySelector('video')
    const a = document.querySelector('audio')
    return {
      drift: Math.abs(a.currentTime - (v.currentTime + offset)),
      audioPlaying: !a.paused,
      audioRate: a.playbackRate,
      audioError: a.error?.message ?? null,
    }
  }, offset)
}

async function expectInSync(page, offset, { playing = true } = {}) {
  await expect
    .poll(async () => {
      const s = await drift(page, offset)
      return s.audioError ?? (s.drift < TOLERANCE && s.audioPlaying === playing)
    })
    .toBe(true)
}

function video(page, fn, arg) {
  return page.locator('video').evaluate(fn, arg)
}

test('asks for the passcode and rejects a wrong one', async ({ page }) => {
  await page.goto('/?tune')
  await expect(page).toHaveURL(/\/login\?next=%2F%3Ftune$/)
  await page.getByLabel('Passcode').fill('wrong')
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByRole('alert')).toHaveText('That passcode didn’t work.')

  await page.getByLabel('Passcode').fill(process.env.E2E_PASSCODE)
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page).toHaveURL(/\/\?tune$/)
})

test('lists performances newest first and switches between them', async ({ page }) => {
  await signIn(page)
  await expect(page.locator('.performance-card h3')).toHaveText(['Newer Show', 'Older Show'])
  await expect(page.locator('video')).toHaveAttribute('src', '/media/2026/E2E%20Show/video.mp4')

  await page.getByRole('button', { name: /Older Show/ }).click()
  await expect(page.getByRole('heading', { name: 'Older Show', level: 2 })).toBeVisible()
  await expect(page.locator('video')).toHaveAttribute('src', '/media/2026/Older%20Show/video.mp4')
  await expect(page.getByRole('radio')).toHaveText([/Band/])
})

test('keeps the judge tape in sync through play, seek, judge switch, speed and pause', async ({ page }) => {
  await signIn(page)
  await expect(page.getByRole('radio', { name: /JA/ })).toHaveAttribute('aria-checked', 'true')

  await page.locator('video').click() // a real click, so the browser allows audio
  await expectInSync(page, 5)

  await video(page, (v) => (v.currentTime = 12))
  await expectInSync(page, 5)

  // Judge B's file name has a space in it.
  await page.getByRole('radio', { name: /JB/ }).click()
  await expectInSync(page, 2.5)

  await video(page, (v) => (v.playbackRate = 2))
  await expect.poll(async () => (await drift(page, 2.5)).audioRate).toBe(2)
  await expectInSync(page, 2.5)

  await video(page, (v) => v.pause())
  await expectInSync(page, 2.5, { playing: false })
})

test('band-only mode and the band-audio toggle control the video sound', async ({ page }) => {
  await signIn(page)
  await expect(page.locator('video')).toHaveJSProperty('muted', true)

  await page.getByLabel('Play band audio under commentary').check()
  await expect(page.locator('video')).toHaveJSProperty('muted', false)

  await page.getByRole('radio', { name: /Band/ }).click()
  await expect(page.locator('audio')).toHaveCount(0)
  await expect(page.locator('video')).toHaveJSProperty('muted', false)
})

test('remembers the commentary volume', async ({ page }) => {
  await signIn(page)
  await page.getByRole('slider').fill('0.4')
  await expect(page.locator('.volume output')).toHaveText('40%')
  await page.reload()
  await expect(page.locator('.volume output')).toHaveText('40%')
})

test('tune mode nudges the offset and outputs paste-ready JSON', async ({ page }) => {
  await signIn(page, '/?tune')
  await page.getByRole('button', { name: '+1s' }).click()
  await page.getByRole('button', { name: '-1 dB' }).click()
  const json = JSON.parse(await page.getByLabel('Performance JSON').inputValue())
  expect(json.id).toBe('newer-show')
  expect(json.judges[0]).toMatchObject({ id: 'a', offset: 6, gainDb: -4 })
  expect(json.judges[1]).toMatchObject({ id: 'b', offset: 2.5, gainDb: 0 })
})

test('shows a friendly error when the performance list fails to load', async ({ page }) => {
  await page.route('/api/performances', (route) =>
    route.fulfill({ status: 500, json: { error: 'performances.json is not valid JSON.' } }),
  )
  await page.goto('/')
  await page.getByLabel('Passcode').fill(process.env.E2E_PASSCODE)
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByRole('alert')).toContainText('Couldn’t load performances')
})
