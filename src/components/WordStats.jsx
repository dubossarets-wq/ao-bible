// Блок статистики слова в статье Стронга: число употреблений, книги (полосы), как переведено, все места
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { strongStats } from '../core/wordstats.js';
import { formatRef } from '../core/books.js';
import { t } from '../core/i18n.js';

// onOpenAll — открыть окно «Все места» (текст стихов, выбор по варианту перевода)
export default function WordStats({ num, onOpenRef, onOpenAll }) {
  const [st, setSt] = useState(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let alive = true;
    setSt(null);
    strongStats(num).then((r) => alive && setSt(r || { total: 0 }));
    return () => {
      alive = false;
    };
  }, [num]);

  if (!st)
    return (
      <div className="loading small">
        <Loader2 className="spin" size={16} /> {t('Считаю…')}
      </div>
    );
  if (!st.total) return null;
  const max = Math.max(...st.byBook.map((b) => b.n));
  const top = [...st.byBook].sort((a, b) => b.n - a.n).slice(0, 6);
  const books = st.byBook.length;
  return (
    <section className="word-stats">
      <h4>
        {t('Где встречается')} <span className="ws-mod">· {st.module}</span>
      </h4>
      {/* три числа плитками: употреблений, стихов, книг */}
      <div className="ws-tiles">
        <div>
          <b>{st.total}</b>
          <span>{t('употребление|употребления|употреблений', { n: st.total })}</span>
        </div>
        <div>
          <b>{st.verses}</b>
          <span>{t('стих|стиха|стихов', { n: st.verses })}</span>
        </div>
        <div>
          <b>{books}</b>
          <span>{t('книга|книги|книг', { n: books })}</span>
        </div>
      </div>
      {/* по книгам — только когда книг больше одной: одна полоса ничего не сравнивает */}
      {books > 1 && (
        <ul className="stat-bars" aria-label={t('По книгам')}>
          {top.map((b) => (
            <li key={b.book}>
              <span className="sb-name">{b.short.replace(/\.$/, '')}</span>
              <span className="sb-bar" style={{ '--w': `${Math.max(3, (b.n / max) * 100)}%` }} />
              <span className="r-n">{b.n}</span>
            </li>
          ))}
        </ul>
      )}
      {books > top.length && <p className="field-hint">{t('И ещё в {n} книгах.', { n: books - top.length })}</p>}
      <div className="chips">
        {(all ? st.refs : st.refs.slice(0, 8)).map((r) => (
          <button key={`${r.book}.${r.chapter}.${r.verse}`} className="chip" onClick={() => onOpenRef(r)}>
            {formatRef(r)}
          </button>
        ))}
        {!all && !onOpenAll && st.refs.length > 8 && (
          <button className="chip ghost" onClick={() => setAll(true)}>
            {t('Все {n}', { n: st.refs.length })}
          </button>
        )}
      </div>
      {onOpenAll && (
        <button className="btn" onClick={onOpenAll}>
          {t('Все места ({n})', { n: st.verses })}
        </button>
      )}
    </section>
  );
}
