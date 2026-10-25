// Source of truth for what the portal shows. Keys are paths in the R2 bucket
// (judge-tape-media); file names can be anything.
//
// offset = seconds into the judge tape when the video starts (tapeTime = videoTime + offset).
// gainDb = loudness correction so every tape plays at about -16 LUFS.
// scripts/align_offsets.py prints suggested values for both. Use ?tune in the URL to adjust by ear.

export const performances = [
  {
    id: '2026-region-championship',
    title: 'Region Championship',
    ensemble: 'Odessa HS Band',
    date: '2026-10-24',
    video: { key: '2026/Region Championship/BandVideo.mp4' },
    judges: [
      { id: 'gem', code: 'GEM', name: 'General Effect – Music', key: '2026/Region Championship/2026-10-24-Odessa_HS-GEM.m4a', offset: 38.82, gainDb: -9.1 },
      { id: 'gev', code: 'GEV', name: 'General Effect – Visual', key: '2026/Region Championship/2026-10-24-Odessa_HS-GEV .m4a', offset: 32.84, gainDb: -0.9 },
      { id: 'iam', code: 'IAM', name: 'Individual Analysis – Music', key: '2026/Region Championship/2026-10-24-Odessa_HS-IAM.m4a', offset: 0.3, gainDb: -4.6 },
      { id: 'eam', code: 'EAM', name: 'Ensemble Analysis – Music', key: '2026/Region Championship/2026-10-24-Odessa_HS-EAM.m4a', offset: 24.38, gainDb: 7.7 },
      { id: 'v', code: 'V', name: 'Visual', key: '2026/Region Championship/2026-10-24-Odessa_HS-V .m4a', offset: 32.18, gainDb: 2.6 },
      { id: 'perc', code: 'PERC', name: 'Percussion', key: '2026/Region Championship/2026-10-24-Odessa_HS-PERC.m4a', offset: 27.12, gainDb: 0.3 },
      { id: 'aux', code: 'AUX', name: 'Auxiliary', key: '2026/Region Championship/2026-10-24-Odessa_HS-AUX.m4a', offset: 34.12, gainDb: 0 },
    ],
  },
]

export function mediaUrl(key) {
  return `/media/${key.split('/').map(encodeURIComponent).join('/')}`
}
