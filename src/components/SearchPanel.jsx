// Поиск слов и фраз по переводу панели; ссылка вида «Ин 3:16» сразу открывает место.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, CornerDownLeft, Clock, Loader2 } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { search, queryRegex } from '../core/search.js';
import { parseHumanRef, formatRef, bookMeta, testamentOf } from '../core/books.js';
import { getVerse } from '../core/modules.js';
import { plainText } from '../core/verseMarkup.js';
import { usePersistentState } from '../core/storage.js';
import { Segmented, Switch, Progress } from './ui.jsx';
import { StrongPlaces } from './ConcordanceSheet.jsx';
import { lookupStrong } from '../core/lexicon.js';
import { t } from '../core/i18n.js';

const PAGE = 200;

// Номер Стронга в строке поиска: G26, H7225, «Г26», «Н7225»/«Е7225» (еврейский) или просто 3056 (оба Завета)
export function strongQuery(q) {
  const m = /^\s*([HGhgНнГгЕе]?)\s*0*(\d{1,4})\s*$/.exec(q);
  if (!m || +m[2] === 0) return null;
  const l = m[1].toUpperCase();
  const pre = l === 'G' || l === 'Г' ? ['G'] : l ? ['H'] : ['H', 'G'];
  return pre.map((x) => x + +m[2]);
}

