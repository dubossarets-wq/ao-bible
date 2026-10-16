// Одна или две независимые панели чтения. Разделитель можно перетаскивать.
// Расположение: на широком экране — рядом, на узком/вертикальном — одна над другой.
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import BibleReader from './BibleReader.jsx';
import { t } from '../core/i18n.js';

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

export default function SplitScreenReader() {
  const { panes, settings, setSettings } = useApp();
  const orientation = useOrientation(settings.splitLayout);
  const split = !!panes[1];
  const [ratio, setRatio] = useState(settings.splitRatio);
  const box = useRef(null);
  const dragging = useRef(false);

  useEffect(() => setRatio(settings.splitRatio), [settings.splitRatio]);

  const onDown = (e) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    document.documentElement.classList.add('resizing');
  };
  const onMove = (e) => {
    if (!dragging.current || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const v = orientation === 'columns' ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
    setRatio(Math.max(0.2, Math.min(0.8, v)));
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    document.documentElement.classList.remove('resizing');
    setSettings({ splitRatio: ratio });
  };
  const onKey = (e) => {
    const d = { ArrowLeft: -0.05, ArrowUp: -0.05, ArrowRight: 0.05, ArrowDown: 0.05 }[e.key];
    if (d) {
      e.preventDefault();
      setSettings({ splitRatio: Math.max(0.2, Math.min(0.8, ratio + d)) });
    }
  };

  return (
    <div ref={box} className={`split ${orientation} ${split ? 'is-split' : ''}`} style={{ '--ratio': split ? ratio : 1 }}>
      <div className="pane-slot first">
        <BibleReader index={0} />
      </div>
      {split && (
        <>
          <div
            className="divider"
            role="separator"
            tabIndex={0}
            aria-orientation={orientation === 'columns' ? 'vertical' : 'horizontal'}
            aria-label={t('Изменить размер панелей')}
            aria-valuenow={Math.round(ratio * 100)}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onKeyDown={onKey}
          >
            <span className="divider-grip" />
          </div>
          <div className="pane-slot second">
            <BibleReader index={1} />
          </div>
        </>
      )}
    </div>
  );
}
