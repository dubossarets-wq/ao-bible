// Панель действий над выделенными стихами (появляется вместо верхней панели после долгого нажатия).
// ✓ · ссылка и число стихов · параллельно в другом переводе · любимые · заметка · закладка · копировать · ⋯
// В «⋯»: сравнить переводы, параллельные места, поделиться.
import React, { useEffect, useRef, useState } from 'react';
import { Check, Languages, BookCopy, Heart, Link2, Share2, Copy, NotebookPen, Bookmark, BookmarkCheck, MoreHorizontal, MessageSquareText, Headphones, Highlighter, FolderPlus, Eraser, Compass, ScrollText, WholeWord, Image as ImageIcon } from 'lucide-react';
import { useApp } from '../App.jsx';
import { getVerse } from '../core/modules.js';
import { listenFrom } from '../core/listen.js';
import { swallowNextClick } from './ui.jsx';
import { HL_COLORS, hlLabel } from '../core/highlights.js';
import { plainText } from '../core/verseMarkup.js';
import { bookMeta, formatRef, BOOKS } from '../core/books.js';
import { t } from '../core/i18n.js';

const ORDER = new Map(BOOKS.map((b, i) => [b.id, i]));

export function sortedRefs(selection) {
  return [...selection]
    .map((k) => {
      const [book, c, v] = k.split('.');
      return { book, chapter: +c, verse: +v };
    })
    .sort((a, b) => (ORDER.get(a.book) ?? 999) - (ORDER.get(b.book) ?? 999) || a.chapter - b.chapter || a.verse - b.verse);
}

// «Нав. 18:5», «Нав. 18:5–7» (подряд) или «Нав. 18:5, 7, 9»
export function selectionLabel(refs, full = false) {
  if (!refs.length) return '';
  const first = refs[0];
  const sameChapter = refs.every((r) => r.book === first.book && r.chapter === first.chapter);
  if (refs.length === 1) return formatRef(first, { full });
  if (sameChapter) {
    const vs = refs.map((r) => r.verse);
    const contiguous = vs.every((v, i) => i === 0 || v === vs[i - 1] + 1);
    const name = full ? bookMeta(first.book).name : bookMeta(first.book).short;
    return `${name} ${first.chapter}:${contiguous ? `${vs[0]}–${vs[vs.length - 1]}` : vs.join(', ')}`;
  }
  return refs.map((r) => formatRef(r, { full })).join('; ');
}

export async function selectionText(moduleId, refs) {
  const lines = [];
  for (const r of refs) {
    const v = await getVerse(moduleId, r);
    if (v != null) lines.push(refs.length > 1 ? `${r.verse} ${plainText(v)}` : plainText(v));
  }
  return lines.join('\n');
}

