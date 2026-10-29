// Все места слова оригинала (по номеру Стронга): текст стиха с выделенным словом, выбор по варианту перевода.
// Нажатие на место открывает его; стрелка «назад» возвращает к статье словаря.
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { strongStats } from '../core/wordstats.js';
import { getVerse } from '../core/modules.js';
import { tokenize } from '../core/verseMarkup.js';
import { formatRef } from '../core/books.js';
import { t } from '../core/i18n.js';

const PAGE = 40;
const key = (r) => `${r.book}.${r.chapter}.${r.verse}`;
const same = (s, num) => s.replace(/^([HG])0*/, '$1') === num.replace(/^([HG])0*/, '$1');

// Текст стиха: слова с этим номером — выделены
function Verse({ raw, num }) {
  return (
    <>
      {tokenize(raw).map((tk, i) =>
        tk.kind === 'w' && tk.strongs?.some((s) => same(s, num)) ? <mark key={i}>{tk.text}</mark> : <React.Fragment key={i}>{tk.text}</React.Fragment>
      )}
    </>
  );
}

// Места слова оригинала: выбор по варианту перевода, стихи с выделенным словом, «Показать ещё».
// filter — какие места показывать (часть Библии в поиске); onOpen — нажатие на место.
export function StrongPlaces({ num, filter, onOpen }) {
  const [st, setSt] = useState(null);
  const [word, setWord] = useState(null); // выбранный вариант перевода
  const [book, setBook] = useState(null); // выбранная книга (её главы — только после выбора книги)
  const [chapter, setChapter] = useState(null);
  const [shown, setShown] = useState(PAGE);
  const [texts, setTexts] = useState({});

  useEffect(() => {
    setSt(null);
    setWord(null);
    setBook(null);
    setChapter(null);
    setShown(PAGE);
    strongStats(num).then((r) => setSt(r || { total: 0, refs: [], renderings: [] }));
  }, [num]);

  const all = useMemo(() => (st ? st.refs.filter((r) => !filter || filter(r)) : []), [st, filter]);
  // книги, где слово встречается (по порядку Библии), и главы выбранной книги — со счётом стихов
  const books = useMemo(() => {
    const m = new Map();
    for (const r of all) m.set(r.book, (m.get(r.book) || 0) + 1);
    const short = new Map((st?.byBook || []).map((b) => [b.book, b.short.replace(/\.$/, '')]));
    return [...m.entries()].map(([b, n]) => ({ book: b, n, name: short.get(b) || b }));
  }, [all, st]);
  const chapters = useMemo(() => {
    if (!book) return [];
    const m = new Map();
    for (const r of all) if (r.book === book) m.set(r.chapter, (m.get(r.chapter) || 0) + 1);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [all, book]);
  const inPlace = useMemo(() => all.filter((r) => (!book || r.book === book) && (!chapter || r.chapter === chapter)), [all, book, chapter]);
  const list = useMemo(() => inPlace.filter((r) => !word || r.words.includes(word)), [inPlace, word]);
  const page = list.slice(0, shown);
  const renderings = useMemo(() => {
    const m = new Map();
    for (const r of inPlace) for (const w of new Set(r.words)) m.set(w, (m.get(w) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [inPlace]);
  const pickBook = (b) => (setBook(b), setChapter(null), setWord(null), setShown(PAGE));

  // Тексты стихов подгружаем только для показанных мест
  useEffect(() => {
    if (!st?.moduleId) return;
    const need = page.filter((r) => texts[key(r)] == null);
    if (!need.length) return;
    let alive = true;
    Promise.all(need.map(async (r) => [key(r), (await getVerse(st.moduleId, r)) || ''])).then((pairs) => alive && setTexts((was) => ({ ...was, ...Object.fromEntries(pairs) })));
    return () => {
      alive = false;
    };
  }, [st, list, shown]);

  if (!st)
    return (
      <div className="loading">
        <Loader2 className="spin" size={20} /> {t('Ищу все места…')}
      </div>
    );
  if (!st.total) return <p className="muted">{t('В переводе со Стронгом этого слова нет.')}</p>;
  if (!all.length) return <p className="muted">{t('В этой части Библии мест нет.')}</p>;
  return (
    <>
      {/* книги, где встречается; после выбора книги — её главы */}
      {books.length > 1 && (
        <div className="chips filter-chips" role="group" aria-label={t('Книги')}>
          <button className={`chip ${!book ? 'on' : ''}`} aria-pressed={!book} onClick={() => pickBook(null)}>
            {t('Все книги')} <span className="tab-n">{all.length}</span>
          </button>
          {books.map((b) => (
            <button key={b.book} className={`chip ${book === b.book ? 'on' : ''}`} aria-pressed={book === b.book} onClick={() => pickBook(book === b.book ? null : b.book)}>
              {b.name} <span className="tab-n">{b.n}</span>
            </button>
          ))}
        </div>
      )}
      {book && chapters.length > 1 && (
        <div className="chips filter-chips" role="group" aria-label={t('Главы')}>
          <button className={`chip ${!chapter ? 'on' : ''}`} aria-pressed={!chapter} onClick={() => (setChapter(null), setWord(null), setShown(PAGE))}>
            {t('Все главы')} <span className="tab-n">{books.find((b) => b.book === book)?.n}</span>
          </button>
          {chapters.map(([c, n]) => (
            <button key={c} className={`chip ${chapter === c ? 'on' : ''}`} aria-pressed={chapter === c} onClick={() => (setChapter(chapter === c ? null : c), setWord(null), setShown(PAGE))}>
              {t('Гл. {n}', { n: c })} <span className="tab-n">{n}</span>
            </button>
          ))}
        </div>
      )}
      <div className="chips filter-chips" role="group" aria-label={t('Как переведено')}>
        <button className={`chip ${!word ? 'on' : ''}`} aria-pressed={!word} onClick={() => (setWord(null), setShown(PAGE))}>
          {t('Все')} <span className="tab-n">{inPlace.length}</span>
        </button>
        {renderings.slice(0, 14).map(([w, n]) => (
          <button key={w} className={`chip ${word === w ? 'on' : ''}`} aria-pressed={word === w} onClick={() => (setWord(w), setShown(PAGE))}>
            {w} <span className="tab-n">{n}</span>
          </button>
        ))}
      </div>
      <ul className="concord">
        {page.map((r) => (
          <li key={key(r)}>
            <button className="concord-row" onClick={() => onOpen(r)}>
              <span className="concord-ref">{formatRef(r)}</span>
              <span className="concord-text">{texts[key(r)] == null ? '…' : <Verse raw={texts[key(r)]} num={num} />}</span>
            </button>
          </li>
        ))}
      </ul>
      {list.length > shown && (
        <button className="btn" onClick={() => setShown((n) => n + PAGE)}>
          {t('Показать ещё ({n})', { n: list.length - shown })}
        </button>
      )}
    </>
  );
}

export default function ConcordanceSheet({ pane, payload, onClose }) {
  const { openInOther, openSheet } = useApp();
  const { num, lemma, back } = payload;
  const [st, setSt] = useState(null);

  useEffect(() => {
    strongStats(num).then((r) => setSt(r || { total: 0 }));
  }, [num]);

  const go = (r) => {
    onClose();
    openInOther(pane, r);
  };

  return (
    <BottomSheet
      title={`${t('Все места')} · ${num}${lemma ? ` ${lemma}` : ''}`}
      subtitle={st?.total ? `${t('{n} раз|{n} раза|{n} раз', { n: st.total })} ${t('в {n} стихе|в {n} стихах|в {n} стихах', { n: st.verses })} · ${st.module}` : null}
      onClose={onClose}
      onBack={back ? () => openSheet(back.kind, pane, back.payload) : null}
      initial="full"
    >
      <StrongPlaces num={num} onOpen={go} />
    </BottomSheet>
  );
}
