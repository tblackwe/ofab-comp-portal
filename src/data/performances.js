export const performances = [
  {
    id: 'opening-march',
    title: 'Opening March',
    subtitle: 'Middle School Band',
    date: 'March 7, 2026',
    location: 'North Gym',
    status: 'Synced and ready',
    driveUrl: 'https://drive.google.com/drive/folders/your-folder-1',
    description:
      'The first performance of the evening with the full ensemble and a strong opener for the judges.',
    videos: [
      {
        title: 'Performance video',
        kind: 'Main recording',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        synced: true,
        note: 'Aligned to the full band audio track.',
      },
      {
        title: 'Judge tape 01',
        kind: 'Judge recording',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm',
        synced: true,
        note: 'Ready to compare with the official performance.',
      },
      {
        title: 'Judge tape 02',
        kind: 'Judge recording',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        synced: true,
        note: 'Matched to the same start point as the band audio.',
      },
    ],
  },
  {
    id: 'jazz-combo',
    title: 'Jazz Combo',
    subtitle: 'Jazz Ensemble',
    date: 'March 7, 2026',
    location: 'South Studio',
    status: 'Synced and ready',
    driveUrl: 'https://drive.google.com/drive/folders/your-folder-2',
    description:
      'A tighter ensemble performance with visible section leadership and a more detailed judge tape sync.',
    videos: [
      {
        title: 'Performance video',
        kind: 'Main recording',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        synced: true,
        note: 'Ready for parents and staff review.',
      },
      {
        title: 'Soloist camera',
        kind: 'Parent upload',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm',
        synced: true,
        note: 'Angle matched to the official stage video.',
      },
    ],
  },
  {
    id: 'closing-finale',
    title: 'Closing Finale',
    subtitle: 'Concert Band',
    date: 'March 7, 2026',
    location: 'Main Stage',
    status: 'Synced and ready',
    driveUrl: 'https://drive.google.com/drive/folders/your-folder-3',
    description:
      'The final performance of the evening, with the full band and the judges finishing on the same timeline.',
    videos: [
      {
        title: 'Performance video',
        kind: 'Main recording',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        synced: true,
        note: 'Default view with full-band sync enabled.',
      },
      {
        title: 'Judge tape 03',
        kind: 'Judge recording',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm',
        synced: true,
        note: 'Matches the final run with a clean cue list.',
      },
      {
        title: 'Front camera',
        kind: 'Parent upload',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        synced: true,
        note: 'Useful for side-by-side review with the main stage recording.',
      },
    ],
  },
]
