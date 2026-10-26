// Проповеди: список, редактор (стихи и свой текст по порядку; зажать блок — перетащить) и «Кафедра» —
// крупный текст проповеди для чтения на служении, экран при этом не гаснет.
// Стихи добавляются тем же поиском, что и в приложении (SearchPanel в режиме выбора).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Plus, Presentation, Share2, ScrollText, X, Minus, Type, Copy, GripVertical, Search, TextSelect, TextQuote, Undo2, Redo2 } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import SearchPanel from './SearchPanel.jsx';
import SwipeRow from './SwipeRow.jsx';
import { plateSvg } from './partShape.js';
import { useApp } from '../App.jsx';
import { ConfirmButton, Empty, Reveal } from './ui.jsx';
import { formatRef } from '../core/books.js';
import { getVerse } from '../core/modules.js';
import { plainText } from '../core/verseMarkup.js';
import {
  useSermons,
  createSermon,
  deleteSermon,
  restoreSermon,
  renameSermon,
  replaceSermon,
  addVerses,
  addTextBlock,
  updateBlock,
  removeBlock,
  setBlockPart,
  removeVerse,
  restoreBlocks,
  moveBlock,
  blockRef,
  blockRefFull,
  sermonText,
  verseTexts,
  fillVerseTexts,
  versesForRef,
  refRangeLabel,
} from '../core/sermons.js';
import { load, save } from '../core/storage.js';
import { t, fmtDate as fmtD } from '../core/i18n.js';

// «1 место», «2 места», «5 мест»
export const places = (n) => t('{n} место|{n} места|{n} мест', { n });
const fmtDate = (d) => (d ? fmtD(d, { day: 'numeric', month: 'long', year: 'numeric' }) : '');

// Поле текста, которое растёт по мере набора
function AutoText({ value, onChange, placeholder, autoFocus, onBlur }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  // Курсор — в конец текста (поле открыли нажатием на готовый абзац)
  useEffect(() => {
    const el = ref.current;
    if (autoFocus && el) el.setSelectionRange?.(el.value.length, el.value.length);
  }, []);
  return <textarea ref={ref} className="sermon-text-input" rows={1} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} autoFocus={autoFocus} />;
}

// Свой текст в проповеди: готовый абзац — просто текст (его можно зажать и перетащить, как стих),
// нажатие — правка. Пустой (только что добавленный) — сразу поле ввода.
function TextBlock({ sermonId, block, fresh, onDone }) {
  const [edit, setEdit] = useState(false);
  const editing = edit || fresh || !block.text.trim();
  if (editing)
    return (
      <AutoText
        value={block.text}
        onChange={(text) => updateBlock(sermonId, block.id, { text })}
        onBlur={() => (setEdit(false), onDone?.())}
        placeholder={t('Мысль, пояснение, пример…')}
        autoFocus={fresh || edit}
      />
    );
  return (
    <div className="sermon-text-view" role="button" tabIndex={0} aria-label={t('Изменить текст')} onClick={() => setEdit(true)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setEdit(true))}>
      {block.text}
    </div>
  );
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
              {(verseTexts(b) || [b.text]).length > 1
                ? verseTexts(b).map((x, i) => (
                    <p key={i} className="pulpit-vline">
                      <sup>{b.verse + i}</sup> {x}
                    </p>
                  ))
                : b.text}
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

// Компактная строка между блоками: добавить текст или стих именно сюда
function Inserter({ onText, onVerse }) {
  return (
    <div className="sermon-insert">
      <button type="button" className="sermon-insert-btn" onClick={onText} aria-label={t('Добавить текст')}>
        <Plus size={14} /> {t('Текст')}
      </button>
      <button type="button" className="sermon-insert-btn" onClick={onVerse} aria-label={t('Добавить стих')}>
        <Plus size={14} /> {t('Стих')}
      </button>
    </div>
  );
}

