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

function check() {
  for (const el of document.querySelectorAll(CLIPPED)) el.classList.toggle('fade-end', el.scrollWidth > el.clientWidth + 1);
  // Поля ввода внутри рамки .input-wrap (у самих полей рамки нет — затухание её не срежет): длинная подсказка или текст
  for (const el of document.querySelectorAll('.input-wrap input')) {
    const cs = getComputedStyle(el);
    const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const over = el.value ? el.scrollWidth > el.clientWidth + 1 : textWidth(el, el.placeholder || '') > room + 1;
    el.classList.toggle('fade-end', over);
  }
}

let queued = false;
const schedule = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    check();
  });
};

export function startFadeEnd() {
  if (typeof window === 'undefined' || !window.MutationObserver) return;
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', schedule);
  document.addEventListener('input', schedule, true);
  document.fonts?.ready.then(schedule);
  schedule();
}
