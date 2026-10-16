// Быстрый выбор книги → главы → стиха. Сверху — поле для прямого ввода ссылки («Ин 3:16»).
import React, { useMemo, useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { parseHumanRef, testamentOf, bookMeta } from '../core/books.js';
import { groupByCategory, categoryOf } from '../core/bookCategories.js';
import { t, N_ } from '../core/i18n.js';

export default function BookNavigator({ pane, onClose }) {
  const { panes, bibles, navigate } = useApp();
  const p = panes[pane];
  const module = bibles.find((b) => b.id === p.moduleId) || bibles[0];
  const [book, setBook] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [query, setQuery] = useState('');
  const [err, setErr] = useState('');

  const groups = useMemo(() => {
    const ot = module.books.filter((b) => testamentOf(b.id) === 'OT');
    const nt = module.books.filter((b) => testamentOf(b.id) === 'NT');
    const ap = module.books.filter((b) => testamentOf(b.id) === 'AP');
    return [
      [N_('Ветхий Завет'), ot],
      [N_('Новый Завет'), nt],
      [N_('Апокрифы'), ap],
    ].filter(([, l]) => l.length);
  }, [module]);

  const go = (ref) => {
    onClose();
    navigate(pane, ref);
  };

  const submit = (e) => {
    e.preventDefault();
    const r = parseHumanRef(query);
    if (!r) return setErr(t('Не понял ссылку. Пример: «Ин 3:16», «Быт 1», «1 Кор 13:4».'));
    const b = module.books.find((x) => x.id === r.book);
    if (!b) return setErr(t('В переводе {module} нет этой книги.', { module: module.name }));
    if (r.chapter > b.verses.length) return setErr(t('В книге «{book}» {n} глав.', { book: b.name, n: b.verses.length }));
    go({ book: r.book, chapter: r.chapter, verse: Math.min(r.verse, b.verses[r.chapter - 1] || 1) });
  };

  const selBook = book && module.books.find((b) => b.id === book);
  const title = selBook ? (chapter ? `${selBook.name} ${chapter}` : selBook.name) : t('Перейти');
  const back = chapter ? () => setChapter(null) : book ? () => setBook(null) : null;

  return (
    <BottomSheet
      title={title}
      subtitle={selBook ? `${t(categoryOf(selBook.id).name)} · ${chapter ? t('выберите стих') : t('выберите главу')}` : module.title || module.name}
      onClose={onClose}
      onBack={back}
      initial={2}
    >
      {!book && (
        <>
          <form className="ref-form" onSubmit={submit}>
            <label htmlFor="ref-input" className="sr-only">
              {t('Ссылка')}
            </label>
            <input id="ref-input" value={query} onChange={(e) => (setQuery(e.target.value), setErr(''))} placeholder={t('Ссылка, например: Ин 3:16')} autoComplete="off" enterKeyHint="go" />
            <button className="btn primary" type="submit" aria-label={t('Перейти')}>
              <CornerDownLeft size={18} />
            </button>
          </form>
          {err && <p className="error-text small">{err}</p>}
          {groups.map(([label, list]) => (
            <section key={label} className="nav-group">
              <h4>{t(label)}</h4>
              {/* Разделы (Пятикнижие, пророки, Евангелия…) — каждый своим спокойным цветом */}
              {groupByCategory(list).map((cat) => (
                <div key={cat.id} className="book-cat" style={{ '--c': cat.color }}>
                  <div className="book-cat-head">
                    <i aria-hidden="true" />
                    {t(cat.name)}
                    <span>{cat.list.length}</span>
                  </div>
                  <div className="book-grid">
                    {cat.list.map((b) => (
                      <button key={b.id} className={`book-cell ${p.ref.book === b.id ? 'on' : ''}`} onClick={() => setBook(b.id)} title={`${b.name} · ${t(cat.name)}`}>
                        <span className="bc-short">
                          {b.short.replace(/\.$/, '')}
                          {bookMeta(b.id).dc && <sup className="bc-dc" title={t('Неканоническая книга')}>*</sup>}
                        </span>
                        <span className="bc-name">{b.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </>
      )}
      {selBook && !chapter && (
        <div className="num-grid" style={{ '--c': categoryOf(selBook.id).color }}>
          {selBook.verses.map((_, i) => (
            <button key={i} className={p.ref.book === book && p.ref.chapter === i + 1 ? 'on' : ''} onClick={() => setChapter(i + 1)}>
              {i + 1}
            </button>
          ))}
        </div>
      )}
      {selBook && chapter && (
        <>
          <button className="btn wide" onClick={() => go({ book, chapter, verse: 1 })}>
            {t('Читать главу {n} с начала', { n: chapter })}
          </button>
          <div className="num-grid" style={{ '--c': categoryOf(selBook.id).color }}>
            {Array.from({ length: selBook.verses[chapter - 1] }, (_, i) => (
              <button key={i} onClick={() => go({ book, chapter, verse: i + 1 })}>
                {i + 1}
              </button>
            ))}
          </div>
        </>
      )}
    </BottomSheet>
  );
}
