// Стронг — параллельным окном на половину экрана (как второе окно Библии): текст остаётся рядом и листается.
// Вверху — строка окна: какие словари показывать, номер (у слова с несколькими номерами — каждый), «Где встречается»,
// назад / вперёд по просмотренным статьям, закрыть. Ниже — слово оригинала и статьи всех словарей Стронга подряд
// (русский Стронг первым), варианты перевода в синодальном тексте и места употребления.
import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Search, Library, Check, Loader2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { listModules } from '../core/modules.js';
import { lookupStrong } from '../core/lexicon.js';
import { describeMorph } from '../core/morph.js';
import { formatRef, parseOsisRef } from '../core/books.js';
import { ruInterlinear } from '../core/interlinear.js';
import { load, save } from '../core/storage.js';
import { StrongLinks, SayButton } from './DictionaryBottomSheet.jsx';
import WordStats from './WordStats.jsx';
import { t } from '../core/i18n.js';

const norm = (n) => n.replace(/^([HG])0*/, '$1');

// Какие словари Стронга скрыты (выбор в «Словари»); остальные показываются все подряд
function useHidden() {
  const [hidden, setHidden] = useState(() => load('strongHidden', []));
  useEffect(() => save('strongHidden', hidden), [hidden]);
  return [hidden, setHidden];
}

