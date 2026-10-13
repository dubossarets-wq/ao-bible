// Текущий стих панели «в реальном времени» — отдельно от состояния приложения.
// При прокрутке меняется только это хранилище: перерисовываются лишь надпись «Нав. 14:15»
// и полоса прогресса, а не всё приложение. В историю и сохранение позиция уходит позже, когда прокрутка стихла.
import { useCallback, useSyncExternalStore } from 'react';

const state = new Map(); // индекс панели -> { book, chapter, verse }
const subs = new Map(); // индекс панели -> Set(callback)

export function setLivePosition(pane, ref) {
  const cur = state.get(pane);
  if (cur && cur.book === ref.book && cur.chapter === ref.chapter && cur.verse === ref.verse) return;
  state.set(pane, { book: ref.book, chapter: ref.chapter, verse: ref.verse });
  subs.get(pane)?.forEach((fn) => fn());
}

export function clearLivePosition(pane) {
  if (!state.has(pane)) return;
  state.delete(pane);
  subs.get(pane)?.forEach((fn) => fn());
}

export function useLivePosition(pane, fallback) {
  const subscribe = useCallback(
    (fn) => {
      if (!subs.has(pane)) subs.set(pane, new Set());
      subs.get(pane).add(fn);
      return () => subs.get(pane)?.delete(fn);
    },
    [pane]
  );
  return useSyncExternalStore(subscribe, () => state.get(pane) || fallback);
}
