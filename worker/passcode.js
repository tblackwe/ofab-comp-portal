// Interim shared-passcode gate until "Login with BAND" is approved.
// The passcode lives in the SITE_PASSCODE secret; the cookie holds an HMAC of it,
// so changing the passcode signs everyone out.

const COOKIE = 'jt_session'
const MAX_AGE = 60 * 60 * 24 * 90

async function sessionToken(passcode) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(passcode), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('judge-tape-session-v1'))
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c])
}

async function safeEqual(a, b) {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  return crypto.subtle.timingSafeEqual(ha, hb)
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

function safeNext(value) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/login') ? value : '/'
}

export async function hasSession(request, env) {
  const cookie = readCookie(request, COOKIE)
  return Boolean(cookie) && safeEqual(cookie, await sessionToken(env.SITE_PASSCODE))
}

export async function handleLogin(request, env) {
  const url = new URL(request.url)

  if (request.method === 'POST') {
    const form = await request.formData()
    const next = safeNext(form.get('next'))
    const attempt = String(form.get('passcode') || '').trim().toLowerCase()
    if (await safeEqual(attempt, env.SITE_PASSCODE.trim().toLowerCase())) {
      const secure = url.protocol === 'https:' ? '; Secure' : ''
      return new Response(null, {
        status: 303,
        headers: {
          location: next,
          'set-cookie': `${COOKIE}=${await sessionToken(env.SITE_PASSCODE)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure}`,
        },
      })
    }
    return loginPage(next, true)
  }

  return loginPage(safeNext(url.searchParams.get('next')), false)
}

export function redirectToLogin(request) {
  const url = new URL(request.url)
  const next = encodeURIComponent(url.pathname + url.search)
  return Response.redirect(`${url.origin}/login?next=${next}`, 303)
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function loginPage(next, failed) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OFAB Marching Band Competition Portal</title>
<link rel="icon" href="/favicon.ico">
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Inter, 'Segoe UI', sans-serif;
    color: #edf3ea; background: radial-gradient(circle at top, rgba(62,107,82,.28), transparent 30%), linear-gradient(180deg,#091a12,#050d0a); }
  form { width: min(360px, 90vw); padding: 28px; border-radius: 22px; background: rgba(15,33,24,.82); border: 1px solid rgba(151,176,161,.22); }
  p.eyebrow { margin: 0 0 8px; font-size: .72rem; letter-spacing: .18em; text-transform: uppercase; color: #d7bf53; }
  h1 { margin: 0 0 20px; font-size: 2rem; text-transform: uppercase; letter-spacing: -.04em; }
  h1 span { color: #d7bf53; }
  input { box-sizing: border-box; width: 100%; padding: .8rem 1rem; border-radius: 12px; border: 1px solid rgba(151,176,161,.35);
    background: #040a08; color: #edf3ea; font: inherit; }
  button { margin-top: 12px; width: 100%; padding: .8rem; border: 0; border-radius: 999px; font: inherit; font-weight: 700;
    color: #0d1b12; background: linear-gradient(135deg,#f2d75b,#d7bf53); cursor: pointer; }
  .error { color: #ffb4a8; margin: 10px 0 0; font-size: .9rem; }
  .hint { color: #a7baae; margin: 14px 0 0; font-size: .82rem; }
</style>
</head>
<body>
<form method="post" action="/login">
  <p class="eyebrow">Competition parent hub</p>
  <h1>Judge Tape <span>Portal</span></h1>
  <input type="hidden" name="next" value="${escapeHtml(next)}">
  <input name="passcode" type="password" placeholder="Passcode" autocomplete="current-password" autocapitalize="none" autofocus required aria-label="Passcode">
  <button type="submit">Enter</button>
  ${failed ? '<p class="error" role="alert">That passcode didn’t work.</p>' : ''}
  <p class="hint">The passcode is posted in our BAND.</p>
</form>
</body>
</html>`
  return new Response(html, {
    status: failed ? 401 : 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
