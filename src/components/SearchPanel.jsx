// Поиск слов и фраз по переводу панели; ссылка вида «Ин 3:16» сразу открывает место.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, CornerDownLeft, Clock, Loader2 } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { search, queryRegex } from '../core/search.js';
import { parseHumanRef, formatRef, bookMeta } from '../core/books.js';
import { usePersistentState } from '../core/storage.js';
import { Segmented, Switch, Progress } from './ui.jsx';

const PAGE = 200;

function Highlighted({ text, re }) {
  if (!re) return text;
  const out = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<mark key={m.index}>{m[0]}</mark>);
    last = m.index + m[0].length;
    if (!m[0].length) break;
  }
  out.push(text.slice(last));
  return out;
}

export default function SearchPanel({ pane, onClose }) {
  const { panes, bibles, navigate } = useApp();
  const p = panes[pane];
  const module = bibles.find((b) => b.id === p.moduleId) || bibles[0];
  const [query, setQuery] = useState('');
  const [scope, setScope] = usePersistentState('searchScope', 'all');
  const [wholeWord, setWholeWord] = usePersistentState('searchWhole', false);
  const [history, setHistory] = usePersistentState('searchHistory', []);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState(null);
  const [shown, setShown] = useState(PAGE);
  const [ran, setRan] = useState('');
  const abort = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 220);
    return () => abort.current?.abort();
  }, []);

  const run = async (q = query) => {
    q = q.trim();
    if (!q) return;
    const ref = parseHumanRef(q);
    if (ref && module.books.some((b) => b.id === ref.book) && /\d/.test(q)) {
      onClose();
      navigate(pane, ref);
      return;
    }
    if (q.length < 2) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setHistory((h) => [q, ...h.filter((x) => x !== q)].slice(0, 15));
    setResults([]);
    setShown(PAGE);
    setRan(q);
    setProgress({ p: 0, label: 'Поиск…' });
    const acc = [];
    await search({
      moduleId: module.id,
      query: q,
      scope,
      currentBook: p.ref.book,
      wholeWord,
      signal: ctrl.signal,
      onResult: (batch) => {
        acc.push(...batch);
        setResults([...acc]);
      },
      onProgress: (v, b) => setProgress({ p: v, label: `${bookMeta(b.id).name}` }),
    });
    if (!ctrl.signal.aborted) setProgress(null);
  };

  const re = useMemo(() => (ran ? queryRegex(ran, { wholeWord }) : null), [ran, wholeWord]);

  const open = (r) => {
    onClose();
    navigate(pane, r, { highlight: ran });
  };

  return (
    <BottomSheet title="Поиск" subtitle={`${module.name} · ${module.title || ''}`} onClose={onClose} initial={2}>
      <form
        className="ref-form"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label htmlFor="search-input" className="sr-only">
          Слово, фраза или ссылка
        </label>
        <div className="input-wrap">
          <Search size={18} className="input-icon" />
          <input
            id="search-input"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Слово, фраза или ссылка (Ин 3:16)"
            autoComplete="off"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" className="icon-btn subtle" aria-label="Очистить" onClick={() => setQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>
        <button className="btn primary" type="submit" aria-label="Искать">
          <CornerDownLeft size={18} />
        </button>
      </form>
      <Segmented
        id="search-scope"
        value={scope}
        onChange={setScope}
        options={[
          ['all', 'Вся Библия'],
          ['OT', 'ВЗ'],
          ['NT', 'НЗ'],
          ['book', bookMeta(p.ref.book).short],
        ]}
      />
      <Switch id="search-whole" checked={wholeWord} onChange={setWholeWord} label="Только целые слова" hint="Иначе «свет» найдёт и «светильник»" />

      {progress && <Progress value={progress.p} label={progress.label} />}

      {results === null && history.length > 0 && (
        <section className="nav-group">
          <h4>Недавние запросы</h4>
          <div className="chips">
            {history.map((h) => (
              <button
                key={h}
                className="chip"
                onClick={() => {
                  setQuery(h);
                  run(h);
                }}
              >
                <Clock size={13} /> {h}
              </button>
            ))}
            <button className="chip ghost" onClick={() => setHistory([])}>
              Очистить
            </button>
          </div>
        </section>
      )}

      {results && (
        <>
          <div className="result-count">
            {progress ? <Loader2 className="spin" size={14} /> : null} Найдено: {results.length}
            {!progress && results.length === 0 && ' — попробуйте другую форму слова или отключите «целые слова».'}
          </div>
          <ul className="results">
            {results.slice(0, shown).map((r) => (
              <li key={`${r.book}.${r.chapter}.${r.verse}`}>
                <button className="result-row" onClick={() => open(r)}>
                  <span className="xref-ref">{formatRef(r)}</span>
                  <span className="xref-text">
                    <Highlighted text={r.text} re={re} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {results.length > shown && (
            <button className="btn wide" onClick={() => setShown((s) => s + PAGE)}>
              Показать ещё ({results.length - shown})
            </button>
          )}
        </>
      )}
    </BottomSheet>
  );
}
