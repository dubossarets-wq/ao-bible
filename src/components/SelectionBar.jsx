// Панель действий над выделенными стихами (появляется вместо верхней панели после долгого нажатия).
// ✓ · ссылка и число стихов · параллельно в другом переводе · сравнить переводы · избранное ·
// параллельные места · поделиться · копировать
import React from 'react';
import { Check, Shuffle, BookCopy, Star, Link2, Share2, Copy } from 'lucide-react';
import { useApp } from '../App.jsx';
import { getVerse } from '../core/modules.js';
import { plainText } from '../core/verseMarkup.js';
import { bookMeta, formatRef, BOOKS } from '../core/books.js';

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
  const { openSheet, toast, bibles, openParallel, isFavorite, toggleFavorite } = useApp();
  const refs = sortedRefs(selection);
  const label = selectionLabel(refs);
  const others = bibles.filter((b) => b.id !== module.id);

  const fullText = async () => `${await selectionText(module.id, refs)}\n— ${selectionLabel(refs, true)} (${module.name})`;

  const copy = async () => {
    const text = await fullText();
    try {
      await navigator.clipboard.writeText(text);
      toast(refs.length > 1 ? `Скопировано стихов: ${refs.length}` : 'Стих скопирован');
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
      toast('Поделиться отсюда нельзя — текст скопирован');
    } catch {
      toast('Не удалось ни поделиться, ни скопировать', 'error');
    }
  };

  // Один другой перевод — открываем сразу; несколько или ни одного — выбор в панели сравнения
  const parallel = () => {
    if (others.length === 1) {
      openParallel(index, refs[0], others[0].id);
      onDone();
    } else openSheet('compare', index, { refs, moduleId: module.id, pick: true });
  };

  const fav = refs.length === 1 && isFavorite(refs[0]);
  const toggleFav = async () => {
    for (const r of refs) {
      const t = await selectionText(module.id, [r]);
      if (refs.length === 1 || !isFavorite(r)) toggleFavorite(r, t);
    }
    onDone();
  };

  return (
    <header className="toolbar selection-bar" role="toolbar" aria-label="Действия с выделенными стихами">
      <button className="tb tb-icon" onClick={onDone} aria-label="Готово, снять выделение" title="Готово">
        <Check size={24} />
      </button>
      <div className="tb tb-sel-ref" aria-live="polite">
        <span className="sel-ref">{label}</span>
        <span className="sel-count" aria-label={`Выделено стихов: ${refs.length}`}>
          {refs.length}
        </span>
      </div>
      <button className="tb tb-icon" onClick={parallel} aria-label="Открыть параллельно в другом переводе" title="Параллельно в другом переводе">
        <Shuffle size={22} />
      </button>
      <button className="tb tb-icon" onClick={() => openSheet('compare', index, { refs, moduleId: module.id })} aria-label="Сравнить переводы" title="Сравнить переводы">
        <BookCopy size={22} />
      </button>
      <button className={`tb tb-icon tb-opt ${fav ? 'on' : ''}`} onClick={toggleFav} aria-label={fav ? 'Убрать из избранного' : 'В избранное'} title="Избранное">
        <Star size={21} fill={fav ? 'currentColor' : 'none'} />
      </button>
      {refs.length === 1 && (
        <button className="tb tb-icon tb-opt" onClick={() => openSheet('xrefs', index, { ref: refs[0] })} aria-label="Параллельные места" title="Параллельные места">
          <Link2 size={21} />
        </button>
      )}
      <button className="tb tb-icon" onClick={share} aria-label="Поделиться" title="Поделиться">
        <Share2 size={21} />
      </button>
      <button className="tb tb-icon" onClick={copy} aria-label="Копировать" title="Копировать">
        <Copy size={21} />
      </button>
    </header>
  );
}
