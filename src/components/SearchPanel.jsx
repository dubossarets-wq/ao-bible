// Поиск слов и фраз по переводу панели (или по всем установленным переводам); ссылка вида «Ин 3:16» сразу открывает место.
// Окно помнит последний поиск: запрос и настройки — в localStorage, результаты и прокрутка — в памяти до перезапуска.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, CornerDownLeft, Clock, Loader2, Copy } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { search, queryRegex } from '../core/search.js';
import { parseHumanRef, formatRef, bookMeta, testamentOf } from '../core/books.js';
import { getVerse, ORIGINALS } from '../core/modules.js';
import { plainText } from '../core/verseMarkup.js';
import { usePersistentState, save, load } from '../core/storage.js';
import { shortName } from '../core/moduleShort.js';
import { copyText } from '../core/clipboard.js';
import { quoteVerse, quoteLabel } from './SelectionBar.jsx';
import { Segmented, Switch, Progress } from './ui.jsx';
import { StrongPlaces } from './ConcordanceSheet.jsx';
import { lookupStrong } from '../core/lexicon.js';
import { t } from '../core/i18n.js';

const PAGE = 200;

// Последний поиск по словам — в памяти, пока приложение открыто: при повторном открытии окна
// те же результаты сразу, без нового поиска, и та же прокрутка. { key, results, done, shown, scroll }
let memo = null;

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

