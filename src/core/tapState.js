// Повторное нажатие на выделенное слово: выборка закрывается касанием (pointerdown) раньше,
// чем приходит щелчок по слову. Запоминаем, что её закрыли нажатием именно на это слово, —
// тогда щелчок только снимает выделение и не открывает выборку снова.
let closedOn = { el: null, at: 0 };

export function markClosedOnWord(el) {
  closedOn = { el, at: Date.now() };
}

export function wasClosedOnWord(el) {
  const hit = closedOn.el === el && Date.now() - closedOn.at < 1000;
  if (hit) closedOn = { el: null, at: 0 };
  return hit;
}
