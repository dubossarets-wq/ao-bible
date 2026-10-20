// Нижняя панель (Bottom Sheet): плавно выезжает снизу, высота меняется перетаскиванием ручки,
// закрывается свайпом вниз, кнопкой, кликом по фону или клавишей Escape.
// На широком экране выглядит как модальное окно у нижнего края (variant="wide" — почти на весь экран).
// variant="page" — отдельная страница во весь экран: выезжает справа, вверху стрелка «назад» (без ручки и крестика).
// initial="full" — окно на всю высоту: свайп вниз за ручку закрывает его, короткий — возвращает наверх.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import { t } from '../core/i18n.js';

const SNAPS = [0.5, 0.7, 0.92]; // первая ступень — половина экрана; вторая — до верхней панели (см. belowBar)

// Нижняя панель вкладок висит поверх окна (капсула над ним) — высота окна считается от всего экрана
const vh = () => window.visualViewport?.height || window.innerHeight;
// Обычное окно открывается до нижнего края верхней панели — она остаётся видна
const belowBar = () => {
  const bottom = document.querySelector('.pane-slot.first .toolbar')?.getBoundingClientRect().bottom;
  return bottom ? Math.min(0.97, Math.max(0.5, 1 - (bottom + 4) / vh())) : 0.86;
};
const snaps = () => [SNAPS[0], belowBar(), SNAPS[2]];

// Подменю «Ещё»: окно выезжает справа поверх «Ещё» (оно остаётся на месте). SheetHost передаёт { back } —
// стрелка ‹ уводит подменю вправо и возвращает в «Ещё»; крестик, свайп вниз и Escape закрывают оба окна.
export const SheetBack = createContext(null);

export default function BottomSheet({ title, subtitle, onClose, onBack, children, initial = 1, variant = 'normal', headerExtra, footer }) {
  const full = initial === 'full';
  // Высота при открытии: на всю высоту (full), почти весь экран (wide), половина (0) или до верхней панели (остальные)
  const pushedInit = useContext(SheetBack);
  // Подменю — той же высоты, что «Ещё» под ним (его могли подтянуть пальцем)
  const parentH = () => parseFloat(document.querySelector('.sheet-layer:not(.pushed) .sheet')?.style.getPropertyValue('--sheet-h')) / 100;
  const [height, setHeight] = useState(() => (pushedInit && parentH() > 0 ? parentH() : full ? 1 : variant === 'wide' ? SNAPS[2] : initial === 0 ? SNAPS[0] : belowBar()));
  const [closing, setClosing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const sheetRef = useRef(null);

  const push = useContext(SheetBack); // { back } — это подменю «Ещё»
  const [leaving, setLeaving] = useState(false);
  const reduceMotion = () => document.documentElement.classList.contains('no-anim') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const close = () => {
    if (closing) return;
    // Подменю: закрываются оба окна — «Ещё» под ним уезжает вниз вместе с ним
    if (push) return window.dispatchEvent(new CustomEvent('aob-sheet-slide-close'));
    setClosing(true);
    setTimeout(onClose, reduceMotion() ? 0 : 200);
  };
  // Стрелка ‹ в подменю: уезжает вправо, под ним — «Ещё»
  const goBack = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(push.back, reduceMotion() ? 0 : 220);
  };

  // Закрытие нажатием на вкладку снизу — с той же анимацией, но без возврата в «Ещё»
  useEffect(() => {
    const slide = () => {
      if (closing) return;
      setClosing(true);
      const reduce = document.documentElement.classList.contains('no-anim') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      setTimeout(onClose, reduce ? 0 : 200);
    };
    window.addEventListener('aob-sheet-slide-close', slide);
    return () => window.removeEventListener('aob-sheet-slide-close', slide);
  });

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


  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    drag.current = { y: e.clientY, h: height, t: Date.now() };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY;
    setHeight(Math.max(0.12, Math.min(full ? 1 : 0.96, drag.current.h + dy / vh())));
  };
  const onPointerUp = (e) => {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY;
    const velocity = dy / Math.max(1, Date.now() - drag.current.t);
    drag.current = null;
    setDragging(false);
    if (height < 0.28 || velocity < -1.2) return close();
    if (full) return height < 0.85 || velocity < -0.5 ? close() : setHeight(1);
    const target = velocity > 1 ? SNAPS[2] : snaps().reduce((a, b) => (Math.abs(b - height) < Math.abs(a - height) ? b : a));
    setHeight(target);
  };

  return (
    <div className={`sheet-layer ${closing ? 'closing' : ''} ${push ? 'pushed' : ''} ${leaving ? 'leaving' : ''}`}>
      {!push && <div className="sheet-backdrop" onClick={close} />}
      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`sheet ${variant} ${dragging ? 'dragging' : ''}`}
        style={{ '--sheet-h': `${(height * 100).toFixed(2)}` }}
      >
        {variant !== 'page' && (
          <div className="sheet-grip" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <span className="grip-bar" />
          </div>
        )}
        <header className="sheet-head">
          {(onBack || push || variant === 'page') && (
            <button className="icon-btn" onClick={onBack || (push ? goBack : close)} aria-label={onBack || push ? t('Назад') : t('Назад к чтению')}>
              <ChevronLeft size={22} />
            </button>
          )}
          <div className="sheet-titles">
            <div className="sheet-title">{title}</div>
            {subtitle && <div className="sheet-sub">{subtitle}</div>}
          </div>
          {headerExtra}
          {variant !== 'page' && (
            <button className="icon-btn" onClick={close} aria-label={t('Закрыть')}>
              <X size={22} />
            </button>
          )}
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