export default function SearchPanel({ pane, payload = {}, onClose }) {
  const { panes, bibles, navigate, openSheet, setPaneModule, toast } = useApp();
  const p = panes[pane];
  const module = bibles.find((b) => b.id === p.moduleId) || bibles[0];
  // Явный запрос при открытии (например, из словаря) важнее сохранённого
  const [savedQuery, setSavedQuery] = usePersistentState('searchQuery', '');
  const [query, setQuery] = useState(() => (typeof payload.query === 'string' ? payload.query : savedQuery || ''));
  const [scope, setScope] = usePersistentState('searchScope', 'all');
  const [wholeWord, setWholeWord] = usePersistentState('searchWhole', false);
  const [allMods, setAllMods] = usePersistentState('searchAllModules', false);
  const [withOrig, setWithOrig] = usePersistentState('searchOriginals', false);
  const [history, setHistory] = usePersistentState('searchHistory', []);
  const abort = useRef(null);
  const inputRef = useRef(null);
  const formRef = useRef(null);
  const queryNow = useRef(query);
  queryNow.current = query;

  useEffect(() => {
    if (typeof payload.query === 'string' && ['all', 'OT', 'NT', 'book'].includes(payload.scope)) setScope(payload.scope);
  }, []);
  useEffect(() => setSavedQuery(query), [query]);

  // «Во всех модулях»: открытый перевод первым, затем переводы того же языка, затем остальные.
  // Оригиналы (еврейский и греческий текст) — только по отдельному переключателю.
  // Переключатель виден, только когда кроме открытого есть ещё хотя бы один перевод (не оригинал)
  const hasOrig = bibles.some((b) => ORIGINALS.includes(b.id));
  const canAll = !!module && bibles.some((b) => b.id !== module.id && !ORIGINALS.includes(b.id));
  const targets = useMemo(() => {
    if (!allMods || !canAll) return module ? [module] : [];
    const rest = bibles.filter((b) => b.id !== module.id && (withOrig || !ORIGINALS.includes(b.id)));
    const same = (b) => ((b.language || '') === (module.language || '') ? 0 : 1);
    return [module, ...rest.sort((a, b) => same(a) - same(b))];
  }, [allMods, canAll, withOrig, bibles, module]);
  const multi = targets.length > 1;
  const byId = useMemo(() => new Map(bibles.map((b) => [b.id, b])), [bibles]);
  const targetsKey = targets.map((m) => m.id).join();
  const keyOf = (q) => JSON.stringify([q, scope, scope === 'book' ? p.ref.book : '', wholeWord, targetsKey]);

  // Прежний поиск с теми же условиями уже закончен — показываем его сразу
  const [restored] = useState(() => (memo?.done && memo.key === keyOf(query.trim()) ? memo : null));
  const [results, setResults] = useState(restored ? restored.results : null);
  const [progress, setProgress] = useState(null);
  const [shown, setShownState] = useState(restored ? restored.shown : PAGE);
  const [ran, setRan] = useState(restored ? query.trim() : '');
  const shownKey = useRef(restored ? restored.key : null); // условия, чьи результаты сейчас на экране
  const setShown = (fn) =>
    setShownState((s) => {
      const v = typeof fn === 'function' ? fn(s) : fn;
      if (memo) memo.shown = v;
      return v;
    });

  useEffect(() => {
    // На телефоне при восстановленных результатах клавиатуру не открываем — она закрыла бы список
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    const timer = setTimeout(() => (!restored || !coarse) && inputRef.current?.focus({ preventScroll: true }), 220);
    // Прокрутка списка запоминается, при повторном открытии — на том же месте
    const body = formRef.current?.closest('.sheet-body');
    const onScroll = () => memo && memo.key === shownKey.current && (memo.scroll = body.scrollTop);
    body?.addEventListener('scroll', onScroll, { passive: true });
    if (body && restored?.scroll) requestAnimationFrame(() => requestAnimationFrame(() => (body.scrollTop = restored.scroll)));
    return () => {
      clearTimeout(timer);
      body?.removeEventListener('scroll', onScroll);
      abort.current?.abort();
      save('searchQuery', queryNow.current); // окно закрыли сразу после ввода — запрос всё равно сохранится
      // Запрос, по которому что-то нашлось, — в историю, даже если результат не открывали
      const q = queryNow.current?.trim();
      if (q && q.length > 1 && memo?.results?.length) save('searchHistory', [q, ...load('searchHistory', []).filter((x) => x !== q)].slice(0, 15));
    };
  }, []);

  // Поиск по мере ввода: короткая пауза после нажатия клавиши, прежний поиск отменяется.
  // Ссылка («Ин 3 6», «Быт 1:1») вместо поиска показывает карточку перехода с текстом стиха.
  const [refHit, setRefHit] = useState(null);
  const [strongHit, setStrongHit] = useState(null); // номера Стронга из строки поиска
  const stop = () => {
    abort.current?.abort();
    shownKey.current = null;
    setResults(null);
    setProgress(null);
    setRan('');
  };

  const runSearch = async (q, key) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    shownKey.current = key;
    setResults([]);
    setShown(PAGE);
    setRan(q);
    setProgress({ p: 0, label: t('Поиск…') });
    const acc = [];
    const mine = (memo = { key, results: acc, done: false, shown: PAGE, scroll: 0 });
    const list = targets;
    // Переводы — по одному, книги — по порядку: результаты идут в порядке Библии, интерфейс не замирает
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (ctrl.signal.aborted) return;
      try {
        await search({
          moduleId: m.id,
          query: q,
          scope,
          currentBook: p.ref.book,
          wholeWord,
          signal: ctrl.signal,
          onResult: (batch) => {
            if (ctrl.signal.aborted) return;
            for (const r of batch) acc.push({ ...r, moduleId: m.id });
            setResults([...acc]);
          },
          onProgress: (v, b) => !ctrl.signal.aborted && setProgress({ p: (i + v) / list.length, label: list.length > 1 ? `${shortName(m)} · ${bookMeta(b.id).name}` : bookMeta(b.id).name }),
        });
      } catch {
        /* перевод недоступен — ищем в остальных */
      }
    }
    if (!ctrl.signal.aborted) {
      setProgress(null);
      mine.done = true;
    }
  };

  useEffect(() => {
    const q = query.trim();
    const key = keyOf(q);
    if (key === shownKey.current) return; // эти результаты уже на экране
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
        // Вернулись к последнему законченному поиску — без повторного перебора
        if (memo?.done && memo.key === key) {
          abort.current?.abort();
          shownKey.current = key;
          setProgress(null);
          setRan(q);
          setShownState(memo.shown);
          setResults(memo.results);
          return;
        }
        runSearch(q, key);
      },
      q.length < 4 ? 350 : 220
    );
    return () => clearTimeout(timer);
  }, [query, scope, wholeWord, module.id, targetsKey, scope === 'book' ? p.ref.book : '']);

  const remember = (q) => q && setHistory((h) => [q, ...h.filter((x) => x !== q)].slice(0, 15));

  // Крестик в поле: стирает запрос и результаты, курсор остаётся в поле
  const clear = () => {
    stop();
    memo = null;
    setRefHit(null);
    setStrongHit(null);
    setQuery('');
    inputRef.current?.focus();
  };

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

  // Место из другого перевода открывается в этом переводе
  const open = (r) => {
    remember(ran);
    onClose();
    if (r.moduleId && r.moduleId !== p.moduleId && byId.has(r.moduleId)) setPaneModule(pane, r.moduleId);
    navigate(pane, r, { highlight: ran });
  };

  const copyResult = async (r) => {
    const ok = await copyText(quoteVerse(r.text, quoteLabel([r])));
    toast(ok ? t('Стих скопирован') : t('Не удалось скопировать'), ok ? 'info' : 'error');
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
    <BottomSheet title={t('Поиск')} subtitle={multi ? `${t('Во всех модулях')} · ${targets.length}` : `${module.name} · ${module.title || ''}`} onClose={onClose} initial={2}>
      <form
        ref={formRef}
        className="ref-form search-form"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label htmlFor="search-input" className="sr-only">
          {t('Слово, фраза или ссылка')}
        </label>
        <div className="input-wrap">
          <input
            id="search-input"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Слово, Ин 3:16 или G26')}
            autoComplete="off"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" className="icon-btn subtle search-clear" aria-label={t('Очистить')} title={t('Очистить')} onPointerDown={(e) => e.preventDefault()} onClick={clear}>
              <X size={18} />
            </button>
          )}
        </div>
        <button className="btn primary search-go" type="submit" aria-label={t('Найти')} title={t('Найти')}>
          <Search size={18} />
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
      {canAll && (
        <Switch id="search-all" checked={allMods} onChange={setAllMods} label={t('Во всех модулях')} hint={t('Искать во всех установленных переводах. У каждого места — метка перевода.')} />
      )}
      {canAll && allMods && hasOrig && (
        <Switch id="search-orig" checked={withOrig} onChange={setWithOrig} label={t('И в оригиналах')} hint={t('Еврейский и греческий текст — для поиска слов на иврите и греческом.')} />
      )}

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
        <section className="nav-group search-history">
          <h4>{t('Недавние')}</h4>
          <ul>
            {history.map((h) => (
              <li key={h}>
                <button
                  className="sh-q"
                  onClick={() => {
                    setQuery(h);
                    run(h);
                  }}
                >
                  <Clock size={16} /> <span>{h}</span>
                </button>
                <button className="icon-btn subtle" aria-label={t('Убрать из истории')} onClick={() => setHistory((x) => x.filter((y) => y !== h))}>
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
          <button className="btn small" onClick={() => setHistory([])}>
            {t('Очистить историю')}
          </button>
        </section>
      )}

      {results && (
        <>
          <div className="result-count">
            {progress ? <Loader2 className="spin" size={14} /> : null} {t('Найдено: {n}', { n: results.length })}
            {!progress && results.length === 0 && ` — ${t('попробуйте другую форму слова или отключите «целые слова».')}`}
          </div>
          <ul className="results">
            {results.slice(0, shown).map((r) => {
              const m = byId.get(r.moduleId);
              const ref = formatRef(r);
              return (
                <li key={`${r.moduleId}.${r.book}.${r.chapter}.${r.verse}`} className="result-item">
                  <button className="result-row" onClick={() => open(r)}>
                    <span className="result-head">
                      <span className="xref-ref">{ref}</span>
                      {multi && m && (
                        <span className="result-mod" title={m.title ? `${m.name} — ${m.title}` : m.name}>
                          {shortName(m)}
                        </span>
                      )}
                    </span>
                    <span className="xref-text" dir="auto">
                      <Highlighted text={r.text} re={re} />
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn subtle result-copy"
                    aria-label={`${t('Копировать')}: ${ref}${multi && m ? ` (${m.name})` : ''}`}
                    title={t('Копировать')}
                    onClick={(e) => {
                      e.stopPropagation();
                      copyResult(r);
                    }}
                  >
                    <Copy size={16} />
                  </button>
                </li>
              );
            })}
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
