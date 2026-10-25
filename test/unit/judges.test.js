import { describe, expect, it } from 'vitest'
import { byJudgeOrder, guessCode, judgeId, judgeNames, slug } from '../../src/admin/judges'

describe('judge helpers', () => {
  const names = judgeNames([{ judges: [{ code: 'BRASS', name: 'Brass Caption' }, { code: 'GEM', name: 'Ignored' }] }])

  it('guesses the code from tape file names', () => {
    expect(guessCode('2026-10-24-Odessa_HS-GEM.m4a', names)).toBe('GEM')
    expect(guessCode('2026-10-24-Odessa_HS-GEV .m4a', names)).toBe('GEV')
    expect(guessCode('perc (1).m4a', names)).toBe('PERC')
    expect(guessCode('show brass.m4a', names)).toBe('BRASS')
    expect(guessCode('mystery-judge.m4a', names)).toBe('JUDGE')
  })

  it('keeps built-in names and learns new codes from existing performances', () => {
    expect(names.get('GEM')).toBe('General Effect – Music')
    expect(names.get('BRASS')).toBe('Brass Caption')
  })

  it('sorts judges in sheet order, unknown codes last', () => {
    const codes = ['AUX', 'ZZ', 'GEM', 'V', 'EAM'].map((code) => ({ code })).sort(byJudgeOrder).map((j) => j.code)
    expect(codes).toEqual(['GEM', 'EAM', 'V', 'AUX', 'ZZ'])
  })

  it('makes ids and slugs safe for URLs and keys', () => {
    expect(judgeId('PERC')).toBe('perc')
    expect(slug('2026-10-24 Région Championship!')).toBe('2026-10-24-region-championship')
  })
})
