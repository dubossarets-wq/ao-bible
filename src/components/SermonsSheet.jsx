// Проповеди: список, редактор (стихи и свой текст по порядку, ↑↓ — переставить) и «Кафедра» —
// крупный текст проповеди для чтения на служении, экран при этом не гаснет.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Plus, Presentation, Share2, ScrollText, X, Minus, Type, Copy, GripVertical } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { ConfirmButton, Empty } from './ui.jsx';
import { parseHumanRef } from '../core/books.js';
import { getVerse } from '../core/modules.js';
import { plainText } from '../core/verseMarkup.js';
import { useSermons, createSermon, deleteSermon, renameSermon, addVerses, addTextBlock, updateBlock, removeBlock, moveBlock, blockRef, blockRefFull, sermonText } from '../core/sermons.js';
import { load, save } from '../core/storage.js';
import { t, fmtDate as fmtD } from '../core/i18n.js';

// «1 место», «2 места», «5 мест»
export const places = (n) => t('{n} место|{n} места|{n} мест', { n });
const fmtDate = (d) => (d ? fmtD(d, { day: 'numeric', month: 'long', year: 'numeric' }) : '');

// Поле текста, которое растёт по мере набора
function AutoText({ value, onChange, placeholder, autoFocus }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} className="sermon-text-input" rows={1} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} />;
}

