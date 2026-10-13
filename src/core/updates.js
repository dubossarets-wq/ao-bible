// Версии установленного приложения (PWA).
//
// На сайте корень — последняя версия, а каждая сборка лежит ещё и в versions/<метка>/ (см. scripts/deploy.mjs).
// Приложение запоминает выбранную версию (aob.activeBuild) и само на новую НЕ переходит: при запуске
// корня с более новой сборкой оно перенаправляет на сохранённую версию. О новой версии сообщает точка на ⋮,
// обновление и откат — вручную, в «Версиях приложения». Включается и автообновление (aob.autoUpdate).
import { useCallback, useEffect, useState } from 'react';

export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';
export const IS_PWA_BUILD = typeof __PWA__ !== 'undefined' && __PWA__;

const K_ACTIVE = 'aob.activeBuild';
// Новый ключ: автообновление включено у всех по умолчанию, прежний выбор «выкл» не переносится
const K_AUTO = 'aob.autoUpdate2';
const K_KNOWN = 'aob.knownBuilds';
const K_HOPS = 'aob.versionHops';

const ls = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* без хранилища версия не закрепляется */
    }
  },
};

// Корень сайта: у архивных версий <base href="../../"> указывает на него
export const appRoot = () => new URL('./', document.baseURI).href;
export const isArchivedPage = () => location.pathname.includes('/versions/');
export const autoUpdateEnabled = () => ls.get(K_AUTO) !== '0';
export const setAutoUpdate = (on) => ls.set(K_AUTO, on ? '1' : '0');
export const activeBuild = () => ls.get(K_ACTIVE) || BUILD;

function knownBuilds() {
  try {
    return JSON.parse(ls.get(K_KNOWN) || '[]');
  } catch {
    return [];
  }
}

// Вызывается до отрисовки. Возвращает true, если идёт переход на другую версию (рисовать не нужно).
export function bootVersionGate() {
  if (!IS_PWA_BUILD) return false;
  const active = ls.get(K_ACTIVE);
  if (!active) {
    ls.set(K_ACTIVE, BUILD);
    return false;
  }
  if (active === BUILD) {
    sessionStorage.removeItem(K_HOPS);
    return false;
  }
  // Корень с новой сборкой и включённым автообновлением — просто принимаем её
  if (!isArchivedPage() && autoUpdateEnabled()) {
    ls.set(K_ACTIVE, BUILD);
    return false;
  }
  if (isArchivedPage() && autoUpdateEnabled()) {
    ls.set(K_ACTIVE, '');
    location.replace(new URL(`./?v=${Date.now().toString(36)}`, appRoot()).href);
    return true;
  }
  // Защита от зацикливания и от перехода на версию, которой нет в архиве
  const hops = +(sessionStorage.getItem(K_HOPS) || 0);
  if (hops > 2 || !knownBuilds().includes(active)) {
    ls.set(K_ACTIVE, BUILD);
    sessionStorage.removeItem(K_HOPS);
    return false;
  }
  sessionStorage.setItem(K_HOPS, String(hops + 1));
  location.replace(new URL(`versions/${active}/`, appRoot()).href);
  return true;
}

async function fetchJson(name) {
  const res = await fetch(new URL(`${name}?t=${Date.now()}`, appRoot()), { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchVersions() {
  const data = await fetchJson('versions.json');
  const list = Array.isArray(data.versions) ? data.versions : [];
  ls.set(K_KNOWN, JSON.stringify(list.map((v) => v.build)));
  // minBuild — экстренное обновление: версии ниже обновляются принудительно, даже без автообновления
  return { versions: list, latest: data.latest || list[0]?.build, minBuild: data.minBuild || null };
}

export function useUpdates() {
  const [state, setState] = useState({ available: false, checking: false, latest: null, error: null, forced: false });

  const check = useCallback(async () => {
    if (!IS_PWA_BUILD) return false;
    setState((s) => ({ ...s, checking: true, error: null }));
    try {
      const { latest, minBuild } = await fetchVersions();
      const available = !!latest && latest !== BUILD && latest > BUILD;
      const forced = !!minBuild && BUILD < minBuild && available;
      setState({ available, checking: false, latest, error: null, forced, auto: autoUpdateEnabled() });
      return available;
    } catch {
      setState((s) => ({ ...s, checking: false, error: 'Нет связи с сервером' }));
      return false;
    }
  }, []);

  useEffect(() => {
    if (!IS_PWA_BUILD) return;
    check();
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const t = setInterval(check, 5 * 60 * 1000); // раз в 5 минут
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(t);
    };
  }, [check]);

  return { ...state, check };
}

// Перейти на версию: закрепляем её и открываем (последняя — из корня, остальные — из архива).
// Модули, закладки и настройки общие для всех версий (IndexedDB и localStorage того же сайта).
export async function switchToVersion(build, latest) {
  ls.set(K_ACTIVE, build);
  // Откат на старую версию выключает автообновление — иначе приложение сразу вернуло бы последнюю
  if (build !== latest) setAutoUpdate(false);
  sessionStorage.removeItem(K_HOPS);
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    /* без service worker просто переходим */
  }
  const url = new URL(build === latest ? './' : `versions/${build}/`, appRoot());
  url.searchParams.set('v', Date.now().toString(36));
  location.replace(url.href);
}

// «Обновить приложение» = перейти на последнюю версию
export async function applyUpdate() {
  const { latest } = await fetchVersions();
  return switchToVersion(latest, latest);
}

// Дата сборки из метки «20261013-181500» (UTC) → «13 окт. 2026, 21:15» по времени устройства
export function buildDate(build, iso) {
  let d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) {
    const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})?$/.exec(build || '');
    d = m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))) : null;
  }
  return d && !isNaN(d) ? d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : build;
}
