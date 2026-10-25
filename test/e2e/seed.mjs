// Fills the local (offline) R2 bucket used by E2E=1 with the test fixtures.
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const PERSIST = '.wrangler/e2e'
const DIR = 'test/e2e/fixtures'
const FILES = {
  'performances.json': 'performances.json',
  '2026/E2E Show/video.mp4': 'video.mp4',
  '2026/Older Show/video.mp4': 'video.mp4',
  '2026/E2E Show/judge-a.m4a': 'judge-a.m4a',
  '2026/E2E Show/Judge B .m4a': 'judge-b.m4a',
}

rmSync(PERSIST, { recursive: true, force: true })
for (const [key, file] of Object.entries(FILES)) {
  execFileSync(
    'npx',
    ['wrangler', 'r2', 'object', 'put', `judge-tape-media/${key}`, '--file', `${DIR}/${file}`, '--local', '--persist-to', PERSIST],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )
}
console.log(`Seeded ${Object.keys(FILES).length} objects into ${PERSIST}`)
