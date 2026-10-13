// Небольшие пользовательские данные (настройки, закладки, история) — в localStorage.
// Все обращения обёрнуты: в приватном режиме хранилище может бросать исключения.
import { useEffect, useState, useCallback, useRef } from 'react';

const PREFIX = 'aob.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* хранилище недоступно — работаем без сохранения */
  }
}

// Состояние, которое переживает перезагрузку. Запись откладывается, чтобы не писать на каждый скролл.
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    const stored = load(key, undefined);
    const base = typeof initial === 'function' ? initial() : initial;
    return stored === undefined ? base : stored;
  });
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(key, value), 250);
    return () => clearTimeout(timer.current);
  }, [key, value]);
  return [value, setValue];
}

export function useLatest(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useEvent(fn) {
  const ref = useLatest(fn);
  return useCallback((...args) => ref.current(...args), [ref]);
}