function Editor({ sermon, pane, moduleId, onBackToList, onAddVerse, scrollTo }) {
  const { navigate, closeSheet, toast, undoToast } = useApp();
  const [pulpit, setPulpit] = useState(false);
  // «Часть стиха» в блоке: { id, full, from, to } — слова полного текста нажимаются: первое — начало, второе — конец
  const [pe, setPe] = useState(null);
  const lastPe = useRef(null); // выбор части стиха, который сейчас сворачивается: показываем его до конца анимации
  if (pe) lastPe.current = pe;
  const fullOf = async (b) => plainText((await getVerse(b.moduleId, { book: b.book, chapter: b.chapter, verse: b.verse })) || '').trim();
  const startPart = async (b) => {
    const full = await fullOf(b);
    if (full) setPe({ id: b.id, full, from: null, to: null });
  };
  const pickWord = (i) => setPe((p) => (p.from == null || p.to != null ? { ...p, from: i, to: null } : { ...p, to: i }));
  const [fresh, setFresh] = useState(null); // только что добавленный текстовый блок — сразу в него курсор

  // Старые проповеди: диапазон стихов — одной строкой; разбиваем по стихам (текст не меняется)
  const ranges = sermon.blocks.filter((b) => b.type === 'verse' && b.to && !verseTexts(b)).length;
  useEffect(() => void fillVerseTexts(sermon.id, moduleId), [sermon.id, ranges]);

  // Только что добавленные поиском стихи — прокручиваем к ним и подсвечиваем
  useEffect(() => {
    if (!scrollTo) return;
    const el = list.current?.querySelector(`li[data-id="${scrollTo}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('just-added');
    const timer = setTimeout(() => el.classList.remove('just-added'), 1400);
    return () => clearTimeout(timer);
  }, [scrollTo]);

  // Нажатие на стих — к этому стиху в Библии
  const goVerse = (b, verse) => {
    closeSheet();
    navigate(pane, { book: b.book, chapter: b.chapter, verse });
  };
  // Убрать стих (из диапазона — только его; диапазон делится на части) — с «Отменить»
  const dropVerse = (b, verse) => {
    const before = sermon.blocks;
    const one = !b.to || b.to === b.verse || !verseTexts(b);
    removeVerse(sermon.id, b.id, verse);
    undoToast(t('Убрано: {ref}', { ref: one ? blockRef(b) : blockRef({ ...b, verse, to: null }) }), () => restoreBlocks(sermon.id, before));
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
  const justDragged = useRef(0);
  const dragDown = (e) => {
    if (e.button > 0 || e.target.closest('textarea, input, .sermon-block-tools button, .sermon-pw, .sv-del, .sermon-insert, .confirm-group')) return;
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
      // Дальше палец ведём по всему окну: блок переставляется в DOM (захват указателя при этом теряется),
      // а отпустить его могут и ниже списка
      d.wm = winMove;
      d.we = winEnd;
      window.addEventListener('pointermove', d.wm, { passive: false });
      window.addEventListener('pointerup', d.we);
      window.addEventListener('pointercancel', d.we);
    }, 420);
    drag.current = d;
  };
  const winMove = (e) => dragFns.current.move(e, true);
  const winEnd = () => dragFns.current.end();
  const dragMove = (e, fromWindow) => {
    const d = drag.current;
    if (!d || (d.on && !fromWindow)) return;
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
    const gap = parseFloat(getComputedStyle(list.current).rowGap) || 0;
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
    window.removeEventListener('pointermove', d.wm);
    window.removeEventListener('pointerup', d.we);
    window.removeEventListener('pointercancel', d.we);
    justDragged.current = Date.now();
    d.li.classList.remove('dragging');
    d.li.style.transform = '';
  };
  const dragFns = useRef(null);
  dragFns.current = { move: dragMove, end: dragEnd };
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
            <strong>{t('Как добавить стих:')}</strong> {t('зажмите стих в Библии и нажмите «В проповедь» — или найдите его кнопкой «Стих» ниже.')}
          </p>
          <p>
            <strong>{t('Свой текст')}</strong> {t('— кнопка «Текст». Чтобы переставить блок, зажмите его и тяните.')}
          </p>
        </div>
      )}

      {sermon.blocks.length > 0 && <Inserter onText={() => setFresh(addTextBlock(sermon.id, -1))} onVerse={() => onAddVerse(0)} />}
      <ol
        className="sermon-blocks"
        ref={list}
        onPointerDown={dragDown}
        onPointerMove={dragMove}
        onPointerUp={() => !drag.current?.on && dragEnd()}
        onPointerCancel={() => !drag.current?.on && dragEnd()}
        // Долгое нажатие — перетаскивание, а не меню браузера и не выделение текста
        onContextMenu={(e) => !e.target.closest('textarea, input') && e.preventDefault()}
        onClickCapture={(e) => {
          if (Date.now() - justDragged.current < 400) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {sermon.blocks.map((b, i) => {
          const texts = b.type === 'verse' ? verseTexts(b) : null;
          const group = !!texts && texts.length > 1;
          // Старый диапазон, который не удалось разбить, — одним абзацем, как раньше
          const lines = texts ? texts.map((x, k) => ({ v: b.verse + k, text: x })) : b.type === 'verse' ? [{ v: b.verse, text: b.text }] : [];
          return (
          <li key={b.id} data-id={b.id} className="sermon-item">
            <div className={`sermon-block ${b.type}${group ? ' group' : ''}`}>
              {b.type === 'verse' ? (
                <>
                  <button className="sermon-ref" onClick={() => goVerse(b, b.verse)} title={t('Открыть в Библии')}>
                    {blockRef(b)}
                  </button>
                  {/* «Часть стиха»: полный текст для выбора слов и обычные строки сменяют друг друга плавно */}
                  <Reveal open={pe?.id === b.id}>{lastPe.current?.id === b.id && <PartPicker pe={pe?.id === b.id ? pe : lastPe.current} onPick={pickWord} />}</Reveal>
                  <Reveal open={pe?.id !== b.id}>
                  <div className="sermon-verses">
                    {lines.map(({ v, text }) => {
                      const one = blockRef(group ? { ...b, verse: v, to: null } : b);
                      return (
                        <div key={v} className="sv-row">
                          <div className="sv-line">
                            <button type="button" className="sermon-verse-text" onClick={() => goVerse(b, v)} aria-label={`${one}. ${text}`} title={t('Открыть в Библии')}>
                              {group && <sup className="sv-num">{v}</sup>}
                              {text}
                            </button>
                            {group && (
                              <ConfirmButton className="icon-btn subtle sv-del" end small confirmText={t('Убрать')} onConfirm={() => dropVerse(b, v)} aria-label={t('Убрать из проповеди: {ref}', { ref: one })} title={t('Убрать стих')}>
                                <X size={15} />
                              </ConfirmButton>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </Reveal>
                </>
              ) : (
                <TextBlock sermonId={sermon.id} block={b} fresh={fresh === b.id} onDone={() => fresh === b.id && setFresh(null)} />
              )}
              <div className="sermon-block-tools">
                <span className="sermon-grip" title={t('Зажмите, чтобы перетащить')} aria-hidden="true">
                  <GripVertical size={17} />
                </span>
                {b.type === 'verse' && !b.to && b.moduleId && pe?.id !== b.id && (
                  <>
                    <button className="icon-btn subtle" onClick={() => startPart(b)} aria-label={t('Часть стиха')} title={t('Часть стиха')}>
                      <TextSelect size={16} />
                    </button>
                    {b.part && (
                      <button
                        className="icon-btn subtle"
                        onClick={async () => {
                          const full = await fullOf(b);
                          if (full) setBlockPart(sermon.id, b.id, full, false);
                        }}
                        aria-label={t('Весь стих')}
                        title={t('Весь стих')}
                      >
                        <TextQuote size={16} />
                      </button>
                    )}
                  </>
                )}
                <span className="sermon-tools-gap" />
                {pe?.id === b.id ? (
                  <>
                    <button className="btn small" onClick={() => setPe(null)}>
                      {t('Отмена')}
                    </button>
                    <button
                      className="btn primary small"
                      disabled={pe.from == null}
                      onClick={() => {
                        const r = partRange(pe);
                        if (r) setBlockPart(sermon.id, b.id, partOf(pe.full, r), true);
                        setPe(null);
                      }}
                    >
                      {t('Готово')}
                    </button>
                  </>
                ) : (
                  <ConfirmButton className="icon-btn subtle" end small confirmText={t('Удалить')} onConfirm={() => removeBlock(sermon.id, b.id)} aria-label={b.type === 'verse' ? t('Удалить стих из проповеди') : t('Удалить текст')}>
                    <Trash2 size={16} />
                  </ConfirmButton>
                )}
              </div>
            </div>
            <Inserter onText={() => setFresh(addTextBlock(sermon.id, i))} onVerse={() => onAddVerse(i + 1)} />
          </li>
          );
        })}
      </ol>

      {sermon.blocks.length === 0 && <div className="sermon-add">
        <button className="btn" onClick={() => setFresh(addTextBlock(sermon.id))}>
          <Plus size={17} /> {t('Текст')}
        </button>
        <button className="btn sermon-add-verse" onClick={() => onAddVerse(null)}>
          <Search size={17} /> {t('Стих')}
        </button>
      </div>}
      <p className="sermon-foot">{t('{n} место Писания|{n} места Писания|{n} мест Писания', { n: verses })} · {t('сохраняется само')}</p>
      <div className="sermon-del">
        <ConfirmButton
          className="btn danger"
          confirmText={t('Удалить проповедь?')}
          onConfirm={() => {
            deleteSermon(sermon.id);
            onBackToList();
          }}
        >
          <Trash2 size={17} /> {t('Удалить проповедь')}
        </ConfirmButton>
      </div>
      {pulpit && <Pulpit sermon={sermon} onClose={() => setPulpit(false)} />}
    </>
  );
}

// Слова стиха (как в читалке: слово с дефисом или апострофом — целиком)
const WORD_RE = /[\p{L}\p{M}]+(?:[-’'][\p{L}\p{M}]+)*/gu;
const wordsOf = (full) => [...full.matchAll(WORD_RE)].map((m) => [m.index, m.index + m[0].length]);
const partRange = (pe) => (pe.from == null ? null : [Math.min(pe.from, pe.to ?? pe.from), Math.max(pe.from, pe.to ?? pe.from)]);
const partOf = (full, [a, z]) => {
  const w = wordsOf(full);
  return full.slice(w[a][0], w[z][1]).replace(/\s+/g, ' ').trim();
};

// Полный текст стиха со словами, на которые можно нажать; выбранное — цельной скруглённой плашкой акцента
// (тот же рисовальщик, что у выбора части стиха в читалке)
function PartPicker({ pe, onPick }) {
  const box = useRef(null);
  const w = wordsOf(pe.full);
  const r = partRange(pe);
  useLayoutEffect(() => {
    const host = box.current;
    host.querySelector('.part-svg')?.remove();
    if (!r) return;
    const a = host.querySelector(`[data-i="${r[0]}"]`);
    const z = host.querySelector(`[data-i="${r[1]}"]`);
    if (!a || !z) return;
    const range = document.createRange();
    range.setStartBefore(a);
    range.setEndAfter(z);
    const base = host.getBoundingClientRect();
    const lines = [];
    for (const q of range.getClientRects()) {
      if (q.width < 1 || q.height < 1) continue;
      const line = lines.find((l) => Math.abs((l.t + l.b) / 2 - (q.top + q.bottom) / 2) < q.height / 2);
      if (line) {
        line.l = Math.min(line.l, q.left - base.left);
        line.r = Math.max(line.r, q.right - base.left);
        line.t = Math.min(line.t, q.top - base.top);
        line.b = Math.max(line.b, q.bottom - base.top);
      } else lines.push({ l: q.left - base.left, r: q.right - base.left, t: q.top - base.top, b: q.bottom - base.top });
    }
    if (lines.length) host.prepend(plateSvg(lines));
  });
  const out = [];
  let pos = 0;
  w.forEach(([s, e], i) => {
    if (s > pos) out.push(<span key={'g' + i}>{pe.full.slice(pos, s)}</span>);
    out.push(
      <span key={i} data-i={i} className="sermon-pw" role="button" tabIndex={0} onClick={() => onPick(i)} onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), onPick(i))}>
        {pe.full.slice(s, e)}
      </span>
    );
    pos = e;
  });
  if (pos < pe.full.length) out.push(<span key="tail">{pe.full.slice(pos)}</span>);
  return (
    <div className="sermon-pick">
      <div className="sermon-verse-text" ref={box}>
        {out}
      </div>
      <Reveal open={!r}>
        <p className="part-hint">{t('Нажмите на первое и последнее слово.')}</p>
      </Reveal>
    </div>
  );
}

export default function SermonsSheet({ pane, payload, onClose }) {
  const { panes, bibles, toast, undoToast } = useApp();
  const sermons = useSermons();
  const [openId, setOpenId] = useState(payload.open || null);
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false); // поиск стихов для проповеди
  const [scrollTo, setScrollTo] = useState(null);
  const sermon = sermons.find((s) => s.id === openId);
  const moduleId = (panes[pane]?.moduleId && bibles.find((b) => b.id === panes[pane].moduleId)?.id) || bibles[0]?.id;
  const bodyScroll = useRef(0);

  // История правок открытой проповеди (на время открытого окна, до 50 шагов): снимки проповеди целиком.
  // Набор текста в одном блоке или в названии склеивается в один шаг (пауза ~800 мс).
  const hist = useRef({ id: null, cur: null, key: null, at: 0, undo: [], redo: [] });
  const [, bump] = useState(0);
  useEffect(() => {
    if (!sermon) return;
    const h = hist.current;
    const sn = JSON.stringify({ ...sermon, updatedAt: undefined });
    if (h.id !== sermon.id) {
      Object.assign(h, { id: sermon.id, cur: sn, key: null, undo: [], redo: [] });
      bump((x) => x + 1);
      return;
    }
    if (sn === h.cur) return;
    const a = JSON.parse(h.cur), b = JSON.parse(sn);
    const diff = (x, y) => [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
    let key = null;
    const ks = diff(a, b);
    if (ks.length === 1 && ks[0] === 'title') key = 'title';
    else if (ks.length === 1 && ks[0] === 'blocks' && a.blocks.length === b.blocks.length) {
      const ch = b.blocks.map((q, i) => [q, a.blocks[i]]).filter(([q, p]) => JSON.stringify(q) !== JSON.stringify(p));
      if (ch.length === 1 && ch[0][0].type === 'text' && diff(ch[0][0], ch[0][1]).join() === 'text') key = 'b:' + ch[0][0].id;
    }
    const now = Date.now();
    if (!(key && key === h.key && now - h.at < 800)) {
      h.undo.push(h.cur);
      if (h.undo.length > 50) h.undo.shift();
      h.redo = [];
    }
    Object.assign(h, { key, at: now, cur: sn });
    bump((x) => x + 1);
  }, [sermon]);
  const histStep = (back) => {
    const h = hist.current;
    const from = back ? h.undo : h.redo, to = back ? h.redo : h.undo;
    if (!from.length) return;
    to.push(h.cur);
    h.cur = from.pop();
    h.key = null;
    replaceSermon(JSON.parse(h.cur));
    bump((x) => x + 1);
  };

  const create = (e) => {
    e.preventDefault();
    setOpenId(createSermon(title));
    setTitle('');
  };
  // Удалить проповедь смахиванием — сразу, но с «Отменить»
  const removeSermon = (s) => {
    const i = sermons.indexOf(s);
    deleteSermon(s.id);
    undoToast(t('Проповедь «{title}» удалена', { title: s.title }), () => restoreSermon(s, i));
  };

  // Поиск стихов: открыть поверх редактора и вернуться к тому же месту
  const sheetBody = () => document.querySelector('.sheet.page .sheet-body');
  const insertAt = useRef(null); // куда вставлять найденные стихи (null — в конец)
  const openSearch = (at = null) => {
    insertAt.current = at;
    bodyScroll.current = sheetBody()?.scrollTop || 0;
    setScrollTo(null);
    setAdding(true);
  };
  const closeSearch = (to = null) => {
    setAdding(false);
    if (to) setScrollTo(to);
    else requestAnimationFrame(() => sheetBody() && (sheetBody().scrollTop = bodyScroll.current));
  };
  const inSermon = (r) => !!sermon?.blocks.some((b) => b.type === 'verse' && !b.part && b.book === r.book && b.chapter === r.chapter && r.verse >= b.verse && r.verse <= (b.to || b.verse));
  const pick = sermon && {
    has: inSermon,
    // Место из результатов (или из мест Стронга) — один стих; остаёмся в поиске, чтобы добавить ещё
    add: async (r) => {
      const mid = r.moduleId || moduleId;
      const text = typeof r.text === 'string' ? r.text : plainText((await getVerse(mid, r)) || '');
      const ids = addVerses(sermon.id, [{ book: r.book, chapter: r.chapter, verse: r.verse, text }], mid, insertAt.current);
      if (insertAt.current != null) insertAt.current += ids.length; // следующий найденный — после этого
      toast(t('Добавлено в проповедь: {ref}', { ref: formatRef(r) }));
    },
    // Ссылка «Ин 3:16-18» — все стихи вместе (каждый своим абзацем), и обратно к проповеди
    addRef: async (q) => {
      const items = await versesForRef(moduleId, q);
      if (!items?.length) return toast(t('Такого места нет в выбранном переводе.'), 'error');
      const ids = addVerses(sermon.id, items, moduleId, insertAt.current);
      toast(t('Добавлено в проповедь: {ref}', { ref: refRangeLabel(q, items[0]) }));
      closeSearch(ids[0]);
    },
  };
  const searchPane = panes[pane]?.kind === 'map' ? 0 : pane;

  if (sermon && adding)
    return (
      <BottomSheet title={t('Добавить стих')} subtitle={sermon.title} onClose={onClose} onBack={() => closeSearch()} variant="page">
        <SearchPanel pane={searchPane} pick={pick} onClose={onClose} />
      </BottomSheet>
    );

  return (
    <BottomSheet
      title={sermon ? t('Проповедь') : t('Проповеди')}
      onClose={onClose}
      onBack={sermon && !(payload.open && openId === payload.open) ? () => setOpenId(null) : null}
      variant="page"
      headerExtra={
        sermon && (
          <>
            <button className="icon-btn" onClick={() => histStep(true)} disabled={!hist.current.undo.length} aria-label={t('Отменить')} title={t('Отменить')}>
              <Undo2 size={20} />
            </button>
            <button className="icon-btn" onClick={() => histStep(false)} disabled={!hist.current.redo.length} aria-label={t('Повторить')} title={t('Повторить')}>
              <Redo2 size={20} />
            </button>
          </>
        )
      }
    >
      {sermon ? (
        <Editor sermon={sermon} pane={pane} moduleId={moduleId} onBackToList={() => setOpenId(null)} onAddVerse={openSearch} scrollTo={scrollTo} />
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
              {t('Создайте проповедь и добавляйте стихи прямо при чтении: зажмите стих → «В проповедь».')}
            </Empty>
          ) : (
            <div className="sermon-pick">
              {sermons.map((s) => (
                <SwipeRow key={s.id} as="div" onDelete={() => removeSermon(s)} label={t('Удалить проповедь «{title}»', { title: s.title })}>
                  <button className="sermon-pick-row" onClick={() => setOpenId(s.id)}>
                    <ScrollText size={18} />
                    <span>
                      {s.title}
                      <small>
                        {places(s.blocks.filter((b) => b.type === 'verse').length)}
                        {s.date ? ` · ${fmtDate(s.date)}` : ` · ${t('изменена {date}', { date: fmtD(s.updatedAt, { day: 'numeric', month: 'short' }) })}`}
                      </small>
                    </span>
                  </button>
                </SwipeRow>
              ))}
            </div>
          )}
        </>
      )}
    </BottomSheet>
  );
}
