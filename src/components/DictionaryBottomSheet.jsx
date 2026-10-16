// Нижняя словарная панель: слово → список словарей, где есть статья → статья выбранного словаря.
// Переключение между словарями — вкладками, не закрывая панель.
import React, { useEffect, useState } from 'react';
import { BookText, AlertTriangle, Link2, Loader2, Library } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { lookupWord, lookupStrong } from '../core/lexicon.js';
import { describeMorph } from '../core/morph.js';
import { formatRef, parseOsisRef, bookMeta } from '../core/books.js';
import { Empty } from './ui.jsx';
import LinkedText from './LinkedText.jsx';
import WordStats from './WordStats.jsx';

const KIND_LABEL = { strongs: 'по номерам Стронга', words: 'по словам' };

// «from H24 (אָבִיב)» → кликабельные номера Стронга
function StrongLinks({ text, onOpen }) {
  if (!text) return null;
  const parts = text.split(/([HG]\d+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^[HG]\d+$/.test(p) ? (
          <button key={i} className="link-inline" onClick={() => onOpen(p)}>
            {p}
          </button>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
}

function StrongEntry({ num, entry, module, mapping, onOpenStrong, onOpenRef }) {
  const isHeb = num.startsWith('H');
  const morph = mapping?.mode === 'exact' ? mapping.morph : [];
  return (
    <article className="entry">
      {entry.lemma && (
        <div className={`orig ${isHeb ? 'hebrew' : 'greek'}`} lang={isHeb ? 'he' : 'grc'} dir={isHeb ? 'rtl' : 'ltr'}>
          {entry.lemma}
        </div>
      )}
      <dl className="facts">
        <div>
          <dt>Номер Стронга</dt>
          <dd className="mono">{num}</dd>
        </div>
        {entry.xlit && (
          <div>
            <dt>Транслитерация</dt>
            <dd>{entry.xlit}</dd>
          </div>
        )}
        {entry.pron && (
          <div>
            <dt>Произношение</dt>
            <dd>{entry.pron}</dd>
          </div>
        )}
        <div>
          <dt>Язык</dt>
          <dd>{isHeb ? 'иврит / арамейский (ВЗ)' : 'греческий (НЗ)'}</dd>
        </div>
        {morph.length > 0 &&
          morph.map((m) => {
            const d = describeMorph(m);
            return (
              <div key={m}>
                <dt>Грамматическая форма</dt>
                <dd>
                  {d.text || 'расшифровка кода не входит в установленные данные'} <span className="mono muted">({m})</span>
                </dd>
              </div>
            );
          })}
      </dl>
      {entry.definition && (
        <section>
          <h4>Значение</h4>
          <p>
            <StrongLinks text={entry.definition} onOpen={onOpenStrong} />
          </p>
        </section>
      )}
      {entry.derivation && (
        <section>
          <h4>Происхождение</h4>
          <p>
            <StrongLinks text={entry.derivation} onOpen={onOpenStrong} />
          </p>
        </section>
      )}
      {entry.kjv && (
        <section>
          <h4>Переводы в KJV</h4>
          <p>{entry.kjv}</p>
        </section>
      )}
      <WordStats num={num} onOpenRef={onOpenRef} />
      {entry.renderings && (
        <section>
          <h4>Как переведено в синодальном тексте · {entry.count} употр.</h4>
          <ul className="renderings">
            {entry.renderings.map(([w, n]) => (
              <li key={w}>
                <span className="r-word">{w}</span>
                <span className="r-bar" style={{ '--w': `${Math.max(4, (n / entry.renderings[0][1]) * 100)}%` }} />
                <span className="r-n">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {entry.text && (
        <section>
          <p className="prewrap">{entry.text}</p>
        </section>
      )}
      {entry.refs?.length > 0 && (
        <section>
          <h4>{entry.renderings ? 'Первые места употребления' : 'Связанные стихи'}</h4>
          <div className="chips">
            {entry.refs.map((r) => {
              const p = parseOsisRef(r);
              return p ? (
                <button key={r} className="chip" onClick={() => onOpenRef(p)}>
                  {formatRef(p)}
                </button>
              ) : null;
            })}
          </div>
        </section>
      )}
      <p className="source-note">
        {module.name}
        {module.language === 'en' ? ' · статья на английском языке' : ''} · {module.license}
      </p>
    </article>
  );
}

export default function DictionaryBottomSheet({ pane, payload, onClose }) {
  const { openInOther, openSheet } = useApp();
  const { token, ref } = payload;
  const [res, setRes] = useState(null);
  // preselect — словарь и статья, выбранные во всплывающей выборке над словом
  const [selected, setSelected] = useState(payload.preselect?.moduleId || null); // moduleId
  const [stack, setStack] = useState([]); // переходы по ссылкам Стронга внутри статьи
  const [entryIdx, setEntryIdx] = useState(0);

  useEffect(() => {
    lookupWord({ token, ref }).then((r) => {
      setRes(r);
      const pre = payload.preselect;
      const found = pre && r.results.find((x) => x.module.id === pre.moduleId)?.found;
      if (found) setEntryIdx(Math.max(0, found.findIndex((f) => f.key === pre.key)));
    });
  }, []);

  const openStrong = async (num) => {
    const results = await lookupStrong(num);
    if (results.length) setStack((s) => [...s, { num, results }]);
  };

  const top = stack[stack.length - 1];
  const view = top ? { results: top.results, mapping: { mode: 'exact', strongs: [top.num], morph: [] } } : res;
  const current = view?.results.find((r) => r.module.id === selected) || (top ? view.results[0] : null);

  const back = top ? () => setStack((s) => s.slice(0, -1)) : selected ? () => setSelected(null) : null;
  const openRef = (r) => {
    onClose();
    openInOther(pane, r);
  };

  const mapping = res?.mapping;
  const subtitle = `${bookMeta(ref.book).short} ${ref.chapter}:${ref.verse}`;

  return (
    <BottomSheet title={top ? `Статья ${top.num}` : `Слово: ${token.text}`} subtitle={subtitle} onClose={onClose} onBack={back} initial={payload.initial ?? 1}>
      {!res && (
        <div className="loading">
          <Loader2 className="spin" size={20} /> Ищу в словарях…
        </div>
      )}
      {res && !top && (
        <div className="mapping">
          {mapping.mode === 'exact' && (
            <div className="map-line">
              <span className="badge ok">Точная привязка</span>
              <span className="muted">слово размечено в переводе:</span>
              {mapping.strongs.map((s) => (
                <span key={s} className="mono strong-chip">
                  {s}
                </span>
              ))}
            </div>
          )}
          {mapping.mode === 'approx' && (
            <div className="warn">
              <AlertTriangle size={16} />
              <span>
                Перевод не размечен номерами Стронга. Варианты подобраны по симфонии RST+ — это приблизительное соответствие, одно русское слово может
                передавать разные слова оригинала:{' '}
                {mapping.strongs.map((s) => (
                  <span key={s} className="mono strong-chip">
                    {s} · {Math.round(mapping.weights[s] * 100)}%
                  </span>
                ))}
              </span>
            </div>
          )}
          {mapping.mode === 'none' && res.results.length === 0 && (
            <div className="warn">
              <AlertTriangle size={16} />
              <span>Для этого слова нет привязки к оригиналу ни в переводе, ни в установленных симфониях.</span>
            </div>
          )}
        </div>
      )}

      {res && !current && !top && (
        <>
          {res.results.length === 0 ? (
            <Empty icon={BookText} title="Статей не найдено">
              {res.dictionaryCount === 0 ? 'Нет включённых словарей. ' : `Проверено словарей: ${res.dictionaryCount}. `}
              <button className="link-inline" onClick={() => openSheet('library', pane, { tab: 'installed' })}>
                Открыть библиотеку модулей
              </button>
            </Empty>
          ) : (
            <ul className="dict-list" aria-label="Словари со статьями">
              {res.results.map((r) => (
                <li key={r.module.id}>
                  <button className="dict-row" onClick={() => (setSelected(r.module.id), setEntryIdx(0))}>
                    <BookText size={20} className="dict-icon" />
                    <span className="dict-text">
                      <span className="dict-name">{r.module.name}</span>
                      <span className="dict-desc">
                        {r.found.map((f) => f.entry.lemma || f.entry.word || f.key).join(' · ')}
                        {r.found.some((f) => f.match === 'stem') ? ' · совпадение по основе слова' : ''}
                      </span>
                    </span>
                    <span className="dict-count">{r.found.length > 1 ? `${r.found.length} статьи` : KIND_LABEL[r.module.dictionaryKind] || ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {current && (
        <>
          {!top && view.results.length > 1 && (
            <div className="tabs" role="tablist" aria-label="Словари">
              {view.results.map((r) => (
                <button key={r.module.id} role="tab" aria-selected={r.module.id === current.module.id} className={r.module.id === current.module.id ? 'on' : ''} onClick={() => (setSelected(r.module.id), setEntryIdx(0))}>
                  {r.module.name}
                </button>
              ))}
            </div>
          )}
          {current.found.length > 1 && (
            <div className="tabs sub" role="tablist" aria-label="Статьи">
              {current.found.map((f, i) => (
                <button key={f.key} role="tab" aria-selected={i === entryIdx} className={i === entryIdx ? 'on' : ''} onClick={() => setEntryIdx(i)}>
                  {f.key}
                  {f.entry.lemma ? ` ${f.entry.lemma}` : ''}
                </button>
              ))}
            </div>
          )}
          {(() => {
            const f = current.found[Math.min(entryIdx, current.found.length - 1)];
            if (current.module.dictionaryKind === 'strongs')
              return <StrongEntry num={f.key} entry={f.entry} module={current.module} mapping={top ? null : mapping} onOpenStrong={openStrong} onOpenRef={openRef} />;
            return (
              <article className="entry">
                <h3 className="entry-word">{f.entry.word || f.key}</h3>
                {f.match === 'stem' && <p className="warn small">Найдено по основе слова «{token.text}» — проверьте, что это та же лексема.</p>}
                {f.match === 'root' && <p className="warn small">Найдено по корню слова «{token.text}» (без приставки).</p>}
                {f.entry.original && <div className="orig">{f.entry.original}</div>}
                <p className="prewrap">
                  <LinkedText text={f.entry.text || f.entry.definition} onOpen={openRef} />
                </p>
                {f.entry.refs?.length > 0 && (
                  <div className="chips">
                    {f.entry.refs.map((r) => {
                      const p = parseOsisRef(r);
                      return p ? (
                        <button key={r} className="chip" onClick={() => openRef(p)}>
                          <Link2 size={13} /> {formatRef(p)}
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
                <p className="source-note">
                  {current.module.name} · {current.module.license}
                </p>
              </article>
            );
          })()}
        </>
      )}

    </BottomSheet>
  );
}
