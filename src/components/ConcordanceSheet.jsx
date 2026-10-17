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

export default function ConcordanceSheet({ pane, payload, onClose }) {
  const { openInOther, openSheet } = useApp();
  const { num, lemma, back } = payload;
  const [st, setSt] = useState(null);
  const [word, setWord] = useState(null); // выбранный вариант перевода
  const [shown, setShown] = useState(PAGE);
  const [texts, setTexts] = useState({});

  useEffect(() => {
    strongStats(num).then((r) => setSt(r || { total: 0, refs: [], renderings: [] }));
  }, [num]);

  const list = useMemo(() => (st ? st.refs.filter((r) => !word || r.words.includes(word)) : []), [st, word]);
  const page = list.slice(0, shown);

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
  }, [st, word, shown]);

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
      {!st && (
        <div className="loading">
          <Loader2 className="spin" size={20} /> {t('Ищу все места…')}
        </div>
      )}
      {st && !st.total && <p className="muted">{t('В переводе со Стронгом этого слова нет.')}</p>}
      {st?.total > 0 && (
        <>
          <div className="chips filter-chips" role="group" aria-label={t('Как переведено')}>
            <button className={`chip ${!word ? 'on' : ''}`} aria-pressed={!word} onClick={() => (setWord(null), setShown(PAGE))}>
              {t('Все')} <span className="tab-n">{st.verses}</span>
            </button>
            {st.renderings.slice(0, 14).map(([w, n]) => (
              <button key={w} className={`chip ${word === w ? 'on' : ''}`} aria-pressed={word === w} onClick={() => (setWord(w), setShown(PAGE))}>
                {w} <span className="tab-n">{n}</span>
              </button>
            ))}
          </div>
          <ul className="concord">
            {page.map((r) => (
              <li key={key(r)}>
                <button className="concord-row" onClick={() => go(r)}>
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
      )}
    </BottomSheet>
  );
}
