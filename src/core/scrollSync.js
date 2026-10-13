// Синхронная прокрутка двух панелей: панель, которую прокручивает пользователь («ведущая»),
// сообщает текущий стих и долю его высоты; вторая панель встаёт на тот же стих.
// Ведущей становится панель, которой коснулись (палец, мышь, колесо), — так программная прокрутка
// второй панели не отражается обратно.
const listeners = new Map(); // индекс панели -> callback({ ref, frac })
let driver = null;

export function setDriver(pane) {
  driver = pane;
}

export function isDriver(pane) {
  return driver === pane;
}

export function onSync(pane, fn) {
  listeners.set(pane, fn);
  return () => listeners.get(pane) === fn && listeners.delete(pane);
}

export function emitSync(from, payload) {
  for (const [pane, fn] of listeners) if (pane !== from) fn(payload);
}