// «Кафедра»: проповедь крупно, во весь экран, экран не гаснет
function Pulpit({ sermon, onClose }) {
  const [size, setSize] = useState(() => load('pulpitSize', 26));
  useEffect(() => save('pulpitSize', size), [size]);
  // Размер букв двумя пальцами: развести — крупнее, свести — мельче
  const body = useRef(null);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    let g = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const start = (e) => {
      if (e.touches.length === 2) g = { d: dist(e.touches), s: Number(el.style.fontSize.replace('px', '')) || 26 };
    };
    const move = (e) => {
      if (!g || e.touches.length !== 2) return;
      e.preventDefault();
      setSize(Math.round(Math.max(18, Math.min(60, g.s * (dist(e.touches) / g.d)))));
    };
    const end = (e) => e.touches.length < 2 && (g = null);
    const noZoom = (e) => e.preventDefault();
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('gesturestart', noZoom);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
      el.removeEventListener('gesturestart', noZoom);
    };
  }, []);
  useEffect(() => {
    let lock = null;
    let alive = true;
    const req = async () => {
      try {
        const l = await navigator.wakeLock?.request('screen');
        if (!alive) l?.release?.();
        else lock = l;
      } catch {
        /* браузер не умеет держать экран — просто читаем */
      }
    };
    req();
    const onVis = () => document.visibilityState === 'visible' && req();
    document.addEventListener('visibilitychange', onVis);
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      lock?.release?.();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return createPortal(
    <div className="pulpit" role="dialog" aria-label={t('Кафедра: {title}', { title: sermon.title })}>
      <div className="pulpit-bar">
        <button className="icon-btn" onClick={() => setSize((v) => Math.max(18, v - 2))} aria-label={t('Мельче')}>
          <Minus size={20} />
        </button>
        <Type size={18} aria-hidden="true" />
        <button className="icon-btn" onClick={() => setSize((v) => Math.min(60, v + 2))} aria-label={t('Крупнее')}>
          <Plus size={20} />
        </button>
        <span className="pulpit-title">{sermon.title}</span>
        <button className="icon-btn" onClick={onClose} aria-label={t('Закрыть кафедру')}>
          <X size={22} />
        </button>
      </div>
      <div className="pulpit-body" ref={body} lang="ru" style={{ fontSize: `${size}px` }}>
        <h1>{sermon.title}</h1>
        {sermon.date && <div className="pulpit-date">{fmtDate(sermon.date)}</div>}
        {sermon.blocks.map((b) =>
          b.type === 'verse' ? (
            <blockquote key={b.id} className="pulpit-verse">
              <cite>{blockRefFull(b)}</cite>
              {b.text}
            </blockquote>
          ) : b.text.trim() ? (
            <div key={b.id} className="pulpit-text">
              {b.text}
            </div>
          ) : null
        )}
        <div className="pulpit-end">{t('Аминь')}</div>
      </div>
    </div>,
    document.body
  );
}

function Editor({ sermon, pane, moduleId, onBackToList }) {
  const { navigate, closeSheet, toast } = useApp();
  const [pulpit, setPulpit] = useState(false);
  const [ref, setRef] = useState('');
  const [refErr, setRefErr] = useState('');
  const [fresh, setFresh] = useState(null); // только что добавленный текстовый блок — сразу в него курсор

  const addByRef = async (e) => {
    e.preventDefault();
    const r = parseHumanRef(ref);
    if (!r) return setRefErr(t('Не понял ссылку. Пример: «Ин 3:16» или «Пс 22:1-4».'));
    // «Ин 3» — вся глава; «Ин 3:16-18» — стихи; «Ин 3:16–4:2» — через главу
    const wholeChapter = !/\d\s*[:.,]\s*\d|\d\s+\d/.test(ref.replace(/^\s*\d\s*/, ''));
    const endCh = r.end?.chapter || r.chapter;
    const endV = r.end?.verse || r.verseEnd || (wholeChapter ? 999 : r.verse);
    const items = [];
    for (let c = r.chapter; c <= endCh && items.length < 400; c++) {
      for (let v = c === r.chapter ? r.verse : 1; c < endCh || v <= endV; v++) {
        const vt = await getVerse(moduleId, { book: r.book, chapter: c, verse: v });
        if (vt == null) break;
        items.push({ book: r.book, chapter: c, verse: v, text: plainText(vt) });
      }
    }
    if (!items.length) return setRefErr(t('Такого места нет в выбранном переводе.'));
    addVerses(sermon.id, items, moduleId);
    setRef('');
    setRefErr('');
  };
  const share = async () => {
    const text = sermonText(sermon);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: sermon.title, text });
      else {
        await navigator.clipboard.writeText(text);
        toast(t('Текст проповеди скопирован'));
      }
    } catch {
      /* отменили «Поделиться» */
    }
  };
  const verses = sermon.blocks.filter((b) => b.type === 'verse').length;

  // Перетаскивание: зажать блок (стих или текст) на полсекунды — он «поднимается» и едет за пальцем,
  // остальные расступаются. Движение раньше времени — это прокрутка, не перетаскивание.
  const list = useRef(null);
  const drag = useRef(null);
  const scrollBox = () => list.current?.closest('.sheet-body');
  const dragDown = (e) => {
    if (e.button > 0 || e.target.closest('textarea, input, button')) return;
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const d = { id: li.dataset.id, li, x: e.clientX, y: e.clientY, pid: e.pointerId, on: false };
    d.timer = setTimeout(() => {
      d.on = true;
      d.startY = d.y;
      d.scroll0 = scrollBox()?.scrollTop || 0;
      li.setPointerCapture?.(d.pid);
      li.classList.add('dragging');
      navigator.vibrate?.(12);
    }, 420);
    drag.current = d;
  };
  const dragMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) {
        clearTimeout(d.timer);
        drag.current = null;
      }
      return;
    }
    e.preventDefault();
    // У краёв окна — прокручиваем
    const box = scrollBox();
    if (box) {
      const r = box.getBoundingClientRect();
      if (e.clientY < r.top + 60) box.scrollTop -= 10;
      else if (e.clientY > r.bottom - 60) box.scrollTop += 10;
    }
    const scrolled = (box?.scrollTop || 0) - d.scroll0;
    let dy = e.clientY - d.startY + scrolled;
    const items = [...list.current.children];
    const idx = items.indexOf(d.li);
    const gap = 10;
    const next = items[idx + 1];
    const prev = items[idx - 1];
    if (next && dy > next.offsetHeight / 2 + gap / 2) {
      moveBlock(sermon.id, idx, 1);
      d.startY += next.offsetHeight + gap;
      dy -= next.offsetHeight + gap;
    } else if (prev && dy < -(prev.offsetHeight / 2 + gap / 2)) {
      moveBlock(sermon.id, idx, -1);
      d.startY -= prev.offsetHeight + gap;
      dy += prev.offsetHeight + gap;
    }
    d.li.style.transform = `translateY(${dy}px)`;
  };
  const dragEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    clearTimeout(d.timer);
    if (!d.on) return;
    d.li.classList.remove('dragging');
    d.li.style.transform = '';
  };
  // Пока блок перетаскивают, страница под пальцем не должна прокручиваться
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const stop = (e) => drag.current?.on && e.preventDefault();
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  return (
    <>
      <div className="sermon-head">
        <input className="sermon-title-input" value={sermon.title} onChange={(e) => renameSermon(sermon.id, e.target.value)} aria-label={t('Название проповеди')} placeholder={t('Название проповеди')} />
        <div className="sermon-actions">
          <button className="btn primary" onClick={() => setPulpit(true)} disabled={!sermon.blocks.length}>
            <Presentation size={17} /> {t('Кафедра')}
          </button>
          <button className="btn" onClick={share} disabled={!sermon.blocks.length}>
            {navigator.share ? <Share2 size={17} /> : <Copy size={17} />} {t('Поделиться')}
          </button>
        </div>
      </div>

      {!sermon.blocks.length && (
        <div className="sermon-hint">
          <p>
            <strong>{t('Как добавить стих:')}</strong> {t('в тексте Библии зажмите стих пальцем — он выделится — и нажмите под ним «В проповедь». Или введите ссылку ниже.')}
          </p>
          <p>
            <strong>{t('Свой текст')}</strong> {t('— кнопка «Текст»: вступление, пояснения, примеры, вывод. Порядок меняется перетаскиванием: зажмите стих или текст и ведите.')}
          </p>
        </div>
      )}

      <ol className="sermon-blocks" ref={list} onPointerDown={dragDown} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
        {sermon.blocks.map((b, i) => (
          <li key={b.id} data-id={b.id} className={`sermon-block ${b.type}`}>
            {b.type === 'verse' ? (
              <>
                <button
                  className="sermon-ref"
                  onClick={() => {
                    closeSheet();
                    navigate(pane, { book: b.book, chapter: b.chapter, verse: b.verse });
                  }}
                  title={t('Открыть в Библии')}
                >
                  {blockRef(b)}
                </button>
                <p className="sermon-verse-text">{b.text}</p>
              </>
            ) : (
              <AutoText value={b.text} onChange={(text) => updateBlock(sermon.id, b.id, { text })} placeholder={t('Ваш текст: мысль, пояснение, пример…')} autoFocus={fresh === b.id} />
            )}
            <div className="sermon-block-tools">
              <span className="sermon-grip" title={t('Зажмите, чтобы перетащить')} aria-hidden="true">
                <GripVertical size={17} />
              </span>
              <button className="link-btn sermon-add-after" onClick={() => setFresh(addTextBlock(sermon.id, i - 1))}>
                {t('+ текст выше')}
              </button>
              <button className="link-btn sermon-add-after" onClick={() => setFresh(addTextBlock(sermon.id, i))}>
                {t('+ текст ниже')}
              </button>
              <span className="sermon-tools-gap" />
              <ConfirmButton className="icon-btn subtle" confirmText={t('Удалить')} onConfirm={() => removeBlock(sermon.id, b.id)} aria-label={b.type === 'verse' ? t('Удалить стих из проповеди') : t('Удалить текст')}>
                <Trash2 size={16} />
              </ConfirmButton>
            </div>
          </li>
        ))}
      </ol>

      <div className="sermon-add">
        <button className="btn" onClick={() => setFresh(addTextBlock(sermon.id))}>
          <Plus size={17} /> {t('Текст')}
        </button>
        <form className="ref-form" onSubmit={addByRef}>
          <input value={ref} onChange={(e) => (setRef(e.target.value), setRefErr(''))} placeholder={t('Стих по ссылке: Ин 3:16')} aria-label={t('Добавить стих по ссылке')} autoComplete="off" enterKeyHint="done" />
          <button className="btn" type="submit" disabled={!ref.trim()}>
            <Plus size={17} /> {t('Стих')}
          </button>
        </form>
        {refErr && <p className="error-text small">{refErr}</p>}
      </div>
      <p className="sermon-foot">
        {t('{n} место Писания|{n} места Писания|{n} мест Писания', { n: verses })} · {t('сохраняется само')}
        <ConfirmButton
          className="link-btn danger"
          confirmText={t('Удалить проповедь?')}
          onConfirm={() => {
            deleteSermon(sermon.id);
            onBackToList();
          }}
        >
          {t('удалить проповедь')}
        </ConfirmButton>
      </p>
      {pulpit && <Pulpit sermon={sermon} onClose={() => setPulpit(false)} />}
    </>
  );
}

