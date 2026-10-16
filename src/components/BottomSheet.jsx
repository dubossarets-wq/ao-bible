// Нижняя панель (Bottom Sheet): плавно выезжает снизу, высота меняется перетаскиванием ручки,
// закрывается свайпом вниз, кнопкой, кликом по фону или клавишей Escape.
// На широком экране выглядит как модальное окно у нижнего края (variant="wide" — почти на весь экран).
import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import { t } from '../core/i18n.js';

const SNAPS = [0.5, 0.7, 0.92]; // первая ступень — половина экрана

export default function BottomSheet({ title, subtitle, onClose, onBack, children, initial = 1, variant = 'normal', headerExtra, footer }) {
  const [height, setHeight] = useState(variant === 'wide' ? SNAPS[2] : SNAPS[initial]);
  const [closing, setClosing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const sheetRef = useRef(null);

  const close = () => {
    if (closing) return;
    setClosing(true);
    const reduce = document.documentElement.classList.contains('no-anim') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setTimeout(onClose, reduce ? 0 : 200);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    sheetRef.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const vh = () => window.visualViewport?.height || window.innerHeight;

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    drag.current = { y: e.clientY, h: height, t: Date.now() };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY;
    setHeight(Math.max(0.12, Math.min(0.96, drag.current.h + dy / vh())));
  };
  const onPointerUp = (e) => {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY;
    const velocity = dy / Math.max(1, Date.now() - drag.current.t);
    drag.current = null;
    setDragging(false);
    if (height < 0.28 || velocity < -1.2) return close();
    const target = velocity > 1 ? SNAPS[2] : SNAPS.reduce((a, b) => (Math.abs(b - height) < Math.abs(a - height) ? b : a));
    setHeight(target);
  };

  return (
    <div className={`sheet-layer ${closing ? 'closing' : ''}`}>
      <div className="sheet-backdrop" onClick={close} />
      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`sheet ${variant} ${dragging ? 'dragging' : ''}`}
        style={{ '--sheet-h': `${Math.round(height * 100)}` }}
      >
        <div className="sheet-grip" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <span className="grip-bar" />
        </div>
        <header className="sheet-head">
          {onBack && (
            <button className="icon-btn" onClick={onBack} aria-label={t('Назад')}>
              <ChevronLeft size={22} />
            </button>
          )}
          <div className="sheet-titles">
            <div className="sheet-title">{title}</div>
            {subtitle && <div className="sheet-sub">{subtitle}</div>}
          </div>
          {headerExtra}
          <button className="icon-btn" onClick={close} aria-label={t('Закрыть')}>
            <X size={22} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
