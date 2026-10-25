// Passcode sign-in, used for two separate gates:
//   PARENT: shared passcode posted in BAND (interim until Login with BAND). Case-insensitive.
//   ADMIN:  band staff password for /admin. Case-sensitive.
// Each cookie holds an HMAC of its passcode, so changing a passcode signs everyone out.

export const PARENT = {
  cookie: 'jt_session',
  secret: 'SITE_PASSCODE',
  label: 'judge-tape-session-v1',
  maxAge: 60 * 60 * 24 * 90,
  loginPath: '/login',
  home: '/',
  caseSensitive: false,
  heading: 'Competition <span>Portal</span>',
  hint: 'The passcode is posted in our BAND.',
  placeholder: 'Passcode',
}

export const ADMIN = {
  cookie: 'ofab_admin',
  secret: 'ADMIN_PASSCODE',
  label: 'ofab-admin-session-v1',
  maxAge: 60 * 60 * 24 * 7,
  loginPath: '/admin/login',
  home: '/admin',
  caseSensitive: true,
  heading: 'Portal <span>Admin</span>',
  hint: 'Band staff only.',
  placeholder: 'Admin password',
}

async function sessionToken(passcode, label) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(passcode), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(label))
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

function safeNext(gate, value) {
  const ok =
    value &&
    value.startsWith(gate.home) &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith(gate.loginPath)
  return ok ? value : gate.home
}

function normalize(gate, value) {
  const trimmed = String(value || '').trim()
  return gate.caseSensitive ? trimmed : trimmed.toLowerCase()
}

export function isConfigured(gate, env) {
  return Boolean(env[gate.secret])
}

export async function hasSession(gate, request, env) {
  const cookie = readCookie(request, gate.cookie)
  if (!cookie || !isConfigured(gate, env)) return false
  return safeEqual(cookie, await sessionToken(env[gate.secret], gate.label))
}

export async function handleLogin(gate, request, env) {
  const url = new URL(request.url)

  if (request.method === 'POST') {
    const form = await request.formData()
    const next = safeNext(gate, form.get('next'))
    if (await safeEqual(normalize(gate, form.get('passcode')), normalize(gate, env[gate.secret]))) {
      const secure = url.protocol === 'https:' ? '; Secure' : ''
      const token = await sessionToken(env[gate.secret], gate.label)
      return new Response(null, {
        status: 303,
        headers: {
          location: next,
          'set-cookie': `${gate.cookie}=${token}; Path=/; Max-Age=${gate.maxAge}; HttpOnly; SameSite=Lax${secure}`,
        },
      })
    }
    return loginPage(gate, next, true)
  }

  return loginPage(gate, safeNext(gate, url.searchParams.get('next')), false)
}

export function redirectToLogin(gate, request) {
  const url = new URL(request.url)
  const next = encodeURIComponent(url.pathname + url.search)
  return Response.redirect(`${url.origin}${gate.loginPath}?next=${next}`, 303)
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function loginPage(gate, next, failed) {
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
  form { box-sizing: border-box; width: min(360px, 92vw); padding: 28px; border-radius: 22px; background: rgba(15,33,24,.82); border: 1px solid rgba(151,176,161,.22); }
  p.eyebrow { margin: 0 0 8px; font-size: .72rem; letter-spacing: .18em; text-transform: uppercase; color: #d7bf53; }
  h1 { margin: 0 0 20px; font-size: 2rem; text-transform: uppercase; letter-spacing: .01em; }
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
<form method="post" action="${gate.loginPath}">
  <p class="eyebrow">OFAB Marching Band</p>
  <h1>${gate.heading}</h1>
  <input type="hidden" name="next" value="${escapeHtml(next)}">
  <input name="passcode" type="password" placeholder="${gate.placeholder}" autocomplete="current-password" autocapitalize="none" autofocus required aria-label="${gate.placeholder}">
  <button type="submit">Enter</button>
  ${failed ? `<p class="error" role="alert">That ${gate.placeholder.toLowerCase()} didn’t work.</p>` : ''}
  <p class="hint">${gate.hint}</p>
</form>
</body>
</html>`
  return new Response(html, {
    status: failed ? 401 : 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
