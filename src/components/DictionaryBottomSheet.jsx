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
import { t, N_ } from '../core/i18n.js';
import { ruInterlinear } from '../core/interlinear.js';

const KIND_LABEL = { strongs: N_('по номерам Стронга'), words: N_('по словам') };

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

function StrongEntry({ num, entry, module, mapping, orig, onOpenStrong, onOpenRef, onOpenAll }) {
  const isHeb = num.startsWith('H');
  // orig — это слово в оригинале стиха (из подстрочника): точная форма с лицом, числом и падежом
  const exact = orig && orig.num === num.replace(/^([HG])0*/, '$1') ? orig : null;
  const morph = exact ? [] : mapping?.mode === 'exact' ? mapping.morph : [];
  return (
    <article className="entry">
      {entry.lemma && (
        <div className={`orig ${isHeb ? 'hebrew' : 'greek'}`} lang={isHeb ? 'he' : 'grc'} dir={isHeb ? 'rtl' : 'ltr'}>
          {entry.lemma}
        </div>
      )}
      <dl className="facts">
        <div>
          <dt>{t('Номер Стронга')}</dt>
          <dd className="mono">{num}</dd>
        </div>
        {entry.xlit && (
          <div>
            <dt>{t('Транслитерация')}</dt>
            <dd>{entry.xlit}</dd>
          </div>
        )}
        {entry.pron && (
          <div>
            <dt>{t('Произношение')}</dt>
            <dd>{entry.pron}</dd>
          </div>
        )}
        <div>
          <dt>{t('Язык')}</dt>
          <dd>{isHeb ? t('иврит / арамейский (ВЗ)') : t('греческий (НЗ)')}</dd>
        </div>
        {exact && (
          <div>
            <dt>{t('В этом стихе')}</dt>
            <dd>
              <span className={isHeb ? 'hebrew' : 'greek'} lang={isHeb ? 'he' : 'grc'} dir={isHeb ? 'rtl' : 'ltr'}>
                {exact.orig}
              </span>
              {exact.origMorph && describeMorph(exact.origMorph).text ? ` — ${describeMorph(exact.origMorph).text}` : ''}
            </dd>
          </div>
        )}
        {morph.length > 0 &&
          morph.map((m) => {
            const d = describeMorph(m);
            return (
              <div key={m}>
                <dt>{t('Грамматическая форма')}</dt>
                <dd>
                  {d.text || t('расшифровка кода не входит в установленные данные')} <span className="mono muted">({m})</span>
                </dd>
              </div>
            );
          })}
      </dl>
      {entry.definition && (
        <section>
          <h4>{t('Значение')}</h4>
          <p>
            <StrongLinks text={entry.definition} onOpen={onOpenStrong} />
          </p>
        </section>
      )}
      {entry.derivation && (
        <section>
          <h4>{t('Происхождение')}</h4>
          <p>
            <StrongLinks text={entry.derivation} onOpen={onOpenStrong} />
          </p>
        </section>
      )}
      {entry.kjv && (
        <section>
          <h4>{t('Переводы в KJV')}</h4>
          <p>{entry.kjv}</p>
        </section>
      )}
      {entry.renderings && (
        <section>
          <h4>{t('Как переведено в синодальном тексте · {n} употр.', { n: entry.count })}</h4>
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
          <h4>{entry.renderings ? t('Первые места употребления') : t('Связанные стихи')}</h4>
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
      {/* Места употребления — после вариантов перевода */}
      <WordStats num={num} onOpenRef={onOpenRef} onOpenAll={onOpenAll && (() => onOpenAll(num, entry.lemma))} />
      <p className="source-note">
        {module.name}
        {module.language === 'en' ? ` · ${t('статья на английском языке')}` : ''} · {module.license}
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
  const [orig, setOrig] = useState(null); // слово оригинала, которому соответствует нажатое слово

  useEffect(() => {
    if (payload.wi == null || !ref) return;
    ruInterlinear(ref)
      .then((ws) => ws?.[payload.wi]?.orig && setOrig(ws[payload.wi]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    lookupWord({ token, ref }).then((r) => {
      setRes(r);
      const pre = payload.preselect;
      const found = pre && r.results.find((x) => x.module.id === pre.moduleId)?.found;
      if (found) setEntryIdx(Math.max(0, found.findIndex((f) => f.key === pre.key)));
      // Нажали на номер Стронга или слово подстрочника — сразу статья первого словаря Стронга (русский — первым)
      if (!pre && payload.autoOpen) {
        const first = r.results.find((x) => x.module.dictionaryKind === 'strongs');
        if (first) setSelected(first.module.id);
      }
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
    <BottomSheet title={top ? t('Статья {num}', { num: top.num }) : t('Слово: {word}', { word: token.text })} subtitle={subtitle} onClose={onClose} onBack={back} initial={payload.initial ?? 1}>
      {!res && (
        <div className="loading">
          <Loader2 className="spin" size={20} /> {t('Ищу в словарях…')}
        </div>
      )}
      {res && !top && (
        <div className="mapping">
          {mapping.mode === 'exact' && (
            <div className="map-line">
              <span className="badge ok">{t('Точная привязка')}</span>
              <span className="muted">{t('слово размечено в переводе:')}</span>
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
                {t('Перевод не размечен номерами Стронга. Варианты подобраны по симфонии RST+ — это приблизительное соответствие, одно русское слово может передавать разные слова оригинала:')}{' '}
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
              <span>{t('Для этого слова нет привязки к оригиналу ни в переводе, ни в установленных симфониях.')}</span>
            </div>
          )}
        </div>
      )}

      {res && !current && !top && (
        <>
          {res.results.length === 0 ? (
            <Empty icon={BookText} title={t('Статей не найдено')}>
              {res.dictionaryCount === 0 ? `${t('Нет включённых словарей.')} ` : `${t('Проверено словарей: {n}.', { n: res.dictionaryCount })} `}
              <button className="link-inline" onClick={() => openSheet('library', pane, { tab: 'installed' })}>
                {t('Открыть библиотеку модулей')}
              </button>
            </Empty>
          ) : (
            <ul className="dict-list" aria-label={t('Словари со статьями')}>
              {res.results.map((r) => (
                <li key={r.module.id}>
                  <button className="dict-row" onClick={() => (setSelected(r.module.id), setEntryIdx(0))}>
                    <BookText size={20} className="dict-icon" />
                    <span className="dict-text">
                      <span className="dict-name">{r.module.name}</span>
                      <span className="dict-desc">
                        {r.found.map((f) => f.entry.lemma || f.entry.word || f.key).join(' · ')}
                        {r.found.some((f) => f.match === 'stem') ? ` · ${t('совпадение по основе слова')}` : ''}
                      </span>
                    </span>
                    <span className="dict-count">{r.found.length > 1 ? t('{n} статьи', { n: r.found.length }) : KIND_LABEL[r.module.dictionaryKind] ? t(KIND_LABEL[r.module.dictionaryKind]) : ''}</span>
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
            <div className="tabs" role="tablist" aria-label={t('Словари')}>
              {view.results.map((r) => (
                <button key={r.module.id} role="tab" aria-selected={r.module.id === current.module.id} className={r.module.id === current.module.id ? 'on' : ''} onClick={() => (setSelected(r.module.id), setEntryIdx(0))}>
                  {r.module.name}
                </button>
              ))}
            </div>
          )}
          {current.found.length > 1 && (
            <div className="tabs sub" role="tablist" aria-label={t('Статьи')}>
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
              return <StrongEntry num={f.key} entry={f.entry} module={current.module} mapping={top ? null : mapping} orig={top ? null : orig} onOpenAll={(num, lemma) => openSheet('concord', pane, { num, lemma, back: { kind: 'dict', payload } })} onOpenStrong={openStrong} onOpenRef={openRef} />;
            return (
              <article className="entry">
                <h3 className="entry-word">{f.entry.word || f.key}</h3>
                {f.match === 'stem' && <p className="warn small">{t('Найдено по основе слова «{word}» — проверьте, что это та же лексема.', { word: token.text })}</p>}
                {f.match === 'root' && <p className="warn small">{t('Найдено по корню слова «{word}» (без приставки).', { word: token.text })}</p>}
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
