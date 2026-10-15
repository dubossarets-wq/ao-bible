// Небольшие пользовательские данные (настройки, закладки, история) — в localStorage.
// Все обращения обёрнуты: в приватном режиме хранилище может бросать исключения.
import { useEffect, useState, useCallback, useRef } from 'react';
import { P } from './channel.js';

const PREFIX = P; // 'aob.' у основного приложения, 'aobs.' у тестового

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
// migrate — необязательное преобразование сохранённого значения старого формата.
export function usePersistentState(key, initial, migrate) {
  const [value, setValue] = useState(() => {
    const stored = load(key, undefined);
    const base = typeof initial === 'function' ? initial() : initial;
    if (stored === undefined) return base;
    return migrate ? migrate(stored) : stored;
  });
  const timer = useRef(null);
  const first = useRef(true);
  useEffect(() => {
    // При запуске не перезаписываем то, что только что прочитали: иначе изменение, сделанное за эти
    // мгновения (другой вкладкой, восстановлением копии), затиралось бы прежним значением
    if (first.current) {
      first.current = false;
      return;
    }
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
