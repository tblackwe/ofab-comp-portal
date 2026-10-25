import { performances } from '../data/performances'

const MEDIA_MODE = import.meta.env.VITE_MEDIA_MODE || 'demo'
const MEDIA_API_BASE_URL = import.meta.env.VITE_MEDIA_API_BASE_URL || ''
const MEDIA_BASE_URL = import.meta.env.VITE_MEDIA_BASE_URL || ''

const demoVideoSources = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm',
]

function resolveVideoSource(src, index) {
  if (!src) {
    return demoVideoSources[index % demoVideoSources.length]
  }

  if (src.startsWith('http://') || src.startsWith('https://')) {
    return src
  }

  if (MEDIA_BASE_URL) {
    return `${MEDIA_BASE_URL.replace(/\/$/, '')}/${src.replace(/^\/+/, '')}`
  }

  return src
}

function normalizeDemoPerformance(performance) {
  return {
    ...performance,
    videos: (performance.videos || []).map((video, index) => ({
      ...video,
      src: resolveVideoSource(video.src, index),
    })),
  }
}

export async function loadPerformanceById(id) {
  if (MEDIA_MODE === 'api' && MEDIA_API_BASE_URL) {
    const response = await fetch(`${MEDIA_API_BASE_URL}/api/performance/${id}`)

    if (!response.ok) {
      throw new Error(`Failed to load performance ${id}`)
    }

    return response.json()
  }

  const match = performances.find((performance) => performance.id === id)

  if (!match) {
    return performances[0]
  }

  return normalizeDemoPerformance(match)
}
