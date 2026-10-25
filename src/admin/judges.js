// Judge captions. Codes are guessed from tape file names like "2026-10-24-Odessa_HS-GEM.m4a".
export const KNOWN_JUDGES = [
  ['GEM', 'General Effect – Music'],
  ['GEV', 'General Effect – Visual'],
  ['IAM', 'Individual Analysis – Music'],
  ['IAV', 'Individual Analysis – Visual'],
  ['EAM', 'Ensemble Analysis – Music'],
  ['EAV', 'Ensemble Analysis – Visual'],
  ['M', 'Music'],
  ['V', 'Visual'],
  ['PERC', 'Percussion'],
  ['AUX', 'Auxiliary'],
  ['CG', 'Color Guard'],
  ['DM', 'Drum Major'],
]

const ORDER = KNOWN_JUDGES.map(([code]) => code)

// Known names plus any code -> name pairs used in existing performances.
export function judgeNames(performances = []) {
  const names = new Map(KNOWN_JUDGES)
  for (const p of performances) for (const j of p.judges) if (!names.has(j.code)) names.set(j.code, j.name)
  return names
}

export function guessCode(fileName, names) {
  const tokens = fileName.replace(/\.[^.]+$/, '').split(/[\s_\-.()]+/).filter(Boolean).map((t) => t.toUpperCase())
  for (let i = tokens.length - 1; i >= 0; i--) if (names.has(tokens[i])) return tokens[i]
  return tokens.at(-1) ?? ''
}

export function judgeId(code) {
  return code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function byJudgeOrder(a, b) {
  const rank = (code) => (ORDER.includes(code) ? ORDER.indexOf(code) : ORDER.length)
  return rank(a.code) - rank(b.code) || a.code.localeCompare(b.code)
}

export function slug(text) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
