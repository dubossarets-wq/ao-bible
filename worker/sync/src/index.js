// Аккаунт Колоса: «Мои данные» человека (закладки, заметки, выделения, проповеди, планы, история, настройки)
// хранятся на сервере и сходятся между его устройствами (iPhone, Android, веб).
//
// Вход — через Google: устройство присылает ID-токен Google, сервер проверяет его подпись и выдаёт свой ключ входа
// (на сервере хранится только его хэш). Паролей нет.
//
// Данные — те же ключи, что в файле «Мои данные» (формат aob-userdata): ключ → строка JSON. У каждого ключа —
// время изменения на устройстве (updated) и номер изменения на сервере (rev). Устройство:
//   pull ?since=<rev> — забрать всё новее своего rev;
//   push — отправить свои изменения; более новое на сервере не затирается — оно возвращается в newer, и устройство
//          объединяет (закладки и заметки — по отдельным записям) и отправляет снова.
//
// Адреса (https://aobible.app/sync/...):
//   POST   /sync/login    {idToken, device?}          → {token, user, rev}
//   GET    /sync/me                                    → {user, rev, keys, bytes}
//   GET    /sync/pull?since=N                          → {rev, items:[{key,value,updated,deleted,rev}], more}
//   POST   /sync/push     {items:[{key,value,updated,deleted}]} → {rev, applied:[key], newer:[item]}
//   POST   /sync/logout                                → {ok}
//   DELETE /sync/account                               → {ok}  (удаляет аккаунт и все его данные)

const ORIGINS = ['https://aobible.app', 'https://dubossarets-wq.github.io', 'https://localhost', 'capacitor://localhost'];
const MAX_KEY = 200;
const MAX_VALUE = 4 * 1024 * 1024; // одна запись (проповеди со вставками бывают большими)
const MAX_ITEMS = 500; // за один push
const MAX_TOTAL = 40 * 1024 * 1024; // всё у одного человека
const PAGE = 300; // записей за один pull

function cors(origin) {
  const ok = !origin || ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!ok) return null;
  return {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

// ---- Google: проверка ID-токена ----

let jwks = null;
let jwksUntil = 0;

async function googleKeys() {
  if (jwks && Date.now() < jwksUntil) return jwks;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('jwks');
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  jwksUntil = Date.now() + (m ? Number(m[1]) * 1000 : 3600000);
  jwks = (await r.json()).keys;
  return jwks;
}

function b64urlBytes(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

/** Подпись, издатель, получатель (наши клиенты Google) и срок токена; возвращает содержимое токена */
async function verifyGoogle(token, audiences) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('token');
  const header = b64urlJson(parts[0]);
  const payload = b64urlJson(parts[1]);
  if (header.alg !== 'RS256') throw new Error('alg');
  let key = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!key) {
    jwksUntil = 0; // ключи Google сменились — перечитать
    key = (await googleKeys()).find((k) => k.kid === header.kid);
  }
  if (!key) throw new Error('kid');
  const ck = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', ck, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('signature');
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') throw new Error('iss');
  if (!audiences.includes(payload.aud)) throw new Error('aud');
  if (!payload.exp || payload.exp * 1000 < Date.now() - 60000) throw new Error('exp');
  if (!payload.sub) throw new Error('sub');
  return payload;
}

// ---- ключи входа ----

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Кто пришёл: по ключу входа из заголовка Authorization: Bearer … */
async function sessionUser(req, env) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '');
  if (!m) return null;
  const hash = await sha256(m[1]);
  const s = await env.DB.prepare('SELECT user, used FROM sessions WHERE hash = ?').bind(hash).first();
  if (!s) return null;
  // отметка «пользовались» — не чаще раза в сутки
  if (Date.now() - s.used > 86400000) await env.DB.prepare('UPDATE sessions SET used = ? WHERE hash = ?').bind(Date.now(), hash).run();
  return { id: s.user, hash };
}

// ---- обработчики ----

