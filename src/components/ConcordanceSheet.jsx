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
  const [shown, setShown] = useState(PAGE);
  const [texts, setTexts] = useState({});

  useEffect(() => {
    setSt(null);
    setWord(null);
    setShown(PAGE);
    strongStats(num).then((r) => setSt(r || { total: 0, refs: [], renderings: [] }));
  }, [num]);

  const all = useMemo(() => (st ? st.refs.filter((r) => !filter || filter(r)) : []), [st, filter]);
  const list = useMemo(() => all.filter((r) => !word || r.words.includes(word)), [all, word]);
  const page = list.slice(0, shown);
  const renderings = useMemo(() => {
    const m = new Map();
    for (const r of all) for (const w of new Set(r.words)) m.set(w, (m.get(w) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

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
      <div className="chips filter-chips" role="group" aria-label={t('Как переведено')}>
        <button className={`chip ${!word ? 'on' : ''}`} aria-pressed={!word} onClick={() => (setWord(null), setShown(PAGE))}>
          {t('Все')} <span className="tab-n">{all.length}</span>
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
