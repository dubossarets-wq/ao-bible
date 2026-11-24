// Аккаунт Колоса: вход через Google и синхронизация «Моих данных» (закладки, заметки, любимые, выделения, подборки,
// проповеди, планы, настройки) с сервером aobible.app/sync — одно и то же на сайте, iPhone и Android.
//
// Как сходится (так же, как в приложениях): у каждого ключа запоминаем отпечаток значения на момент последней
// синхронизации. Изменилось с тех пор — поменяли здесь, уходит на сервер. Пришло новое с сервера, а здесь не трогали —
// берём серверное. Поменяли и там, и здесь — объединяем: записи списков (закладки, проповеди, планы) и словарей
// (заметки, выделения, настройки) складываются, совпадающие — отсюда. Пришло новое — страница перезагружается,
// чтобы приложение прочитало данные заново. Модули, место чтения и язык не переносятся.
import { P } from './channel.js';
import { SERVICE, snapshot } from './backup.js';

export const SYNC_BASE = 'https://aobible.app/sync';
/** Клиент OAuth Google «веб». Пусто — вход ещё не настроен */
export const GOOGLE_WEB_CLIENT_ID = '';

const K_STATE = P + 'syncState';
// Не переносятся между устройствами: место чтения, язык, запрос поиска; сведения этого устройства (скачанное аудио)
const LOCAL_ONLY = new Set(['panes', 'lang', 'searchQuery', 'syncState', 'backups', 'offlineAudio', 'autoAudio', 'snap']);

const syncable = (k) => !LOCAL_ONLY.has(k) && !SERVICE.has(P + k);

function localData() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(P) && syncable(k.slice(P.length))) out[k.slice(P.length)] = localStorage.getItem(k);
  }
  return out;
}

