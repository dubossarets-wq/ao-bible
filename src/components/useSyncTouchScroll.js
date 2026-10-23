// Две панели с синхронной прокруткой на телефоне: прокрутку пальцем ведём сами (свайп и инерция после броска).
// Обычную прокрутку браузер двигает в отдельном потоке, а вторая панель узнаёт о ней кадром позже — на телефоне
// это заметное отставание. Здесь обе панели сдвигаются в одном и том же кадре: после каждого сдвига ведущей
// сразу вызывается emit (она сообщает свой стих, и вторая встаёт на него).
// Нажатия, долгое нажатие, свайп между главами и щипок не трогаем: короткие и горизонтальные жесты пропускаем.
// События касания приходят не в такт с кадрами экрана (на iPhone — то два за кадр, то ни одного), поэтому палец
// не двигает текст напрямую: раз в кадр берём его положение на момент кадра (между соседними событиями) — текст
// едет ровно, как при системной прокрутке. Когда движение закончилось, вызывается idle.
import { useEffect, useRef } from 'react';

const DECAY = 0.9975; // затухание инерции за 1 мс (между Android и iPhone: бросок уезжает далеко и плавно гаснет)
const MAX_V = 6; // px/мс
const LAG = 8; // мс: положение пальца берём чуть в прошлом — почти всегда между двумя событиями, без угадывания
const AHEAD = 12; // мс: если событие запоздало — продолжаем движение по скорости пальца, но не дальше этого

export function useSyncTouchScroll(ref, enabled, emit, idle) {
  // Функции берём через ref: перерисовка главы не должна снимать слушатели и обрывать инерцию
  const emitRef = useRef(emit);
  emitRef.current = emit;
  const idleRef = useRef(idle);
  idleRef.current = idle;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    el.classList.add('js-scroll'); // touch-action: none — браузер сам не прокручивает
    let g = null; // текущий жест
    let raf = 0;
    let dragRaf = 0;
    let swallowClick = false;

    const stopMomentum = () => {
      if (raf) cancelAnimationFrame(raf);
      const was = !!raf;
      raf = 0;
      return was;
    };
    const scrollBy = (dy) => {
      const before = el.scrollTop;
      el.scrollTop = before + dy;
      emitRef.current();
      return el.scrollTop !== before;
    };
    const stopDrag = () => {
      if (dragRaf) cancelAnimationFrame(dragRaf);
      dragRaf = 0;
    };
    // Время события — в тех же единицах, что performance.now(); если браузер дал иное — время получения
    const stamp = (e) => {
      const now = performance.now();
      return e.timeStamp > now - 1000 && e.timeStamp <= now + 5 ? e.timeStamp : now;
    };
    // Где был палец в момент t: между двумя событиями — по прямой, после последнего — по его скорости (недалеко)
    const fingerAt = (t) => {
      const sm = g.samples;
      const last = sm[sm.length - 1];
      if (t >= last[0]) {
        const prev = sm.length > 1 ? sm[sm.length - 2] : last;
        const dt = last[0] - prev[0];
        const v = dt > 0 ? (last[1] - prev[1]) / dt : 0;
        return last[1] + v * Math.min(t - last[0], AHEAD);
      }
      for (let i = sm.length - 1; i > 0; i--) {
        const [t0, y0] = sm[i - 1];
        if (t >= t0) {
          const [t1, y1] = sm[i];
          return y0 + ((y1 - y0) * (t - t0)) / Math.max(1, t1 - t0);
        }
      }
      return sm[0][1];
    };
    const dragFrame = () => {
      dragRaf = 0;
      if (!g || g.dir !== 1) return;
      // Время кадра rAF бывает раньше последнего события — берём текущее
      const y = fingerAt(performance.now() - LAG);
      if (y !== g.y) {
        scrollBy(g.y - y);
        g.y = y;
      }
      dragRaf = requestAnimationFrame(dragFrame);
    };

    const onStart = (e) => {
      if (e.touches.length !== 1) return void (g = null); // щипок — не наш жест
      const t = e.touches[0];
      // Касание во время инерции только останавливает её (как в системной прокрутке) — без нажатия на слово
      if (stopMomentum()) {
        swallowClick = true;
        setTimeout(() => (swallowClick = false), 500);
      }
      stopDrag();
      g = { x0: t.clientX, y0: t.clientY, y: t.clientY, dir: 0, samples: [[stamp(e), t.clientY]] };
    };
    const onMove = (e) => {
      if (!g || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!g.dir) {
        const dx = t.clientX - g.x0;
        const dy = t.clientY - g.y0;
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        g.dir = Math.abs(dy) >= Math.abs(dx) ? 1 : -1; // -1 — горизонтальный (свайп глав), не прокручиваем
        if (g.dir === 1) {
          // текст поедет от этой точки — без скачка на порог в 8 px
          g.y = t.clientY;
          g.samples = [];
          dragRaf = requestAnimationFrame(dragFrame);
        }
      }
      if (g.dir !== 1) return;
      const now = stamp(e);
      const sm = g.samples;
      if (sm.length && now <= sm[sm.length - 1][0]) sm[sm.length - 1][1] = t.clientY; // два события с одним временем
      else sm.push([now, t.clientY]);
      while (sm.length > 2 && now - sm[0][0] > 100) sm.shift();
    };
    const onEnd = (e) => {
      stopDrag();
      if (!g || g.dir !== 1) return void (g = null);
      const sm = g.samples;
      const [t0, y0] = sm[0];
      const [t1, y1] = sm[sm.length - 1];
      g = null;
      const dt = t1 - t0;
      const done = () => idleRef.current?.();
      // палец остановился перед отпусканием — без инерции (оба времени — моменты касаний, а не их обработки:
      // на занятом телефоне событие обрабатывается позже, и бросок не должен считаться остановкой)
      if (dt <= 0 || stamp(e) - t1 > 80) return done();
      let v = Math.max(-MAX_V, Math.min(MAX_V, (y0 - y1) / dt));
      if (Math.abs(v) < 0.08) return done();
      let last = performance.now();
      const step = (now) => {
        // Время кадра rAF бывает чуть раньше момента отпускания — такой кадр считаем обычным (~16 мс),
        // иначе сдвиг выходил нулевым и инерция гасла сразу
        let ms = now - last;
        last = now;
        if (!(ms > 0)) ms = 16;
        ms = Math.min(48, ms);
        const dy = v * ms;
        const before = el.scrollTop;
        scrollBy(dy);
        const atEdge = Math.abs(dy) >= 1 && el.scrollTop === before; // упёрлись в начало или конец текста
        v *= DECAY ** ms;
        raf = !atEdge && Math.abs(v) > 0.02 ? requestAnimationFrame(step) : 0;
        if (!raf) done();
      };
      raf = requestAnimationFrame(step);
    };
    const onClick = (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    el.addEventListener('click', onClick, true);
    return () => {
      stopMomentum();
      stopDrag();
      el.classList.remove('js-scroll');
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('click', onClick, true);
    };
  }, [ref, enabled]);
}