export default function SelectionBar({ index, module, selection, onDone }) {
  const { openSheet, toast, bibles, openParallel, isFavorite, toggleFavorite, isBookmarked, toggleBookmark, notes, highlights, setHighlight, hlLabels } = useApp();
  const [palette, setPalette] = useState(false);
  const paletteRef = useRef(null);
  const [more, setMore] = useState(false);
  const moreRef = useRef(null);
  const refs = sortedRefs(selection);
  const label = selectionLabel(refs);
  const others = bibles.filter((b) => b.id !== module.id);
  const first = refs[0];
  const hasNote = !!notes[`${first.book}.${first.chapter}.${first.verse}`];

  useEffect(() => {
    if (!palette) return;
    const off = (e) => !paletteRef.current?.contains(e.target) && (setPalette(false), swallowNextClick());
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [palette]);

  useEffect(() => {
    if (!more) return;
    const off = (e) => !moreRef.current?.contains(e.target) && !e.target.closest?.('.tour') && (setMore(false), swallowNextClick());
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [more]);

  const fullText = async () => `${await selectionText(module.id, refs)}\n— ${selectionLabel(refs, true)} (${module.name})`;

  const copy = async () => {
    const text = await fullText();
    try {
      await navigator.clipboard.writeText(text);
      toast(refs.length > 1 ? t('Скопировано стихов: {n}', { n: refs.length }) : t('Стих скопирован'));
      onDone();
    } catch {
      openSheet('compare', index, { refs, moduleId: module.id, copyFallback: text });
    }
  };

  const share = async () => {
    const text = await fullText();
    if (navigator.share) {
      try {
        await navigator.share({ text });
        onDone();
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(t('Поделиться отсюда нельзя — текст скопирован'));
    } catch {
      toast(t('Не удалось ни поделиться, ни скопировать'), 'error');
    }
  };

  // Один другой перевод — открываем сразу; несколько или ни одного — выбор в панели сравнения
  const parallel = () => {
    if (others.length === 1) {
      openParallel(index, refs[0], others[0].id);
      onDone();
    } else openSheet('compare', index, { refs, moduleId: module.id, pick: true });
  };

  const fav = refs.every((r) => isFavorite(r));
  const toggleFav = async () => {
    for (const r of refs) {
      if (fav || !isFavorite(r)) toggleFavorite(r, await selectionText(module.id, [r]));
    }
    onDone();
  };

  // Закладка «продолжить отсюда» ставится на первый выделенный стих; закладок может быть сколько угодно
  const bm = isBookmarked(first);
  const toggleBm = async () => {
    toggleBookmark(first, bm ? '' : (await selectionText(module.id, [first])).slice(0, 160));
    onDone();
  };

  const moreItem = (Icon, text, fn) => (
    <button
      role="menuitem"
      className="menu-item"
      onClick={() => {
        setMore(false);
        fn();
        onDone(); // действие выполнено — выделение снимается
      }}
    >
      <Icon size={18} />
      <span>{text}</span>
    </button>
  );

  return (
    <header className="toolbar selection-bar" role="toolbar" aria-label={t('Действия с выделенными стихами')}>
      <button className="tb tb-icon" onClick={onDone} aria-label={t('Готово, снять выделение')} title={t('Готово')}>
        <Check size={24} />
      </button>
      <div className="tb tb-sel-ref" aria-live="polite">
        <span className="sel-ref">{label}</span>
        <span className="sel-count" aria-label={t('Выделено стихов: {n}', { n: refs.length })}>
          {refs.length}
        </span>
      </div>
      <button className="tb tb-icon" onClick={parallel} aria-label={t('Открыть параллельно в другом переводе')} title={t('Параллельно в другом переводе')}>
        <Languages size={22} />
      </button>
      {/* Комментарии — рядом с переводом */}
      <button className="tb tb-icon" onClick={() => (openSheet('commentary', index, { ref: first }), onDone())} aria-label={t('Комментарии')} title={t('Комментарии')}>
        <MessageSquareText size={21} />
      </button>
      <div className="hl-wrap" ref={paletteRef}>
        <button className={`tb tb-icon ${highlights[`${first.book}.${first.chapter}.${first.verse}`] ? 'on' : ''}`} onClick={() => setPalette((v) => !v)} aria-label={t('Выделить цветом')} aria-expanded={palette} title={t('Выделить цветом')}>
          <Highlighter size={21} />
        </button>
        {palette && (
          <div className="hl-palette" role="menu" aria-label={t('Цвет выделения')}>
            {HL_COLORS.map((c) => (
              <button
                key={c.id}
                role="menuitem"
                className={`hl-dot ${highlights[`${first.book}.${first.chapter}.${first.verse}`] === c.id ? 'on' : ''}`}
                style={{ background: c.css }}
                aria-label={hlLabel(c.id, hlLabels)}
                title={hlLabel(c.id, hlLabels)}
                onClick={() => {
                  setHighlight(refs, c.id);
                  onDone();
                }}
              />
            ))}
            <button role="menuitem" className="hl-dot clear" aria-label={t('Убрать выделение')} title={t('Убрать выделение')} onClick={() => (setHighlight(refs, null), onDone())}>
              <Eraser size={15} />
            </button>
          </div>
        )}
      </div>
      <button className={`tb tb-icon tb-opt ${fav ? 'on' : ''}`} onClick={toggleFav} aria-label={fav ? t('Убрать из любимых') : t('В любимые')} title={t('Любимые стихи')}>
        <Heart size={21} fill={fav ? 'currentColor' : 'none'} />
      </button>
      <button className={`tb tb-icon ${hasNote ? 'on' : ''}`} onClick={() => (openSheet('note', index, { refs, moduleId: module.id }), onDone())} aria-label={hasNote ? t('Открыть заметку') : t('Добавить заметку')} title={t('Заметка')}>
        <NotebookPen size={21} />
      </button>
      <button className={`tb tb-icon ${bm ? 'on' : ''}`} onClick={toggleBm} aria-label={bm ? t('Убрать закладку') : t('Закладка: продолжить отсюда')} title={bm ? t('Убрать закладку') : t('Закладка «продолжить отсюда»')}>
        {bm ? <BookmarkCheck size={21} /> : <Bookmark size={21} />}
      </button>
      <div className="tb-menu-wrap" ref={moreRef}>
        <button className="tb tb-icon tb-more" onClick={() => setMore((m) => !m)} aria-haspopup="menu" aria-expanded={more} aria-label={t('Ещё действия')}>
          <MoreHorizontal size={22} />
        </button>
        {more && (
          <div className="menu" role="menu">
            {moreItem(WholeWord, t('Подстрочник'), () => openSheet('interlinear', index, { ref: first, moduleId: module.id }))}
            {moreItem(Compass, t('Всё о стихе'), () => openSheet('guide', index, { ref: first, moduleId: module.id }))}
            {moreItem(ScrollText, t('В проповедь'), () => openSheet('sermon-add', index, { refs, moduleId: module.id }))}
            {moreItem(FolderPlus, t('В подборку…'), () => openSheet('collect', index, { refs, moduleId: module.id }))}
            {moreItem(Heart, fav ? t('Убрать из любимых') : t('В любимые'), toggleFav)}
            {moreItem(BookCopy, t('Сравнить переводы'), () => openSheet('compare', index, { refs, moduleId: module.id }))}
            {refs.length === 1 && moreItem(Link2, t('Параллельные места'), () => openSheet('xrefs', index, { ref: first }))}
            {moreItem(Headphones, t('Слушать отсюда'), () => (listenFrom(index, module.id, first), onDone()))}
            {moreItem(Copy, t('Копировать'), copy)}
            {moreItem(ImageIcon, t('Картинка со стихом'), () => openSheet('verse-image', index, { refs, moduleId: module.id }))}
            {moreItem(Share2, t('Поделиться'), share)}
          </div>
        )}
      </div>
    </header>
  );
}
