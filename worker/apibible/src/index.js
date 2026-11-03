// Посредник к API.Bible: ключ хранится здесь секретом (APIBIBLE_KEY), в приложении его нет.
// Пропускает только чтение — список переводов, книги перевода и главу; ответы недолго хранит в кэше Cloudflare,
// чтобы одна и та же глава не тратила общий месячный лимит запросов.

const API = 'https://rest.api.bible/v1';
const ID = '[0-9a-f]{16}-\\d{2}';
const ROUTES = [
  { re: new RegExp('^/bibles$'), ttl: 86400 },
  { re: new RegExp(`^/bibles/${ID}/books$`), ttl: 86400 },
  // глава: «JHN.3», вступление книги «JHN.intro» не отдаём
  { re: new RegExp(`^/bibles/${ID}/chapters/[1-4A-Z]{3}\\.\\d{1,3}$`), ttl: 43200 },
];
// параметры, которые приложение может передать при запросе главы
const PARAMS = ['include-chapters', 'content-type', 'include-notes', 'include-titles', 'include-chapter-numbers', 'include-verse-numbers', 'include-verse-spans'];
const ORIGINS = ['https://aobible.app', 'https://dubossarets-wq.github.io', 'https://localhost', 'capacitor://localhost'];

function cors(origin) {
  const ok = !origin || ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return ok ? { 'access-control-allow-origin': origin || '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '86400', vary: 'Origin' } : null;
}

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('origin');
    const ch = cors(origin);
    if (!ch) return json(403, { error: 'origin' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });
    if (req.method !== 'GET') return json(405, { error: 'method' }, ch);

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/bapi/, '').replace(/^\/v1/, '');
    const route = ROUTES.find((r) => r.re.test(path));
    if (!route) return json(404, { error: 'path' }, ch);

    const q = new URLSearchParams();
    for (const k of PARAMS) if (url.searchParams.has(k)) q.set(k, url.searchParams.get(k));
    if (path.includes('/chapters/')) q.set('fums-version', '3');
    const target = `${API}${path}${q.size ? `?${q}` : ''}`;

    // кэш по адресу без Origin: один ответ на всех
    const cache = caches.default;
    const key = new Request(`https://apibible-cache${path}?${q}`);
    let res = await cache.match(key);
    if (!res) {
      const up = await fetch(target, { headers: { 'api-key': env.APIBIBLE_KEY, accept: 'application/json', 'user-agent': 'AOBible-proxy/1.0' } });
      const body = await up.text();
      res = new Response(body, { status: up.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${route.ttl}` } });
      if (up.ok) ctx.waitUntil(cache.put(key, res.clone()));
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(ch)) out.headers.set(k, v);
    out.headers.set('cache-control', `public, max-age=${Math.min(route.ttl, 3600)}`);
    return out;
  },
};
