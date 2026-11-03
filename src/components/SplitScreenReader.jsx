// Одна или несколько (до MAX_PANES) независимых панелей чтения. Разделители можно перетаскивать.
// Расположение: на широком экране — рядом, на узком/вертикальном — одна над другой.
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import BibleReader from './BibleReader.jsx';
import { t } from '../core/i18n.js';
import { setDriver } from '../core/scrollSync.js';

function useOrientation(pref) {
  const calc = () => {
    if (pref === 'rows' || pref === 'columns') return pref;
    const w = window.innerWidth;
    const h = window.visualViewport?.height || window.innerHeight;
    return w >= 720 && w > h * 0.9 ? 'columns' : 'rows';
  };
  const [o, setO] = useState(calc);
  useEffect(() => {
    const on = () => setO(calc());
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [pref]);
  return o;
}

// Доли панелей: при двух — сохранённая splitRatio, при трёх и больше — поровну (каждая новая раскладка — поровну)
const equal = (n, ratio) => (n === 2 ? [ratio, 1 - ratio] : Array.from({ length: n }, () => 1 / n));
const MIN = 0.12; // меньше этой доли панель не сжимается

export default function SplitScreenReader() {
  const { panes, settings, setSettings } = useApp();
  const orientation = useOrientation(settings.splitLayout);
  const list = panes.filter(Boolean);
  const n = list.length;
  const split = n > 1;
  const [sizes, setSizes] = useState(() => equal(n, settings.splitRatio));
  const box = useRef(null);
  const dragging = useRef(null); // индекс разделителя, который тянут

  // Число панелей изменилось — доли заново поровну (две — по сохранённой доле)
  useEffect(() => setSizes(equal(n, settings.splitRatio)), [n, settings.splitRatio]);

  const onDown = (i) => (e) => {
    dragging.current = i;
    // пока тянется разделитель, высота панелей меняется — синхронная прокрутка молчит (ведущей панели нет),
    // иначе вторая панель прыгала бы вслед за первой; ведущей снова станет та, которой коснутся
    setDriver(null);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    document.documentElement.classList.add('resizing');
  };
  // Разделитель i — между панелями i и i+1: меняются только их доли
  const moveTo = (i, pos) =>
    setSizes((sz) => {
      const before = sz.slice(0, i).reduce((a, b) => a + b, 0);
      const pair = sz[i] + sz[i + 1];
      const a = Math.max(MIN, Math.min(pair - MIN, pos - before));
      const next = [...sz];
      next[i] = a;
      next[i + 1] = pair - a;
      return next;
    });
  const onMove = (e) => {
    const i = dragging.current;
    if (i == null || !box.current) return;
    const r = box.current.getBoundingClientRect();
    moveTo(i, orientation === 'columns' ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height);
  };
  const onUp = () => {
    if (dragging.current == null) return;
    dragging.current = null;
    document.documentElement.classList.remove('resizing');
    if (n === 2) setSettings({ splitRatio: sizes[0] });
  };
  const onKey = (i) => (e) => {
    setDriver(null);
    const d = { ArrowLeft: -0.05, ArrowUp: -0.05, ArrowRight: 0.05, ArrowDown: 0.05 }[e.key];
    if (!d) return;
    e.preventDefault();
    const pos = sizes.slice(0, i + 1).reduce((a, b) => a + b, 0) + d;
    moveTo(i, pos);
    if (n === 2) setSettings({ splitRatio: Math.max(0.2, Math.min(0.8, pos)) });
  };

  return (
    <div ref={box} className={`split ${orientation} ${split ? 'is-split' : ''} ${n > 2 ? 'many' : ''}`} style={{ '--ratio': split ? sizes[0] : 1 }}>
      {list.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <div
              className="divider"
              role="separator"
              tabIndex={0}
              aria-orientation={orientation === 'columns' ? 'vertical' : 'horizontal'}
              aria-label={t('Изменить размер панелей')}
              aria-valuenow={Math.round(sizes.slice(0, i).reduce((a, b) => a + b, 0) * 100)}
              onPointerDown={onDown(i - 1)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onKeyDown={onKey(i - 1)}
            >
              <span className="divider-grip" />
            </div>
          )}
          {/* first / second — у второй и следующих одни правила оформления (шапка без отступа под вырез экрана) */}
          <div className={`pane-slot ${i === 0 ? 'first' : 'second'} p${i}`} style={split ? { flex: `${sizes[i] ?? 1 / n} 1 0` } : undefined}>
            <BibleReader index={i} />
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
