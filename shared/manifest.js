// The performance list lives in the R2 bucket as performances.json, so adding a
// performance is an upload, not a deploy. Shared by the Worker (which refuses to
// serve a broken file) and scripts/manifest.mjs (which checks before uploading).

export const MANIFEST_KEY = 'performances.json'

const DATE = /^\d{4}-\d{2}-\d{2}$/

function isText(v) {
  return typeof v === 'string' && v.trim() !== ''
}

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

function checkKey(errors, where, key) {
  if (!isText(key)) errors.push(`${where}: "key" must be the file's path in the bucket`)
  else if (key.split('/').includes('..')) errors.push(`${where}: "key" must not contain ".."`)
}

function checkUnique(errors, where, items) {
  const seen = new Set()
  for (const id of items.map((x) => x?.id).filter(isText)) {
    if (seen.has(id)) errors.push(`${where}: id "${id}" is used more than once`)
    seen.add(id)
  }
}

// Returns a list of human-readable problems; empty means valid.
export function validateManifest(data) {
  const errors = []
  if (!data || typeof data !== 'object' || !Array.isArray(data.performances)) {
    return ['The file must look like { "performances": [ ... ] }']
  }

  data.performances.forEach((p, i) => {
    const at = `performances[${i}]${isText(p?.id) ? ` (${p.id})` : ''}`
    if (!p || typeof p !== 'object') return errors.push(`${at}: must be an object`)
    if (!isText(p.id)) errors.push(`${at}: "id" is required`)
    if (!isText(p.title)) errors.push(`${at}: "title" is required`)
    if (!DATE.test(p.date ?? '')) errors.push(`${at}: "date" must be YYYY-MM-DD`)
    if (p.ensemble !== undefined && typeof p.ensemble !== 'string') errors.push(`${at}: "ensemble" must be text`)
    checkKey(errors, `${at}.video`, p.video?.key)
    if (!Array.isArray(p.judges)) return errors.push(`${at}: "judges" must be a list (it can be empty)`)

    p.judges.forEach((j, k) => {
      const jat = `${at}.judges[${k}]${isText(j?.code) ? ` (${j.code})` : ''}`
      if (!j || typeof j !== 'object') return errors.push(`${jat}: must be an object`)
      for (const field of ['id', 'code', 'name']) {
        if (!isText(j[field])) errors.push(`${jat}: "${field}" is required`)
      }
      checkKey(errors, jat, j.key)
      if (!isNumber(j.offset)) errors.push(`${jat}: "offset" must be a number of seconds`)
      if (j.gainDb !== undefined && !isNumber(j.gainDb)) errors.push(`${jat}: "gainDb" must be a number`)
    })
    checkUnique(errors, `${at}.judges`, p.judges)
  })
  checkUnique(errors, 'performances', data.performances)
  return errors
}
