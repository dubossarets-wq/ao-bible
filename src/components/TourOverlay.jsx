// Интерактивная инструкция поверх приложения: экран затемнён, нужное место подсвечено мигающей рамкой.
// Текст шага — облачком со стрелкой прямо у подсвеченного места (под ним или над ним, где есть место),
// кнопки «Назад / Далее» — внизу экрана (наверху, если подсвеченное место внизу).
// Нажимать можно куда угодно — затемнение только подсказывает; нажали подсвеченное — урок идёт дальше,
// «Далее» делает действие за человека.
// Подсветка и облачко следят за местом каждый кадр и плавно переезжают.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useApp } from '../App.jsx';
import { useTour, stopTour, goStep } from '../core/tour.js';
import { TOURS } from './tours.js';

const PAD = 6;
const GAP = 14;
const stop = (e) => e.stopPropagation();
const ease = (from, to, k) => (from == null || Math.abs(to - from) < 0.5 ? to : from + (to - from) * k);

export default function TourOverlay() {
  const t = useTour();
  const app = useApp();
  const tour = TOURS.find((x) => x.id === t.id);
  const step = tour?.steps[t.step];
  const [ctrlTop, setCtrlTop] = useState(false);
  const moving = useRef(false);
  const els = useRef({});
  const cur = useRef(null); // { l, t, r, b, y } — подсветка и облачко сейчас на экране
  const api = {
    openSheet: (kind, payload) => app.openSheet(kind, 0, payload),
    closeSheet: app.closeSheet,
    reset() {
      app.closeSheet();
      app.closePopover();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    },
  };
  const apiRef = useRef(api);
  apiRef.current = api;

  // Какой шаг сейчас на экране — чтобы запоздалое «шаг сделан» не перескочило через следующий шаг
  const stepKey = useRef('');
  stepKey.current = `${t.id}:${t.step}`;
  const advance = (doAction, key = stepKey.current) => {
    if (!step || moving.current || key !== stepKey.current) return;
    moving.current = true;
    if (doAction && step.next && !step.until?.()) step.next(apiRef.current);
    setTimeout(() => {
      moving.current = false;
      if (t.step + 1 >= tour.steps.length) stopTour();
      else goStep(t.step + 1);
    }, doAction && step.next ? 350 : 0);
  };
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  const back = () => t.step > 0 && goStep(t.step - 1);

  // Вход в шаг: в начале урока — чистый экран, затем подготовка шага
  useEffect(() => {
    if (!step) return;
    moving.current = false;
    if (t.step === 0) apiRef.current.reset();
    const tm = setTimeout(() => step.before?.(apiRef.current), t.step === 0 ? 250 : 80);
    return () => clearTimeout(tm);
  }, [t.id, t.step]);

  useEffect(() => {
    if (!step) return;
    const myKey = `${t.id}:${t.step}`;
    const wasDone = !!step.until?.();
    let scrolled = false;
    let raf = 0;
    let frame = 0;
    let top = null;
    const loop = () => {
      frame++;
      const { dt, db, dl, dr, ring, bubble, arrow, ctrl } = els.current;
      if (!dt || !bubble || !ctrl) return (raf = requestAnimationFrame(loop));
      const W = innerWidth;
      const H = innerHeight;
      const el = step.target ? step.target() || document.querySelector('.sheet') : null;
      let goal;
      if (el) {
        const r = el.getBoundingClientRect();
        if (!scrolled && (r.bottom < 60 || r.top > H - 60)) {
          scrolled = true;
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        goal = { l: Math.max(4, r.left - PAD), t: Math.max(4, r.top - PAD), r: Math.min(W - 4, r.right + PAD), b: Math.min(H - 4, r.bottom + PAD) };
      } else {
        goal = { l: W / 2, t: H / 2, r: W / 2, b: H / 2 }; // места нет — затемнён весь экран
      }
      // Кнопки — внизу, а если подсвеченное место в нижней части экрана — наверху
      const wantTop = el ? (goal.t + goal.b) / 2 > H * 0.6 : false;
      if (wantTop !== top) {
        top = wantTop;
        setCtrlTop(wantTop);
      }
      // Облачко с текстом — под местом или над ним, между краем экрана и кнопками
      const cr = ctrl.getBoundingClientRect();
      const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
      const limTop = wantTop ? cr.bottom + 10 : safeTop + 10;
      const limBot = wantTop ? H - 10 : cr.top - 10;
      const bh = bubble.offsetHeight;
      let y;
      let arrowSide = null;
      if (!el) y = (limTop + limBot - bh) / 2;
      else if (limBot - goal.b - GAP >= bh) (y = goal.b + GAP), (arrowSide = 'up');
      else if (goal.t - GAP - limTop >= bh) (y = goal.t - GAP - bh), (arrowSide = 'down');
      else y = goal.t - limTop > limBot - goal.b ? limTop : limBot - bh; // место большое (окно) — облачко у края
      const c = cur.current;
      const k = c ? 0.25 : 1;
      const n = { l: ease(c?.l, goal.l, k), t: ease(c?.t, goal.t, k), r: ease(c?.r, goal.r, k), b: ease(c?.b, goal.b, k), y: ease(c?.y, y, k) };
      cur.current = n;
      // Затемнение вокруг «окошка» и рамка
      dt.style.height = `${n.t}px`;
      db.style.top = `${n.b}px`;
      dl.style.top = dr.style.top = `${n.t}px`;
      dl.style.height = dr.style.height = `${Math.max(0, n.b - n.t)}px`;
      dl.style.width = `${n.l}px`;
      dr.style.left = `${n.r}px`;
      ring.style.transform = `translate(${n.l}px, ${n.t}px)`;
      ring.style.width = `${Math.max(0, n.r - n.l)}px`;
      ring.style.height = `${Math.max(0, n.b - n.t)}px`;
      ring.style.opacity = el ? '1' : '0';
      bubble.style.transform = `translateY(${n.y}px)`;
      // Стрелка облачка смотрит на середину подсвеченного места
      if (arrowSide) {
        const br = bubble.getBoundingClientRect();
        arrow.style.display = 'block';
        arrow.style.left = `${Math.max(18, Math.min(br.width - 30, (n.l + n.r) / 2 - br.left - 6))}px`;
        arrow.className = `tour-arrow ${arrowSide}`;
      } else arrow.style.display = 'none';
      if (frame % 10 === 0 && !wasDone && step.until?.()) return advanceRef.current(false, myKey);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // Человек сам нажал на подсвеченное — шаг сделан
    const onClick = (e) => {
      const el = step.target?.();
      if (step.next && el && el.contains(e.target)) setTimeout(() => advanceRef.current(false, myKey), 350);
    };
    document.addEventListener('click', onClick, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('click', onClick, true);
    };
  }, [t.id, t.step]);

  // Урок закончился — в следующий раз подсветка начнётся с нуля
  useEffect(() => {
    if (!tour) cur.current = null;
  }, [tour]);

  if (!step) return null;
  const last = t.step === tour.steps.length - 1;
  const reg = (k) => (el) => (els.current[k] = el);
  const dim = (k, style) => <div ref={reg(k)} className="tour-dim" style={style} />;

  return createPortal(
    <div className="tour" role="dialog" aria-label={`Инструкция: ${tour.title}`}>
      {dim('dt', { left: 0, top: 0, right: 0 })}
      {dim('db', { left: 0, right: 0, bottom: 0 })}
      {dim('dl', { left: 0 })}
      {dim('dr', { right: 0 })}
      <div ref={reg('ring')} className="tour-ring" style={{ left: 0, top: 0 }} />
      <div ref={reg('bubble')} className="tour-bubble" onPointerDown={stop}>
        <i ref={reg('arrow')} className="tour-arrow" />
        <div className="tour-head">
          {tour.title} · шаг {t.step + 1} из {tour.steps.length}
        </div>
        <p className="tour-text">{step.text}</p>
      </div>
      <div ref={reg('ctrl')} className={`tour-ctrl ${ctrlTop ? 'top' : 'bottom'}`} onPointerDown={stop}>
        <div className="tour-dots" aria-hidden="true">
          {tour.steps.map((_, i) => (
            <i key={i} className={i === t.step ? 'on' : i < t.step ? 'done' : ''} />
          ))}
          <button className="icon-btn tour-close" onClick={() => (apiRef.current.reset(), stopTour())} aria-label="Закончить инструкцию">
            <X size={20} />
          </button>
        </div>
        <div className="tour-btns">
          {t.step > 0 && (
            <button className="btn" onClick={back}>
              <ChevronLeft size={18} /> Назад
            </button>
          )}
          <button className="btn primary" onClick={() => (last ? (apiRef.current.reset(), stopTour()) : advance(true))}>
            {last ? (
              <>
                <Check size={18} /> Понятно
              </>
            ) : (
              <>
                Далее <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
