// Проповеди: список, редактор (стихи и свой текст по порядку, ↑↓ — переставить) и «Кафедра» —
// крупный текст проповеди для чтения на служении, экран при этом не гаснет.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Trash2, Plus, Presentation, Share2, ScrollText, X, Minus, Type, CalendarDays, Copy } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { ConfirmButton, Empty } from './ui.jsx';
import { parseHumanRef } from '../core/books.js';
import { getVerse } from '../core/modules.js';
import { plainText } from '../core/verseMarkup.js';
import { useSermons, createSermon, deleteSermon, renameSermon, setSermonDate, addVerses, addTextBlock, updateBlock, removeBlock, moveBlock, blockRef, blockRefFull, sermonText } from '../core/sermons.js';
import { load, save } from '../core/storage.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

// Поле текста, которое растёт по мере набора
function AutoText({ value, onChange, placeholder, autoFocus }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} className="sermon-text-input" rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} />;
}

// «Кафедра»: проповедь крупно, во весь экран, экран не гаснет
function Pulpit({ sermon, onClose }) {
  const [size, setSize] = useState(() => load('pulpitSize', 26));
  useEffect(() => save('pulpitSize', size), [size]);
  useEffect(() => {
    let lock = null;
    const req = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen');
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
      lock?.release?.();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return createPortal(
    <div className="pulpit" role="dialog" aria-label={`Кафедра: ${sermon.title}`}>
      <div className="pulpit-bar">
        <button className="icon-btn" onClick={() => setSize((v) => Math.max(18, v - 2))} aria-label="Мельче">
          <Minus size={20} />
        </button>
        <Type size={18} aria-hidden="true" />
        <button className="icon-btn" onClick={() => setSize((v) => Math.min(48, v + 2))} aria-label="Крупнее">
          <Plus size={20} />
        </button>
        <span className="pulpit-title">{sermon.title}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Закрыть кафедру">
          <X size={22} />
        </button>
      </div>
      <div className="pulpit-body" style={{ fontSize: `${size}px` }}>
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
        <div className="pulpit-end">Аминь</div>
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
    if (!r) return setRefErr('Не понял ссылку. Пример: «Ин 3:16» или «Пс 22:1-4».');
    const to = r.verseEnd || r.end?.verse || null;
    const items = [];
    for (let v = r.verse; v <= (to || r.verse); v++) {
      const t = await getVerse(moduleId, { book: r.book, chapter: r.chapter, verse: v });
      if (t == null) break;
      items.push({ book: r.book, chapter: r.chapter, verse: v, text: plainText(t) });
    }
    if (!items.length) return setRefErr('Такого места нет в выбранном переводе.');
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
        toast('Текст проповеди скопирован');
      }
    } catch {
      /* отменили «Поделиться» */
    }
  };
  const verses = sermon.blocks.filter((b) => b.type === 'verse').length;

  return (
    <>
      <div className="sermon-head">
        <input className="sermon-title-input" value={sermon.title} onChange={(e) => renameSermon(sermon.id, e.target.value)} aria-label="Название проповеди" placeholder="Название проповеди" />
        <label className="sermon-date">
          <CalendarDays size={16} />
          <input type="date" value={sermon.date || ''} onChange={(e) => setSermonDate(sermon.id, e.target.value)} aria-label="Дата служения" />
          {!sermon.date && <span className="muted">дата служения</span>}
        </label>
        <div className="sermon-actions">
          <button className="btn primary" onClick={() => setPulpit(true)} disabled={!sermon.blocks.length}>
            <Presentation size={17} /> Кафедра
          </button>
          <button className="btn" onClick={share} disabled={!sermon.blocks.length}>
            {navigator.share ? <Share2 size={17} /> : <Copy size={17} />} Поделиться
          </button>
        </div>
      </div>

      {!sermon.blocks.length && (
        <div className="sermon-hint">
          <p>
            <strong>Как добавить стих:</strong> в тексте Библии зажмите стих пальцем — он выделится — и нажмите внизу «В проповедь». Или введите ссылку ниже.
          </p>
          <p>
            <strong>Свой текст</strong> — кнопка «Текст»: вступление, пояснения, примеры, вывод.
          </p>
        </div>
      )}

      <ol className="sermon-blocks">
        {sermon.blocks.map((b, i) => (
          <li key={b.id} className={`sermon-block ${b.type}`}>
            {b.type === 'verse' ? (
              <>
                <button
                  className="sermon-ref"
                  onClick={() => {
                    closeSheet();
                    navigate(pane, { book: b.book, chapter: b.chapter, verse: b.verse });
                  }}
                  title="Открыть в Библии"
                >
                  {blockRef(b)}
                </button>
                <p className="sermon-verse-text">{b.text}</p>
              </>
            ) : (
              <AutoText value={b.text} onChange={(text) => updateBlock(sermon.id, b.id, { text })} placeholder="Ваш текст: мысль, пояснение, пример…" autoFocus={fresh === b.id} />
            )}
            <div className="sermon-block-tools">
              <button className="icon-btn subtle" onClick={() => moveBlock(sermon.id, i, -1)} disabled={i === 0} aria-label="Выше">
                <ArrowUp size={17} />
              </button>
              <button className="icon-btn subtle" onClick={() => moveBlock(sermon.id, i, 1)} disabled={i === sermon.blocks.length - 1} aria-label="Ниже">
                <ArrowDown size={17} />
              </button>
              <button className="link-btn sermon-add-after" onClick={() => setFresh(addTextBlock(sermon.id, i))}>
                + текст ниже
              </button>
              <ConfirmButton className="icon-btn subtle" confirmText="Удалить" onConfirm={() => removeBlock(sermon.id, b.id)} aria-label="Удалить">
                <Trash2 size={16} />
              </ConfirmButton>
            </div>
          </li>
        ))}
      </ol>

      <div className="sermon-add">
        <button className="btn" onClick={() => setFresh(addTextBlock(sermon.id))}>
          <Plus size={17} /> Текст
        </button>
        <form className="ref-form" onSubmit={addByRef}>
          <input value={ref} onChange={(e) => (setRef(e.target.value), setRefErr(''))} placeholder="Стих по ссылке: Ин 3:16" aria-label="Добавить стих по ссылке" autoComplete="off" enterKeyHint="done" />
          <button className="btn" type="submit" disabled={!ref.trim()}>
            <Plus size={17} /> Стих
          </button>
        </form>
        {refErr && <p className="error-text small">{refErr}</p>}
      </div>
      <p className="sermon-foot">
        {verses} мест Писания · сохраняется само
        <ConfirmButton
          className="link-btn danger"
          confirmText="Удалить проповедь?"
          onConfirm={() => {
            deleteSermon(sermon.id);
            onBackToList();
          }}
        >
          удалить проповедь
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
    <BottomSheet title={sermon ? 'Проповедь' : 'Проповеди'} onClose={onClose} onBack={sermon ? () => setOpenId(null) : null} initial={2}>
      {sermon ? (
        <Editor sermon={sermon} pane={pane} moduleId={moduleId} onBackToList={() => setOpenId(null)} />
      ) : (
        <>
          <form className="ref-form" onSubmit={create}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название новой проповеди" aria-label="Название новой проповеди" autoComplete="off" enterKeyHint="done" />
            <button className="btn primary" type="submit">
              <Plus size={17} /> Создать
            </button>
          </form>
          {!sermons.length ? (
            <Empty icon={ScrollText} title="Проповедей пока нет">
              Создайте проповедь, а потом добавляйте в неё стихи прямо во время чтения: зажмите стих и нажмите внизу «В проповедь».
            </Empty>
          ) : (
            <div className="sermon-pick">
              {sermons.map((s) => (
                <button key={s.id} className="sermon-pick-row" onClick={() => setOpenId(s.id)}>
                  <ScrollText size={18} />
                  <span>
                    {s.title}
                    <small>
                      {s.blocks.filter((b) => b.type === 'verse').length} мест
                      {s.date ? ` · ${fmtDate(s.date)}` : ` · изменена ${new Date(s.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`}
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
