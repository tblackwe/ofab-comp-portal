// Bucket keys can contain spaces and other characters; encode each path segment.
export function mediaUrl(key) {
  return `/media/${key.split('/').map(encodeURIComponent).join('/')}`
}
