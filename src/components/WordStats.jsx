// Блок статистики слова в статье Стронга: число употреблений, книги (полосы), как переведено, все места
import React, { useEffect, useState } from 'react';
import { Loader2, BarChart3 } from 'lucide-react';
import { strongStats } from '../core/wordstats.js';
import { formatRef } from '../core/books.js';
import { t } from '../core/i18n.js';

export default function WordStats({ num, onOpenRef }) {
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
        <Loader2 className="spin" size={16} /> {t('Считаю употребления…')}
      </div>
    );
  if (!st.total) return null;
  const max = Math.max(...st.byBook.map((b) => b.n));
  const top = [...st.byBook].sort((a, b) => b.n - a.n).slice(0, 10);
  return (
    <section className="word-stats">
      <h4>
        <BarChart3 size={13} /> {t('Употребление в {module}: {total} раз в {verses} стихах, {books} книгах', { module: st.module, total: st.total, verses: st.verses, books: st.byBook.length })}
      </h4>
      <ul className="stat-bars" aria-label={t('По книгам')}>
        {top.map((b) => (
          <li key={b.book}>
            <span className="sb-name">{b.short.replace(/\.$/, '')}</span>
            <span className="sb-bar" style={{ '--w': `${Math.max(3, (b.n / max) * 100)}%` }} />
            <span className="r-n">{b.n}</span>
          </li>
        ))}
      </ul>
      {st.byBook.length > top.length && <p className="field-hint">{t('И ещё в {n} книгах.', { n: st.byBook.length - top.length })}</p>}
      <div className="chips">
        {(all ? st.refs : st.refs.slice(0, 24)).map((r) => (
          <button key={`${r.book}.${r.chapter}.${r.verse}`} className="chip" onClick={() => onOpenRef(r)}>
            {formatRef(r)}
          </button>
        ))}
        {!all && st.refs.length > 24 && (
          <button className="chip ghost" onClick={() => setAll(true)}>
            {t('Все {n}', { n: st.refs.length })}
          </button>
        )}
      </div>
    </section>
  );
}