async function login(req, env) {
  const body = await req.json().catch(() => ({}));
  let who;
  if (env.ALLOW_TEST_LOGIN === '1' && typeof body.test === 'string' && body.test) {
    // только при проверке на этом компьютере (wrangler dev): в выложенном сервере переменной нет
    who = { sub: `test:${body.test}`, email: `${body.test}@test`, name: body.test };
  } else {
    const auds = String(env.GOOGLE_CLIENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!auds.length) return json(503, { error: 'not-configured' });
    try {
      who = await verifyGoogle(body.idToken, auds);
    } catch (e) {
      return json(401, { error: 'google', reason: String(e.message || e) });
    }
  }
  const now = Date.now();
  const id = `g:${who.sub}`.replace(/^g:test:/, 'test:');
  await env.DB.prepare(
    'INSERT INTO users (id, email, name, created, rev) VALUES (?, ?, ?, ?, 0) ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name',
  ).bind(id, who.email || null, who.name || null, now).run();
  const token = newToken();
  const device = typeof body.device === 'string' ? body.device.slice(0, 80) : null;
  await env.DB.prepare('INSERT INTO sessions (hash, user, device, created, used) VALUES (?, ?, ?, ?, ?)').bind(await sha256(token), id, device, now, now).run();
  const u = await env.DB.prepare('SELECT email, name, rev FROM users WHERE id = ?').bind(id).first();
  return json(200, { token, user: { email: u.email, name: u.name }, rev: u.rev });
}

async function me(user, env) {
  const u = await env.DB.prepare('SELECT email, name, rev FROM users WHERE id = ?').bind(user.id).first();
  if (!u) return json(401, { error: 'auth' });
  const st = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(value)), 0) AS bytes FROM items WHERE user = ? AND deleted = 0').bind(user.id).first();
  return json(200, { user: { email: u.email, name: u.name }, rev: u.rev, keys: st.n, bytes: st.bytes });
}

async function pull(url, user, env) {
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
  const u = await env.DB.prepare('SELECT rev FROM users WHERE id = ?').bind(user.id).first();
  if (!u) return json(401, { error: 'auth' });
  const rows = await env.DB.prepare('SELECT key, value, updated, deleted, rev FROM items WHERE user = ? AND rev > ? ORDER BY rev LIMIT ?')
    .bind(user.id, since, PAGE + 1).all();
  const list = rows.results || [];
  const more = list.length > PAGE;
  const items = list.slice(0, PAGE).map((r) => ({ key: r.key, value: r.deleted ? null : r.value, updated: r.updated, deleted: !!r.deleted, rev: r.rev }));
  // ещё есть — устройство спросит снова с rev последней записи; нет — rev сервера
  return json(200, { rev: more ? items[items.length - 1].rev : u.rev, items, more });
}

