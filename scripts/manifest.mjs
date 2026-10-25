#!/usr/bin/env node
// Edit the performance list that lives in R2.
//
//   npm run manifest -- pull    download performances.json from the bucket
//   npm run manifest -- check   validate the local copy
//   npm run manifest -- push    validate, then upload (live immediately; no deploy needed)
//
// The local copy (./performances.json) is gitignored; the bucket is the source of truth.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { MANIFEST_KEY, validateManifest } from '../shared/manifest.js'

const BUCKET = 'judge-tape-media'
const FILE = 'performances.json'

function wrangler(...args) {
  execFileSync('npx', ['wrangler', 'r2', 'object', ...args, '--remote'], { stdio: 'inherit' })
}

function check() {
  if (!existsSync(FILE)) {
    console.error(`No ${FILE} here. Run "npm run manifest -- pull" first.`)
    process.exit(1)
  }
  let data
  try {
    data = JSON.parse(readFileSync(FILE, 'utf8'))
  } catch (error) {
    console.error(`${FILE} is not valid JSON: ${error.message}`)
    process.exit(1)
  }
  const problems = validateManifest(data)
  if (problems.length) {
    console.error(`${FILE} has problems:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    process.exit(1)
  }
  const judges = data.performances.reduce((n, p) => n + p.judges.length, 0)
  console.log(`${FILE} looks good: ${data.performances.length} performance(s), ${judges} judge tape(s).`)
}

const command = process.argv[2]
if (command === 'pull') {
  wrangler('get', `${BUCKET}/${MANIFEST_KEY}`, '--file', FILE)
} else if (command === 'check') {
  check()
} else if (command === 'push') {
  check()
  wrangler('put', `${BUCKET}/${MANIFEST_KEY}`, '--file', FILE, '--content-type', 'application/json', '--cache-control', 'no-cache')
} else {
  console.error('Usage: npm run manifest -- pull | check | push')
  process.exit(1)
}
