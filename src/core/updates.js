// Проверка новой версии установленного приложения (PWA).
// Сборка кладёт рядом version.json с меткой сборки; приложение сравнивает её со своей (__BUILD__)
// при запуске, при возврате на экран и раз в 30 минут. Установленное приложение на iPhone
// не перезагружается само при повторном открытии, поэтому обновление — по кнопке в меню.
import { useCallback, useEffect, useState } from 'react';

export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';
export const IS_PWA_BUILD = typeof __PWA__ !== 'undefined' && __PWA__;

async function fetchRemoteBuild() {
  const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).build;
}

export function useUpdates() {
  const [state, setState] = useState({ available: false, checking: false, remote: null, error: null });

  const check = useCallback(async () => {
    if (!IS_PWA_BUILD) return false;
    setState((s) => ({ ...s, checking: true, error: null }));
    try {
      const remote = await fetchRemoteBuild();
      const available = !!remote && remote !== BUILD;
      setState({ available, checking: false, remote, error: null });
      return available;
    } catch (e) {
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
    const t = setInterval(check, 30 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(t);
    };
  }, [check]);

  return { ...state, check };
}

// Применить обновление: обновить service worker, очистить кэш оболочки и перезагрузить.
// Модули и закладки не трогаем — они в IndexedDB и localStorage.
export async function applyUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    /* без service worker просто перезагружаемся */
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('aob-')).map((k) => caches.delete(k)));
  } catch {
    /* Cache API недоступен */
  }
  const url = new URL(location.href);
  url.searchParams.set('v', Date.now().toString(36));
  location.replace(url.toString());
}