async function push(req, user, env) {
  const body = await req.json().catch(() => null);
  const incoming = Array.isArray(body?.items) ? body.items : null;
  if (!incoming) return json(400, { error: 'items' });
  if (incoming.length > MAX_ITEMS) return json(413, { error: 'too-many' });
  const clean = [];
  for (const it of incoming) {
    if (typeof it?.key !== 'string' || !it.key || it.key.length > MAX_KEY) return json(400, { error: 'key' });
    const deleted = !!it.deleted;
    const value = deleted ? null : typeof it.value === 'string' ? it.value : null;
    if (!deleted && value === null) return json(400, { error: 'value', key: it.key });
    if (value && value.length > MAX_VALUE) return json(413, { error: 'value-size', key: it.key });
    const updated = Number(it.updated);
    if (!Number.isFinite(updated) || updated <= 0) return json(400, { error: 'updated', key: it.key });
    // время устройства не дальше суток вперёд (сбитые часы не должны «застолбить» запись навсегда)
    clean.push({ key: it.key, value, deleted, updated: Math.min(Math.round(updated), Date.now() + 86400000) });
  }
  if (!clean.length) {
    const u = await env.DB.prepare('SELECT rev FROM users WHERE id = ?').bind(user.id).first();
    return json(200, { rev: u?.rev ?? 0, applied: [], newer: [] });
  }

  // что уже лежит на сервере по этим ключам
  const existing = new Map();
  for (let i = 0; i < clean.length; i += 90) {
    const part = clean.slice(i, i + 90);
    const rows = await env.DB.prepare(`SELECT key, value, updated, deleted, rev FROM items WHERE user = ? AND key IN (${part.map(() => '?').join(',')})`)
      .bind(user.id, ...part.map((x) => x.key)).all();
    for (const r of rows.results || []) existing.set(r.key, r);
  }
  const apply = [];
  const newer = [];
  for (const it of clean) {
    const ex = existing.get(it.key);
    if (!ex || it.updated > ex.updated) {
      apply.push(it);
    } else if (it.updated < ex.updated || (it.updated === ex.updated && (ex.value !== it.value || !!ex.deleted !== it.deleted))) {
      // на сервере новее (или в то же мгновение, но другое) — пусть устройство объединит
      newer.push({ key: ex.key, value: ex.deleted ? null : ex.value, updated: ex.updated, deleted: !!ex.deleted, rev: ex.rev });
    }
  }
  if (apply.length) {
    // место: всё у человека — не больше MAX_TOTAL
    const st = await env.DB.prepare('SELECT COALESCE(SUM(LENGTH(value)), 0) AS bytes FROM items WHERE user = ?').bind(user.id).first();
    let total = st.bytes;
    for (const it of apply) total += (it.value?.length || 0) - (existing.get(it.key)?.value?.length || 0);
    if (total > MAX_TOTAL) return json(413, { error: 'quota', bytes: total });
  }
  let rev;
  if (apply.length) {
    // номера изменений — подряд и только этому push (два устройства одновременно не получат одинаковых)
    const r = await env.DB.prepare('UPDATE users SET rev = rev + ? WHERE id = ? RETURNING rev').bind(apply.length, user.id).first();
    if (!r) return json(401, { error: 'auth' });
    rev = r.rev;
    const base = rev - apply.length;
    const stmts = apply.map((it, i) =>
      env.DB.prepare(
        `INSERT INTO items (user, key, value, updated, deleted, rev) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user, key) DO UPDATE SET value = excluded.value, updated = excluded.updated, deleted = excluded.deleted, rev = excluded.rev
         WHERE excluded.updated > items.updated`,
      ).bind(user.id, it.key, it.value, it.updated, it.deleted ? 1 : 0, base + i + 1),
    );
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  } else {
    rev = (await env.DB.prepare('SELECT rev FROM users WHERE id = ?').bind(user.id).first())?.rev ?? 0;
  }
  return json(200, { rev, applied: apply.map((x) => x.key), newer });
}

async function logout(user, env) {
  await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(user.hash).run();
  return json(200, { ok: true });
}

async function removeAccount(user, env) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM items WHERE user = ?').bind(user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user = ?').bind(user.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  return json(200, { ok: true });
}

export default {
  async fetch(req, env) {
    const ch = cors(req.headers.get('origin'));
    if (!ch) return json(403, { error: 'origin' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/sync/, '') || '/';
    const send = (r) => {
      for (const [k, v] of Object.entries(ch)) r.headers.set(k, v);
      return r;
    };
    try {
      if (path === '/login' && req.method === 'POST') return send(await login(req, env));
      const user = await sessionUser(req, env);
      if (!user) return send(json(401, { error: 'auth' }));
      if (path === '/me' && req.method === 'GET') return send(await me(user, env));
      if (path === '/pull' && req.method === 'GET') return send(await pull(url, user, env));
      if (path === '/push' && req.method === 'POST') return send(await push(req, user, env));
      if (path === '/logout' && req.method === 'POST') return send(await logout(user, env));
      if (path === '/account' && req.method === 'DELETE') return send(await removeAccount(user, env));
      return send(json(404, { error: 'path' }));
    } catch (e) {
      return send(json(500, { error: 'server', reason: String(e?.message || e) }));
    }
  },
};