// Карточка номера Стронга: слово оригинала, чтение, краткое значение (нажатие — статья) и все места
function StrongCard({ num, filter, onOpen, onArticle }) {
  const [e, setE] = useState(undefined);
  useEffect(() => {
    lookupStrong(num).then((r) => setE(r.find((x) => x.module.dictionaryKind === 'strongs' && x.module.id !== 'rst-symphony')?.found[0]?.entry || null));
  }, [num]);
  if (e === null) return null; // такого номера нет в словарях
  const heb = num.startsWith('H');
  return (
    <section className="strong-card">
      <button className="strong-head" onClick={onArticle}>
        <span className="strong-num">{t('Номер Стронга')} {num}</span>
        {e?.lemma && (
          <span className={`strong-lemma ${heb ? 'hebrew' : 'greek'}`} dir={heb ? 'rtl' : 'ltr'} lang={heb ? 'he' : 'grc'}>
            {e.lemma}
          </span>
        )}
        {e?.xlit && <span className="muted"> {e.xlit}</span>}
        {e?.definition && <span className="strong-def">{e.definition.length > 160 ? e.definition.slice(0, 160) + '…' : e.definition}</span>}
        <span className="strong-more">{t('Статья словаря')} →</span>
      </button>
      <StrongPlaces num={num} filter={filter} onOpen={onOpen} />
    </section>
  );
}

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
  const { panes, bibles, navigate, openSheet } = useApp();
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

  // Поиск по мере ввода: короткая пауза после нажатия клавиши, прежний поиск отменяется.
  // Ссылка («Ин 3 6», «Быт 1:1») вместо поиска показывает карточку перехода с текстом стиха.
  const [refHit, setRefHit] = useState(null);
  const [strongHit, setStrongHit] = useState(null); // номера Стронга из строки поиска
  const stop = () => {
    abort.current?.abort();
    setResults(null);
    setProgress(null);
    setRan('');
  };

  const runSearch = async (q) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setResults([]);
    setShown(PAGE);
    setRan(q);
    setProgress({ p: 0, label: t('Поиск…') });
    const acc = [];
    // Книги перебираются по порядку перевода — результаты идут в порядке Библии
    await search({
      moduleId: module.id,
      query: q,
      scope,
      currentBook: p.ref.book,
      wholeWord,
      signal: ctrl.signal,
      onResult: (batch) => {
        if (ctrl.signal.aborted) return;
        acc.push(...batch);
        setResults([...acc]);
      },
      onProgress: (v, b) => !ctrl.signal.aborted && setProgress({ p: v, label: `${bookMeta(b.id).name}` }),
    });
    if (!ctrl.signal.aborted) setProgress(null);
  };

  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(
      async () => {
        const sq = strongQuery(q);
        if (sq) {
          stop();
          setRefHit(null);
          setStrongHit(sq);
          return;
        }
        setStrongHit(null);
        const r = /\d/.test(q) ? parseHumanRef(q) : null;
        if (r && module.books.some((b) => b.id === r.book)) {
          stop();
          const v = await getVerse(module.id, r);
          setRefHit({ ref: r, text: v ? plainText(v) : null });
          return;
        }
        setRefHit(null);
        if (q.length < 2) return stop();
        runSearch(q);
      },
      q.length < 4 ? 350 : 220
    );
    return () => clearTimeout(timer);
  }, [query, scope, wholeWord, module.id]);

  const remember = (q) => q && setHistory((h) => [q, ...h.filter((x) => x !== q)].slice(0, 15));

  const goRef = (r) => {
    remember(query.trim());
    onClose();
    navigate(pane, r);
  };

  const run = (q = query) => {
    q = q.trim();
    if (!q) return;
    if (refHit && q === query.trim()) return goRef(refHit.ref);
    if (q !== query) setQuery(q);
    remember(q);
  };

  const re = useMemo(() => (ran ? queryRegex(ran, { wholeWord }) : null), [ran, wholeWord]);

  const open = (r) => {
    remember(ran);
    onClose();
    navigate(pane, r, { highlight: ran });
  };

  // Места номера Стронга — в выбранной части Библии
  const strongFilter = useMemo(
    () => (scope === 'all' ? null : scope === 'book' ? (r) => r.book === p.ref.book : (r) => testamentOf(r.book) === scope),
    [scope, p.ref.book]
  );
  const openStrongPlace = (r) => {
    remember(query.trim());
    onClose();
    navigate(pane, r);
  };

  return (
    <BottomSheet title={t('Поиск')} subtitle={`${module.name} · ${module.title || ''}`} onClose={onClose} initial={2}>
      <form
        className="ref-form"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label htmlFor="search-input" className="sr-only">
          {t('Слово, фраза или ссылка')}
        </label>
        <div className="input-wrap">
          <Search size={18} className="input-icon" />
          <input
            id="search-input"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Слово, ссылка (Ин 3:16) или номер Стронга (G26)')}
            autoComplete="off"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" className="icon-btn subtle" aria-label={t('Очистить')} onClick={() => setQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>
        <button className="btn primary" type="submit" aria-label={t('Искать')}>
          <CornerDownLeft size={18} />
        </button>
      </form>
      <Segmented
        id="search-scope"
        value={scope}
        onChange={setScope}
        options={[
          ['all', t('Вся Библия')],
          ['OT', t('ВЗ')],
          ['NT', t('НЗ')],
          ['book', bookMeta(p.ref.book).short],
        ]}
      />
      <Switch id="search-whole" checked={wholeWord} onChange={setWholeWord} label={t('Только целые слова')} hint={t('Иначе «свет» найдёт и «светильник»')} />

      {refHit && (
        <button className="ref-hit" onClick={() => goRef(refHit.ref)}>
          <span className="ref-hit-title">
            <CornerDownLeft size={15} /> {t('Перейти: {ref}', { ref: formatRef(refHit.ref, { full: true }) })}
          </span>
          {refHit.text ? <span className="xref-text">{refHit.text}</span> : <span className="muted">{t('В переводе {module} нет такого стиха.', { module: module.name })}</span>}
        </button>
      )}
      {strongHit?.map((num) => (
        <StrongCard
          key={num}
          num={num}
          filter={strongFilter}
          onOpen={openStrongPlace}
          onArticle={() => (remember(query.trim()), openSheet('dict', pane, { token: { text: num, strongs: [num] }, ref: p.ref, autoOpen: true, initial: 'full' }))}
        />
      ))}
      {progress && <Progress value={progress.p} label={progress.label} />}

      {results === null && !refHit && !strongHit && history.length > 0 && (
        <section className="nav-group">
          <h4>{t('Недавние запросы')}</h4>
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
              {t('Очистить')}
            </button>
          </div>
        </section>
      )}

      {results && (
        <>
          <div className="result-count">
            {progress ? <Loader2 className="spin" size={14} /> : null} {t('Найдено: {n}', { n: results.length })}
            {!progress && results.length === 0 && ` — ${t('попробуйте другую форму слова или отключите «целые слова».')}`}
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
              {t('Показать ещё ({n})', { n: results.length - shown })}
            </button>
          )}
        </>
      )}
    </BottomSheet>
  );
}
