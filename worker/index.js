const defaultPerformances = {
  'opening-march': {
    id: 'opening-march',
    title: 'Opening March',
    subtitle: 'Middle School Band',
    date: 'March 7, 2026',
    location: 'North Gym',
    status: 'Ready',
    description: 'The first performance of the evening with the full ensemble and a strong opener for the judges.',
    videos: [
      {
        title: 'Performance video',
        kind: 'Main recording',
        key: 'performances/opening-march/main.mp4',
        synced: true,
        note: 'Main recording for the ensemble performance.',
      },
      {
        title: 'Judge tape 01',
        kind: 'Judge recording',
        key: 'performances/opening-march/judge-01.mp4',
        synced: true,
        note: 'Judge recording for review.',
      },
    ],
  },
  'jazz-combo': {
    id: 'jazz-combo',
    title: 'Jazz Combo',
    subtitle: 'Jazz Ensemble',
    date: 'March 7, 2026',
    location: 'South Studio',
    status: 'Ready',
    description: 'A tighter ensemble performance with visible section leadership and a more detailed judge tape sync.',
    videos: [
      {
        title: 'Performance video',
        kind: 'Main recording',
        key: 'performances/jazz-combo/main.mp4',
        synced: true,
        note: 'Main recording for the ensemble performance.',
      },
      {
        title: 'Soloist camera',
        kind: 'Parent upload',
        key: 'performances/jazz-combo/soloist-camera.mp4',
        synced: true,
        note: 'Alternate angle for review.',
      },
    ],
  },
  'closing-finale': {
    id: 'closing-finale',
    title: 'Closing Finale',
    subtitle: 'Concert Band',
    date: 'March 7, 2026',
    location: 'Main Stage',
    status: 'Ready',
    description: 'The final performance of the evening, with the full band and the judges finishing on the same timeline.',
    videos: [
      {
        title: 'Performance video',
        kind: 'Main recording',
        key: 'performances/closing-finale/main.mp4',
        synced: true,
        note: 'Default view for the final performance.',
      },
      {
        title: 'Judge tape 03',
        kind: 'Judge recording',
        key: 'performances/closing-finale/judge-03.mp4',
        synced: true,
        note: 'Judge tape for the final performance.',
      },
    ],
  },
}

function withPublicUrls(performance, baseUrl) {
  return {
    ...performance,
    videos: (performance.videos || []).map((video) => ({
      ...video,
      src: `${baseUrl.replace(/\/$/, '')}/${video.key}`,
    })),
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const performanceId = url.pathname.replace(/^\/+|\/+$/g, '').split('/').pop()
    const baseUrl = (env.PUBLIC_MEDIA_BASE_URL || '').replace(/\/$/, '')

    if (!baseUrl) {
      return Response.json(
        {
          error: 'PUBLIC_MEDIA_BASE_URL is not configured.',
        },
        { status: 500 },
      )
    }

    const performance = defaultPerformances[performanceId]

    if (!performance) {
      return Response.json({ error: 'Performance not found' }, { status: 404 })
    }

    return Response.json(withPublicUrls(performance, baseUrl), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    })
  },
}