export default function SermonsSheet({ pane, payload, onClose }) {
  const { panes, bibles } = useApp();
  const sermons = useSermons();
  const [openId, setOpenId] = useState(payload.open || null);
  const [title, setTitle] = useState('');
  const sermon = sermons.find((s) => s.id === openId);
  const moduleId = (panes[pane]?.moduleId && bibles.find((b) => b.id === panes[pane].moduleId)?.id) || bibles[0]?.id;

  const create = (e) => {
    e.preventDefault();
    setOpenId(createSermon(title));
    setTitle('');
  };

  return (
    <BottomSheet title={sermon ? t('Проповедь') : t('Проповеди')} onClose={onClose} onBack={sermon && !(payload.open && openId === payload.open) ? () => setOpenId(null) : null} variant="page">
      {sermon ? (
        <Editor sermon={sermon} pane={pane} moduleId={moduleId} onBackToList={() => setOpenId(null)} />
      ) : (
        <>
          <form className="ref-form" onSubmit={create}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Название новой проповеди')} aria-label={t('Название новой проповеди')} autoComplete="off" enterKeyHint="done" />
            <button className="btn primary" type="submit">
              <Plus size={17} /> {t('Создать')}
            </button>
          </form>
          {!sermons.length ? (
            <Empty icon={ScrollText} title={t('Проповедей пока нет')}>
              {t('Создайте проповедь, а потом добавляйте в неё стихи прямо во время чтения: зажмите стих и нажмите под ним «В проповедь».')}
            </Empty>
          ) : (
            <div className="sermon-pick">
              {sermons.map((s) => (
                <button key={s.id} className="sermon-pick-row" onClick={() => setOpenId(s.id)}>
                  <ScrollText size={18} />
                  <span>
                    {s.title}
                    <small>
                      {places(s.blocks.filter((b) => b.type === 'verse').length)}
                      {s.date ? ` · ${fmtDate(s.date)}` : ` · ${t('изменена {date}', { date: fmtD(s.updatedAt, { day: 'numeric', month: 'short' }) })}`}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </BottomSheet>
  );
}
