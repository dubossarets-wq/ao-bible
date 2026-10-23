// Две панели с синхронной прокруткой на телефоне: прокрутку пальцем ведём сами (свайп и инерция после броска).
// Обычную прокрутку браузер двигает в отдельном потоке, а вторая панель узнаёт о ней кадром позже — на телефоне
// это заметное отставание. Здесь обе панели сдвигаются в одном и том же кадре: после каждого сдвига ведущей
// сразу вызывается emit (она сообщает свой стих, и вторая встаёт на него).
// Нажатия, долгое нажатие, свайп между главами и щипок не трогаем: короткие и горизонтальные жесты пропускаем.
import { useEffect, useRef } from 'react';

const DECAY = 0.9975; // затухание инерции за 1 мс (между Android и iPhone: бросок уезжает далеко и плавно гаснет)
const MAX_V = 6; // px/мс

export function useSyncTouchScroll(ref, enabled, emit) {
  // Функцию берём через ref: перерисовка главы не должна снимать слушатели и обрывать инерцию
  const emitRef = useRef(emit);
  emitRef.current = emit;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    el.classList.add('js-scroll'); // touch-action: none — браузер сам не прокручивает
    let g = null; // текущий жест
    let raf = 0;
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

    const onStart = (e) => {
      if (e.touches.length !== 1) return void (g = null); // щипок — не наш жест
      const t = e.touches[0];
      // Касание во время инерции только останавливает её (как в системной прокрутке) — без нажатия на слово
      if (stopMomentum()) {
        swallowClick = true;
        setTimeout(() => (swallowClick = false), 500);
      }
      g = { x0: t.clientX, y0: t.clientY, y: t.clientY, dir: 0, samples: [[performance.now(), t.clientY]] };
    };
    const onMove = (e) => {
      if (!g || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!g.dir) {
        const dx = t.clientX - g.x0;
        const dy = t.clientY - g.y0;
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        g.dir = Math.abs(dy) >= Math.abs(dx) ? 1 : -1; // -1 — горизонтальный (свайп глав), не прокручиваем
        g.y = t.clientY;
      }
      if (g.dir !== 1) return;
      scrollBy(g.y - t.clientY);
      g.y = t.clientY;
      const now = performance.now();
      g.samples.push([now, t.clientY]);
      while (g.samples.length > 2 && now - g.samples[0][0] > 100) g.samples.shift();
    };
    const onEnd = () => {
      if (!g || g.dir !== 1) return void (g = null);
      const [t0, y0] = g.samples[0];
      const [t1, y1] = g.samples[g.samples.length - 1];
      g = null;
      const dt = t1 - t0;
      if (dt <= 0 || performance.now() - t1 > 80) return; // палец остановился перед отпусканием — без инерции
      let v = Math.max(-MAX_V, Math.min(MAX_V, (y0 - y1) / dt));
      if (Math.abs(v) < 0.08) return;
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
      el.classList.remove('js-scroll');
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('click', onClick, true);
    };
  }, [ref, enabled]);
}
