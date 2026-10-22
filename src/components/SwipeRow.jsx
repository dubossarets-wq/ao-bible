// Строка, которую можно смахнуть влево, как на iPhone: из-под неё выезжает красная кнопка «Удалить».
// Отпустили на полпути — кнопка остаётся открытой (или строка возвращается, если потянули чуть-чуть);
// протянули дальше середины строки — удаление сразу (full). Открыта всегда только одна строка;
// нажатие мимо закрывает её. Мышью тоже можно тянуть. Свайп — не единственный способ: у строк остаются свои кнопки.
// Направление решаем по первым ~10 px: вертикальное движение — обычная прокрутка (touch-action: pan-y),
// вправо по закрытой строке — жест окна («назад», соседняя вкладка), влево — наш.
import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { swallowNextClick } from './ui.jsx';
import { t } from '../core/i18n.js';

const ACT = 88; // ширина открытой кнопки, px
let openRow = null; // { el, close } — открытая сейчас строка (одна на всё приложение)
export const closeSwipeRows = () => openRow?.close();

export default function SwipeRow({ as: Tag = 'li', className = '', innerClassName = '', onDelete, label, actionText, full = true, disabled = false, children, ...rest }) {
  const row = useRef(null);
  const content = useRef(null);
  const st = useRef(null);
  const x = useRef(0);
  const dragged = useRef(false);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [gone, setGone] = useState(false);

  const place = (v, anim) => {
    x.current = v;
    const el = content.current;
    if (!el) return;
    el.style.transition = anim ? '' : 'none';
    el.style.transform = v ? `translateX(${v}px)` : '';
    row.current?.style.setProperty('--swipe-w', `${Math.max(0, -v)}px`);
    row.current?.classList.toggle('swipe-anim', !!anim);
  };
  const close = () => {
    place(0, true);
    setOpen(false);
    setArmed(false);
    if (openRow?.el === row.current) openRow = null;
  };
  const openUp = () => {
    if (openRow && openRow.el !== row.current) openRow.close();
    place(-ACT, true);
    setOpen(true);
    setArmed(false);
    openRow = { el: row.current, close };
  };
  const remove = () => {
    if (openRow?.el === row.current) openRow = null;
    const el = row.current;
    // Строка уезжает влево и складывается, потом удаляется на самом деле
    place(-(el?.offsetWidth || 400), true);
    setGone(true);
    if (el) {
      el.style.height = `${el.offsetHeight}px`;
      void el.offsetHeight;
      requestAnimationFrame(() => (el.style.height = '0px'));
    }
    navigator.vibrate?.(10);
    setTimeout(() => {
      onDelete?.();
      // Если строку не убрали (удаление не удалось) — возвращаем как была
      setTimeout(() => {
        if (!row.current?.isConnected) return;
        row.current.style.height = '';
        setGone(false);
        setOpen(false);
        setArmed(false);
        place(0, false);
      }, 60);
    }, 220);
  };

  // Нажатие мимо открытой строки закрывает её — и только закрывает (как на iPhone)
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const r = row.current;
      if (r?.querySelector('.swipe-act')?.contains(e.target)) return;
      // Закрывают свайпом вправо по самой строке — окно не должно принять это за «назад»
      if (r?.contains(e.target)) {
        r.setAttribute('data-swiped', '');
        const clear = () => setTimeout(() => r.removeAttribute('data-swiped'), 80);
        document.addEventListener('pointerup', clear, { once: true, capture: true });
      }
      close();
      swallowNextClick();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);
  useEffect(() => () => openRow?.el === row.current && (openRow = null), []);

  const down = (e) => {
    if (disabled || (e.button !== undefined && e.button > 0)) return;
    st.current = { x: e.clientX, y: e.clientY, id: e.pointerId, base: x.current, mode: null, t: Date.now(), lastX: e.clientX, lastT: Date.now(), v: 0 };
  };
  const move = (e) => {
    const s = st.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.mode) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      // Вертикально — прокрутка; вправо по закрытой строке — не наш жест; блок перетаскивают — тоже
      if (Math.abs(dy) >= Math.abs(dx) || (dx > 0 && s.base === 0) || row.current?.closest('.dragging')) return void (st.current = null);
      s.mode = 'h';
      s.x = e.clientX; // без рывка на первые 10 px
      content.current?.setPointerCapture?.(s.id);
      if (openRow && openRow.el !== row.current) openRow.close();
      row.current?.setAttribute('data-swiped', '');
      return;
    }
    e.preventDefault();
    const now = Date.now();
    s.v = (e.clientX - s.lastX) / Math.max(1, now - s.lastT);
    s.lastX = e.clientX;
    s.lastT = now;
    const w = row.current?.offsetWidth || 360;
    let v = s.base + (e.clientX - s.x);
    if (v > 0) v = 0;
    if (!full && -v > ACT) v = -(ACT + (-v - ACT) / 4); // без «удалить сразу» — дальше кнопки тянется туго
    v = Math.max(v, -w);
    place(v, false);
    const arm = full && -v > w * 0.55;
    if (arm !== armed) {
      setArmed(arm);
      if (arm) navigator.vibrate?.(8);
    }
  };
  const up = () => {
    const s = st.current;
    st.current = null;
    if (!s || s.mode !== 'h') return;
    dragged.current = true;
    setTimeout(() => (dragged.current = false), 350);
    // Окно (BottomSheet) смотрит на этот признак и не листает вкладки этим жестом
    setTimeout(() => row.current?.removeAttribute('data-swiped'), 80);
    const w = row.current?.offsetWidth || 360;
    if (full && -x.current > w * 0.55) return remove();
    if (s.v < -0.5 || (-x.current > ACT / 2 && s.v <= 0.3)) openUp();
    else close();
  };

  return (
    <Tag ref={row} className={`swipe-row ${open ? 'open' : ''} ${armed ? 'armed' : ''} ${gone ? 'gone' : ''} ${className}`} {...rest}>
      <div className="swipe-act" aria-hidden={!open}>
        <button type="button" tabIndex={open ? 0 : -1} aria-label={label || t('Удалить')} onClick={remove}>
          <Trash2 size={18} aria-hidden="true" />
          <span>{actionText || t('Удалить')}</span>
        </button>
      </div>
      <div
        ref={content}
        className={`swipe-content ${innerClassName}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => {
          // После свайпа щелчок не должен открывать строку
          if (!dragged.current && !open) return;
          e.preventDefault();
          e.stopPropagation();
          if (open && !dragged.current) close();
        }}
      >
        {children}
      </div>
    </Tag>
  );
}
