// Обрезанный текст в одну строку — не многоточием, а плавным затуханием в конце.
// Затухание включается классом .fade-end только у того, что действительно не поместилось
// (иначе у коротких надписей гасли бы последние буквы). Список — те же классы, что в styles.css
// обрезаются в одну строку; добавляя новый, допишите его и сюда.
const CLIPPED = [
  '.tb-module-name', '.tb-ref', '.tb-ref-text', '.tb-place-name', '.sheet-title', '.sheet-sub', '.bc-name', '.dict-desc',
  '.r-word', '.sel-ref', '.wp-dict', '.map-desc', '.mod-name', '.mod-sub', '.place-card-title', '.menu-2-sub',
  '.audio-src', '.gw-meta', '.plan-return-btn', '.pulpit-title', '.tab-label', '.marquee',
].join(',');

let canvas = null;
const textWidth = (el, text) => {
  canvas ||= document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const cs = getComputedStyle(el);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return ctx.measureText(text).width;
};

const INPUTS = '.input-wrap input';

// Поле ввода внутри рамки .input-wrap (у самих полей рамки нет — затухание её не срежет): длинная подсказка или текст
function fitInput(el) {
  const cs = getComputedStyle(el);
  const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const over = el.value ? el.scrollWidth > el.clientWidth + 1 : textWidth(el, el.placeholder || '') > room + 1;
  el.classList.toggle('fade-end', over);
}
const fit = (el) => (el.matches(INPUTS) ? fitInput(el) : el.classList.toggle('fade-end', el.scrollWidth > el.clientWidth + 1));

function checkAll() {
  for (const el of document.querySelectorAll(CLIPPED)) fit(el);
  for (const el of document.querySelectorAll(INPUTS)) fitInput(el);
}

// Проверяем только то, что изменилось: раньше любое изменение страницы (смена стиха в шапке, время в проигрывателе,
// подгрузка главы) запускало поиск по всему документу — на длинной ленте глав до 30–55 мс за раз.
const pending = new Set();
let full = false;
let queued = false;
const flush = () => {
  queued = false;
  if (full) {
    full = false;
    pending.clear();
    return checkAll();
  }
  for (const el of pending) if (el.isConnected) fit(el);
  pending.clear();
};
// После отрисовки кадра (rAF → setTimeout): раскладка к этому моменту готова, замеры дешёвые и не задерживают кадр
const queue = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => setTimeout(flush, 0));
};
const add = (el) => (pending.add(el), queue());
const all = () => ((full = true), queue());

// Текст Библии и стихи проигрывателя: обрезаемых подписей там нет
const SKIP = '.text-col, .ap-lyrics';
function onMutations(list) {
  for (const m of list) {
    const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
    if (!t || t.closest(SKIP)) continue;
    const own = t.closest(CLIPPED);
    if (own) add(own);
    for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches(CLIPPED) || n.matches(INPUTS)) add(n);
      for (const el of n.querySelectorAll(CLIPPED + ',' + INPUTS)) add(el);
    }
  }
}

export function startFadeEnd() {
  if (typeof window === 'undefined' || !window.MutationObserver) return;
  new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', all);
  document.addEventListener('input', (e) => e.target?.matches?.(INPUTS) && add(e.target), true);
  document.fonts?.ready.then(all);
  all();
}