/** Отпечаток значения (FNV-1a) */
export function fp(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${s.length}:${h.toString(16)}`;
}

// ---- объединение ----

function identity(x) {
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    for (const k of ['id', 'key', 'uid']) if (x[k] != null) return `${k}:${x[k]}`;
    if (x.book != null) return `ref:${x.book}.${x.chapter}.${x.verse}.${x.from ?? ''}.${x.to ?? ''}`;
    if (x.ref && typeof x.ref === 'object') return `ref:${x.ref.book}.${x.ref.chapter}.${x.ref.verse}`;
  }
  return JSON.stringify(x);
}

function merge(l, r) {
  const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (isMap(l) && isMap(r)) {
    const out = { ...r };
    for (const [k, v] of Object.entries(l)) out[k] = k in out ? merge(v, out[k]) : v;
    return out;
  }
  if (Array.isArray(l) && Array.isArray(r)) {
    const seen = new Set();
    return [...l, ...r].filter((x) => {
      const id = identity(x);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  return l;
}

/** Значение, изменённое и здесь, и на другом устройстве: записи складываются, совпадающие — отсюда */
export function mergeValues(local, remote) {
  try {
    return JSON.stringify(merge(JSON.parse(local), JSON.parse(remote)));
  } catch {
    return local;
  }
}

// ---- состояние ----

export function loadState() {
  try {
    return { rev: 0, prints: {}, ...JSON.parse(localStorage.getItem(K_STATE) || '{}') };
  } catch {
    return { rev: 0, prints: {} };
  }
}

function saveState(st) {
  try {
    localStorage.setItem(K_STATE, JSON.stringify(st));
  } catch {
    /* хранилище недоступно */
  }
  listeners.forEach((f) => f(st));
}

const listeners = new Set();
/** Подписка экрана «Мои данные» на состояние входа */
export function onAccount(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}

class SyncError extends Error {}

async function call(method, path, token, body) {
  const r = await fetch(SYNC_BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') throw new SyncError('auth');
  if (!r.ok) throw new SyncError(j.error || String(r.status));
  return j;
}

// ---- синхронизация ----

let running = null;

/** Свести данные. true — данные здесь поменялись (странице нужно перечитать их) */
export function syncNow() {
  const st = loadState();
  if (!st.token) return Promise.resolve(false);
  if (!running) running = run(st).finally(() => (running = null));
  return running;
}

async function run(st) {
  let changed = false;
  listeners.forEach((f) => f({ ...st, busy: true }));
  const applyRemote = (key, remote) => {
    if (!syncable(key)) return;
    const local = localStorage.getItem(P + key);
    const last = st.prints[key];
    const localChanged = local == null ? last != null : fp(local) !== last;
    if (!localChanged) {
      if (remote == null) {
        delete st.prints[key];
        if (local != null) {
          localStorage.removeItem(P + key);
          changed = true;
        }
      } else {
        st.prints[key] = fp(remote);
        if (local !== remote) {
          localStorage.setItem(P + key, remote);
          changed = true;
        }
      }
      return;
    }
    if (remote == null) {
      // там удалили, здесь изменили — изменённое важнее: уйдёт на сервер снова
      delete st.prints[key];
      return;
    }
    if (local == null) {
      // здесь удалили, там изменили — ничего не теряем: берём изменённое
      st.prints[key] = fp(remote);
      localStorage.setItem(P + key, remote);
      changed = true;
      return;
    }
    const merged = mergeValues(local, remote);
    st.prints[key] = fp(remote);
    if (merged !== local) {
      localStorage.setItem(P + key, merged);
      changed = true;
    }
  };
  try {
    let since = st.rev || 0;
    for (;;) {
      const r = await call('GET', `/pull?since=${since}`, st.token);
      for (const it of r.items || []) applyRemote(it.key, it.deleted ? null : it.value);
      since = r.rev ?? since;
      if (!r.more) break;
    }
    st.rev = since;
    for (let round = 0; round < 3; round++) {
      const now = Date.now();
      const local = localData();
      const items = [];
      for (const [k, v] of Object.entries(local)) if (st.prints[k] !== fp(v)) items.push({ key: k, value: v, updated: now });
      for (const k of Object.keys(st.prints)) if (!(k in local) && syncable(k)) items.push({ key: k, deleted: true, updated: now });
      if (!items.length) break;
      let again = false;
      for (let i = 0; i < items.length; i += 200) {
        const part = items.slice(i, i + 200);
        const r = await call('POST', '/push', st.token, { items: part });
        const applied = new Set(r.applied || []);
        for (const it of part) {
          if (!applied.has(it.key)) continue;
          if (it.deleted) delete st.prints[it.key];
          else st.prints[it.key] = fp(it.value);
        }
        for (const it of r.newer || []) {
          applyRemote(it.key, it.deleted ? null : it.value);
          again = true;
        }
      }
      if (!again) break;
    }
    st.lastSync = Date.now();
    st.error = null;
  } catch (e) {
    if (e instanceof SyncError && e.message === 'auth') {
      st.token = null;
      st.error = 'auth';
    } else {
      st.error = e instanceof SyncError ? e.message : 'offline';
    }
  }
  saveState(st);
  return changed;
}

// ---- вход и выход ----

/** Вход по ID-токену Google (из кнопки Google на странице). null — вошли и данные сведены, иначе код ошибки */
export async function signInWithCredential(idToken) {
  try {
    const r = await call('POST', '/login', null, { idToken, device: 'web' });
    // первое объединение с аккаунтом: прежде — копия данных (её можно вернуть в «Версиях приложения»)
    snapshot('перед первой синхронизацией с аккаунтом');
    saveState({ token: r.token, email: r.user?.email, name: r.user?.name, rev: 0, prints: {} });
    if (await syncNow()) location.reload();
    return loadState().error || null;
  } catch (e) {
    return e instanceof SyncError ? e.message : 'offline';
  }
}

/** Выйти здесь: данные остаются и здесь, и в аккаунте */
export async function signOut() {
  const st = loadState();
  if (st.token) await call('POST', '/logout', st.token).catch(() => {});
  try {
    localStorage.removeItem(K_STATE);
  } catch {
    /* хранилище недоступно */
  }
  listeners.forEach((f) => f({ rev: 0, prints: {} }));
}

/** Удалить аккаунт и все его данные на сервере (здесь данные остаются). null — удалено */
export async function deleteAccount() {
  const st = loadState();
  if (!st.token) return null;
  try {
    await call('DELETE', '/account', st.token);
  } catch (e) {
    if (!(e instanceof SyncError && e.message === 'auth')) return e instanceof SyncError ? e.message : 'offline';
  }
  await signOut();
  return null;
}

// ---- когда сводить ----

let reloadOnShow = false;
let lastAuto = 0;

/** Запуск: свести данные (пришло новое — страница перечитывает всё); дальше — при уходе со страницы и возвращении */
export function startAccountSync() {
  document.addEventListener('visibilitychange', () => {
    if (!loadState().token) return;
    if (document.visibilityState === 'hidden') {
      syncNow().then((c) => (reloadOnShow = reloadOnShow || c));
    } else {
      if (reloadOnShow) {
        reloadOnShow = false;
        location.reload();
        return;
      }
      if (Date.now() - lastAuto < 60000) return;
      lastAuto = Date.now();
      syncNow().then((c) => c && location.reload());
    }
  });
  if (!loadState().token) return;
  lastAuto = Date.now();
  syncNow().then((c) => c && location.reload());
}

// ---- кнопка Google ----

let gisLoading = null;

/** Скрипт входа Google (Google Identity Services) — только когда открыт раздел «Аккаунт» */
export function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!gisLoading) {
    gisLoading = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => ok(window.google);
      s.onerror = () => {
        gisLoading = null;
        fail(new Error('gis'));
      };
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}
