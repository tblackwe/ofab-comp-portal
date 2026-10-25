// Fetch helpers for the admin API. Errors carry the server's message and any validation problems.

export class ApiError extends Error {
  constructor(message, status, problems = []) {
    super(message)
    this.status = status
    this.problems = problems
  }
}

export function signInAgain() {
  window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`)
}

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    // Not JSON (e.g. a proxy error page).
  }
  if (res.status === 401) {
    signInAgain()
    throw new ApiError('Signed out. Sign in again.', 401)
  }
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status}).`, res.status, data?.problems ?? [])
  return data
}

export const listPerformances = () => api('GET', '/api/admin/performances').then((d) => d.performances)
export const savePerformance = (p) => api('PUT', `/api/admin/performances/${encodeURIComponent(p.id)}`, p)
export const deletePerformance = (id, files) =>
  api('DELETE', `/api/admin/performances/${encodeURIComponent(id)}${files ? '?files=1' : ''}`)
