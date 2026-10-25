import { statSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const FIXTURES = 'test/e2e/fixtures'

async function adminSignIn(page) {
  await page.goto('/admin')
  await page.getByLabel('Admin password').fill(process.env.E2E_ADMIN_PASSCODE)
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByRole('heading', { name: 'Performances' })).toBeVisible()
}

test('the admin page needs the admin password, not the parent passcode', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login/)
  await page.getByLabel('Admin password').fill(process.env.E2E_PASSCODE)
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByRole('alert')).toContainText('didn’t work')
  await expect(page.getByRole('heading', { name: 'Performances' })).toHaveCount(0)
})

test('upload, auto-align, draft, publish and delete a performance', async ({ page }) => {
  test.setTimeout(120_000)
  await adminSignIn(page)
  await page.getByRole('button', { name: 'New performance' }).click()
  await page.getByLabel('Title').fill('Spring Show')
  await page.getByLabel('Date').fill('2026-03-14')

  await page.getByLabel('Choose video').setInputFiles(`${FIXTURES}/admin-video.mp4`)
  await page.getByLabel('Add judge tapes').setInputFiles([`${FIXTURES}/Show-2026-PERC .m4a`, `${FIXTURES}/Show-2026-GEM.m4a`])

  // Codes and names are guessed from the file names and sorted into judge order.
  await expect(page.getByLabel('Code').nth(0)).toHaveValue('GEM')
  await expect(page.getByLabel('Code').nth(1)).toHaveValue('PERC')
  await expect(page.getByLabel('Name for GEM')).toHaveValue('General Effect – Music')
  await expect(page.getByLabel('Name for PERC')).toHaveValue('Percussion')
  await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled()

  await page.getByRole('button', { name: 'Auto-align' }).click()
  await expect(page.getByRole('status').filter({ hasText: /Done|failed/ })).toContainText('Done', { timeout: 60_000 })
  // GEM has 4 s of lead-in before the show starts; PERC started recording 2.5 s in.
  expect(Number(await page.getByLabel('Offset for GEM').inputValue())).toBeCloseTo(4, 1)
  expect(Number(await page.getByLabel('Offset for PERC').inputValue())).toBeCloseTo(-2.5, 1)

  await expect(page.locator('.upload-status', { hasText: 'Uploaded' })).toHaveCount(3, { timeout: 60_000 })
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Saved as a draft')).toBeVisible()

  // An admin session also opens the parent site; drafts stay hidden there.
  const parent = await page.context().newPage()
  await parent.goto('/')
  await expect(parent.getByRole('heading', { name: 'Newer Show', level: 2 })).toBeVisible()
  await expect(parent.getByText('Spring Show')).toHaveCount(0)

  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByText('Published. Parents can see it now.')).toBeVisible()
  await parent.reload()
  await expect(parent.getByText('Spring Show')).toBeVisible()

  // The uploaded file is byte-for-byte what was picked.
  const media = await page.request.get('/media/2026/2026-03-14-spring-show/admin-video.mp4')
  expect(media.status()).toBe(200)
  expect((await media.body()).length).toBe(statSync(`${FIXTURES}/admin-video.mp4`).size)

  await page.getByRole('button', { name: 'Delete…' }).click()
  await page.getByRole('button', { name: 'Delete permanently' }).click()
  await expect(page.getByRole('heading', { name: 'Performances' })).toBeVisible()
  await expect(page.getByText('Spring Show')).toHaveCount(0)
  expect((await page.request.get('/media/2026/2026-03-14-spring-show/admin-video.mp4')).status()).toBe(404)
})