// Статья одного словаря: значение, происхождение, KJV, текст, варианты перевода, связанные стихи
function Section({ module, entry, onOpenStrong, onOpenRef }) {
  return (
    <section className="sp-sec">
      <h4 className="sp-dict">{module.name}</h4>
      {entry.definition && (
        <p>
          <StrongLinks text={entry.definition} onOpen={onOpenStrong} />
        </p>
      )}
      {entry.derivation && (
        <p className="sp-muted">
          <b>{t('Происхождение')}:</b> <StrongLinks text={entry.derivation} onOpen={onOpenStrong} />
        </p>
      )}
      {entry.kjv && (
        <p className="sp-muted">
          <b>KJV:</b> {entry.kjv}
        </p>
      )}
      {entry.text && <p className="prewrap">{entry.text}</p>}
      {entry.renderings && (
        <>
          <p className="sp-muted">{t('Как переведено в синодальном тексте · {n} употр.', { n: entry.count })}</p>
          <ul className="renderings">
            {entry.renderings.map(([w, n]) => (
              <li key={w}>
                <span className="r-word">{w}</span>
                <span className="r-bar" style={{ '--w': `${Math.max(4, (n / entry.renderings[0][1]) * 100)}%` }} />
                <span className="r-n">{n}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {entry.refs?.length > 0 && !entry.renderings && (
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
      )}
      <p className="source-note">{module.license}</p>
    </section>
  );
}

export default function StrongPanel() {
  const { strong, closeStrong, navigate, openSheet } = useApp();
  // История просмотра: [{ num, nums, ref, token, wi, origWord, morph }], idx — текущая
  const [hist, setHist] = useState({ list: [], idx: -1 });
  const [res, setRes] = useState(null); // статьи текущего номера по словарям
  const [orig, setOrig] = useState(null); // слово оригинала в этом стихе (из подстрочника)
  const [all, setAll] = useState([]); // все словари Стронга (для выбора)
  const [hidden, setHidden] = useHidden();
  const [pick, setPick] = useState(false);
  const body = useRef(null);

  // Новое слово из выборки — в историю (вперёд — отбрасывается)
  useEffect(() => {
    if (!strong) return void setHist({ list: [], idx: -1 });
    setHist((h) => {
      const list = [...h.list.slice(0, h.idx + 1), strong].slice(-50);
      return { list, idx: list.length - 1 };
    });
  }, [strong?.id]);

  const cur = hist.list[hist.idx];
  useEffect(() => {
    listModules().then((ms) => setAll(ms.filter((m) => m.type === 'dictionary' && m.dictionaryKind === 'strongs' && m.enabled !== false)));
  }, []);
  useEffect(() => {
    if (!cur) return;
    let live = true;
    setRes(null);
    lookupStrong(cur.num).then((r) => live && setRes(r));
    setOrig(null);
    if (cur.origWord) setOrig({ orig: cur.origWord.text, origMorph: cur.origWord.morph, num: cur.origWord.num });
    else if (cur.wi != null && cur.ref)
      ruInterlinear(cur.ref)
        .then((ws) => live && ws?.[cur.wi]?.orig && setOrig(ws[cur.wi]))
        .catch(() => {});
    body.current?.scrollTo(0, 0);
    return () => {
      live = false;
    };
  }, [cur?.num, cur?.id, hist.idx]);

  if (!strong || !cur) return null;
  const go = (d) => setHist((h) => ({ ...h, idx: Math.max(0, Math.min(h.list.length - 1, h.idx + d)) }));
  // Ссылка на другой номер внутри статьи («от G2596») — новая статья в этом же окне
  const openStrong = (num) => setHist((h) => {
    const list = [...h.list.slice(0, h.idx + 1), { num, nums: [num], id: Date.now() }];
    return { list, idx: list.length - 1 };
  });
  // Номер слова (у слова их бывает несколько) — переключение без новой записи в истории
  const setNum = (num) => setHist((h) => ({ ...h, list: h.list.map((x, i) => (i === h.idx ? { ...x, num } : x)) }));
  // Стих из статьи — в окне текста рядом, Стронг остаётся
  const openRef = (r) => navigate(strong.pane, r);

  const shown = (res || []).filter((r) => !hidden.includes(r.module.id));
  const head = (res || []).map((r) => r.found[0].entry).find((e) => e.lemma) || {};
  const isHeb = cur.num.startsWith('H');
  const exact = orig && orig.num && norm(orig.num) === norm(cur.num) ? orig : null;
  const morph = !exact && cur.morph?.length ? cur.morph : [];

  return (
    <aside className="strong-panel" aria-label={t('Стронг')}>
      <div className="sp-bar">
        {/* какие словари показывать */}
        <div className="sp-pick">
          <button className={`sp-btn wide${pick ? ' on' : ''}`} onClick={() => setPick((x) => !x)} aria-expanded={pick} title={t('Словари')}>
            <Library size={18} /> <span>{t('Словари')}</span>
          </button>
          {pick && (
            <div className="sp-menu" role="menu">
              {all.map((m) => {
                const on = !hidden.includes(m.id);
                return (
                  <button key={m.id} role="menuitemcheckbox" aria-checked={on} onClick={() => setHidden((h) => (on ? [...h, m.id] : h.filter((x) => x !== m.id)))}>
                    <span className={`sp-check${on ? ' on' : ''}`}>{on && <Check size={13} strokeWidth={3} />}</span>
                    {m.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="sp-nums">
          {(cur.nums || [cur.num]).map((n) => (
            <button key={n} className={`sp-num${n === cur.num ? ' on' : ''}`} onClick={() => setNum(n)}>
              {n}
            </button>
          ))}
        </div>
        <span className="sp-gap" />
        <button className="sp-btn" onClick={() => openSheet('concord', strong.pane, { num: cur.num, lemma: head.lemma })} aria-label={t('Где встречается')} title={t('Где встречается')}>
          <Search size={19} />
        </button>
        <button className="sp-btn" onClick={() => go(-1)} disabled={hist.idx <= 0} aria-label={t('Назад')} title={t('Назад')}>
          <ChevronLeft size={21} />
        </button>
        <button className="sp-btn" onClick={() => go(1)} disabled={hist.idx >= hist.list.length - 1} aria-label={t('Вперёд')} title={t('Вперёд')}>
          <ChevronRight size={21} />
        </button>
        <button className="sp-btn" onClick={closeStrong} aria-label={t('Закрыть')} title={t('Закрыть')}>
          <X size={20} />
        </button>
      </div>
      <div className="sp-body" ref={body} onPointerDown={() => pick && setPick(false)}>
        {!res && (
          <div className="loading">
            <Loader2 className="spin" size={20} /> {t('Ищу в словарях…')}
          </div>
        )}
        {res && (
          <article className="entry sp-entry">
            {/* слово оригинала крупно, рядом — «послушать»; ниже транслитерация, язык, форма в этом стихе */}
            {head.lemma && (
              <div className={`orig-row ${isHeb ? 'rtl' : 'ltr'}`}>
                {isHeb && <SayButton num={cur.num} verseRef={cur.ref} />}
                <div className={`orig ${isHeb ? 'hebrew' : 'greek'}`} lang={isHeb ? 'he' : 'grc'} dir={isHeb ? 'rtl' : 'ltr'}>
                  {head.lemma}
                </div>
                {!isHeb && <SayButton num={cur.num} verseRef={cur.ref} />}
              </div>
            )}
            <p className="sp-facts">
              {[head.xlit, head.pron && `[${head.pron}]`, isHeb ? t('иврит / арамейский (ВЗ)') : t('греческий (НЗ)')].filter(Boolean).join(' · ')}
            </p>
            {exact && (
              <p className="sp-form">
                <b>{t('В этом стихе')}:</b>{' '}
                <span className={isHeb ? 'hebrew' : 'greek'} lang={isHeb ? 'he' : 'grc'} dir={isHeb ? 'rtl' : 'ltr'}>
                  {exact.orig}
                </span>
                {exact.origMorph && describeMorph(exact.origMorph).text ? ` — ${describeMorph(exact.origMorph).text}` : ''}
              </p>
            )}
            {morph.map((m) => (
              <p key={m} className="sp-form">
                <b>{t('Грамматическая форма')}:</b> {describeMorph(m).text || t('без расшифровки')} <span className="mono muted">({m})</span>
              </p>
            ))}
            {shown.map((r) => (
              <Section key={r.module.id} module={r.module} entry={r.found[0].entry} onOpenStrong={openStrong} onOpenRef={openRef} />
            ))}
            {!shown.length && <p className="sp-muted">{res.length ? t('Все словари скрыты — выберите их в «Словари».') : t('Статей не найдено')}</p>}
            <WordStats num={cur.num} onOpenRef={openRef} onOpenAll={() => openSheet('concord', strong.pane, { num: cur.num, lemma: head.lemma })} />
          </article>
        )}
      </div>
    </aside>
  );
}
