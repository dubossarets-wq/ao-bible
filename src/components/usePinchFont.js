// Размер шрифта двумя пальцами: развести — крупнее, свести — мельче.
// Во время жеста размер меняется сразу через CSS-переменную (без перерисовки приложения), стих под пальцами
// остаётся на месте; когда пальцы отпустили — размер сохраняется в настройках.
import { useEffect } from 'react';
import { useApp } from '../App.jsx';

export const FONT_MIN = 13;
export const FONT_MAX = 40;

export function usePinchFont(scroller) {
  const { settings, setSettings } = useApp();
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let g = null; // { d, fs, cur, anchor, top, badge }
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e) => {
      if (e.touches.length !== 2) return;
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const anchor = document.elementFromPoint(mx, my)?.closest('.verse') || el.querySelector('.verse');
      const badge = document.createElement('div');
      badge.className = 'pinch-badge';
      badge.textContent = `${settings.fontSize} px`;
      document.body.appendChild(badge);
      g = { d: dist(e.touches), fs: settings.fontSize, cur: settings.fontSize, anchor, top: anchor?.getBoundingClientRect().top ?? 0, badge };
    };
    const onMove = (e) => {
      if (!g || e.touches.length !== 2) return;
      e.preventDefault();
      const fs = Math.round(Math.max(FONT_MIN, Math.min(FONT_MAX, g.fs * (dist(e.touches) / g.d))));
      if (fs === g.cur) return;
      g.cur = fs;
      document.documentElement.style.setProperty('--fs', `${fs}px`);
      g.badge.textContent = `${fs} px`;
      if (g.anchor) el.scrollTop += g.anchor.getBoundingClientRect().top - g.top;
    };
    const onEnd = (e) => {
      if (!g || e.touches.length >= 2) return;
      const { cur, fs, badge } = g;
      g = null;
      setTimeout(() => badge.remove(), 500);
      badge.classList.add('out');
      if (cur !== fs) setSettings({ fontSize: cur });
    };
    // Safari: свой жест увеличения страницы — глушим, размер меняем сами
    const noGesture = (e) => e.preventDefault();
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    el.addEventListener('gesturestart', noGesture);
    el.addEventListener('gesturechange', noGesture);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('gesturestart', noGesture);
      el.removeEventListener('gesturechange', noGesture);
      g?.badge.remove();
    };
  }, [settings.fontSize]);
}
