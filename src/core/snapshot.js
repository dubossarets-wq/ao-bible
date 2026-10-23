// Мгновенный запуск: когда приложение уходит в фон или закрывается, запоминаем, как выглядел экран
// (только видимые главы, без окон и меню). При следующем запуске маленький скрипт в index.html
// (SNAP_LOADER в scripts/build.mjs) показывает этот снимок в первые миллисекунды — ещё до загрузки кода,
// а когда настоящая глава нарисована, снимок убирается. Снимок не нажимается и привязан к версии сборки.
import { BUILD } from './updates.js';
import { P } from './channel.js';

const KEY = P + 'snap';
const MARGIN = 300; // px сверху и снизу от экрана — главы, которые оставляем

function capture() {
  const root = document.getElementById('root');
  if (!root || !root.querySelector('.verse') || document.getElementById('snap')) return null;
  const clone = root.cloneNode(true);
  // Окна, меню, подсказки, выделение — после запуска их не будет
  clone.querySelectorAll('.sheet-layer, .sheet, .menu, .toast, .toasts, .word-pop, .popover, .selection-bar, .tour, .audio-bar, .sel-inline, dialog').forEach((n) => n.remove());
  // Ленты глав: только главы у экрана, прокрутка пересчитана
  const live = [...root.querySelectorAll('.text-scroller')];
  const copies = [...clone.querySelectorAll('.text-scroller')];
  const scroll = [];
  const anchor = []; // верхний стих каждой ленты: при запуске его ставим к краю (шрифты могут ещё грузиться)
  let panes = [];
  try {
    panes = JSON.parse(localStorage.getItem(P + 'panes') || '[]') || [];
  } catch {
    /* нет сохранённых панелей */
  }
  live.forEach((el, i) => {
    const copy = copies[i];
    if (!copy) return;
    // При запуске приложение открывает сохранённое место панели (стих к краю, 8 px) — снимок сразу там же, без скачка
    const ref = panes[el.closest('.pane-slot')?.classList.contains('second') ? 1 : 0]?.ref;
    const v =
      (ref && el.querySelector(`.verse[data-c="${ref.chapter}"][data-v="${ref.verse}"]`)) ||
      [...el.querySelectorAll('.verse')].find((x) => x.offsetTop + x.offsetHeight > el.scrollTop + 12);
    const top = v ? Math.max(0, v.offsetTop - 8) : el.scrollTop;
    const bottom = top + el.clientHeight;
    const chapters = [...el.querySelectorAll('.chapter')];
    const cut = [...copy.querySelectorAll('.chapter')];
    let removedAbove = 0;
    chapters.forEach((ch, k) => {
      const a = ch.offsetTop;
      const b = a + ch.offsetHeight;
      if (b < top - MARGIN || a > bottom + MARGIN) {
        if (b < top - MARGIN) removedAbove += ch.offsetHeight;
        cut[k]?.remove();
      }
    });
    scroll.push(Math.max(0, Math.round(top - removedAbove)));
    anchor.push(v ? [v.dataset.c, v.dataset.v] : null);
  });
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  return { b: BUILD, cls: document.documentElement.className, style: document.documentElement.getAttribute('style') || '', html: clone.innerHTML, scroll, anchor };
}

function save() {
  try {
    const s = capture();
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    try {
      localStorage.removeItem(KEY); // места нет — без снимка, данные человека важнее
    } catch {
      /* хранилище недоступно */
    }
  }
}

export function installSnapshot() {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save());
  window.addEventListener('pagehide', save);
  // Снимок показан — убираем, как только настоящий экран нарисовал стихи (чтение, план — всё равно)
  const root = document.getElementById('root');
  if (!document.getElementById('snap') || !root) return;
  const mo = new MutationObserver(() => {
    if (!root.querySelector('.verse')) return;
    mo.disconnect();
    requestAnimationFrame(() => requestAnimationFrame(dropSnapshot));
  });
  mo.observe(root, { childList: true, subtree: true });
}

// Настоящая глава нарисована (или показывать нечего) — убираем снимок
export function dropSnapshot() {
  const el = document.getElementById('snap');
  if (!el) return;
  el.remove();
  document.documentElement.classList.remove('snap-on');
}
