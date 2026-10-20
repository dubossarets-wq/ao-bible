// Нажатие на слово при открытой выборке: выборка закрывается касанием (pointerdown) раньше,
// чем приходит щелчок по слову. Запоминаем, что её закрыли нажатием именно на это слово, —
// тогда щелчок только снимает выделение и не открывает выборку снова.
let closedOn = { el: null, at: 0 };

// Слово узнаём и по месту (стих + номер слова): после закрытия выборки стих может перерисоваться
const wordKey = (el) => { const v = el.closest?.('[data-v]'); return `${v?.id || v?.dataset.v || ''}:${el.dataset?.i ?? ''}`; };

export function markClosedOnWord(el) {
  closedOn = { el, key: wordKey(el), at: Date.now() };
}

export function wasClosedOnWord(el) {
  const hit = (closedOn.el === el || (closedOn.key && closedOn.key === wordKey(el))) && Date.now() - closedOn.at < 1000;
  if (hit) closedOn = { el: null, at: 0 };
  return hit;
}

// Двойное нажатие на стих (два нажатия на один стих быстрее 350 мс) — в любимые
export const DOUBLE_TAP_MS = 350;
let lastTap = { key: null, at: 0 };
export function isDoubleTap(key) {
  const now = Date.now();
  const hit = lastTap.key === key && now - lastTap.at < DOUBLE_TAP_MS;
  lastTap = hit ? { key: null, at: 0 } : { key, at: now };
  return hit;
}

// Короткая вспышка на стихе, который только что стал любимым
export function pulseFavorite(verseEl) {
  window.getSelection?.()?.removeAllRanges();
  if (!verseEl) return;
  verseEl.classList.remove('fav-pulse');
  void verseEl.offsetWidth;
  verseEl.classList.add('fav-pulse');
  setTimeout(() => verseEl.classList.remove('fav-pulse'), 800);
}
