// «Всё о стихе»: на одном экране — ваши пометки, слова оригинала, комментарии, параллельные места, места на карте.
import React, { useEffect, useState } from 'react';
import { Loader2, MapPin, MessageSquareText, Link2, Languages, NotebookPen } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { listModules, getVerse } from '../core/modules.js';
import { tokenize, plainText } from '../core/verseMarkup.js';
import { lookupStrong } from '../core/lexicon.js';
import { commentaryFor } from '../core/commentary.js';
import { refsForVerse, textForRef } from '../core/crossrefs.js';
import { placesInVerse } from '../core/places.js';
import { formatRef } from '../core/books.js';
import { hlColor, hlLabel } from '../core/highlights.js';
import { t } from '../core/i18n.js';

export default function VerseGuide({ pane, payload, onClose }) {
  const app = useApp();
  const { openInOther, openSheet, openPlaceMap, notes, highlights, hlLabels, collections } = app;
  const { ref, moduleId } = payload;
  const key = `${ref.book}.${ref.chapter}.${ref.verse}`;
  const [d, setD] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const text = plainText((await getVerse(moduleId, ref)) || '');
      // Слова оригинала — из перевода со Стронгом (RST+)
      const tagged = (await listModules()).find((m) => m.type === 'bible' && m.features?.strongs && m.language === 'ru');
      const raw = tagged ? await getVerse(tagged.id, ref) : null;
      const words = [];
      for (const t of raw ? tokenize(raw) : []) {
        if (t.kind !== 'w' || !t.strongs?.length) continue;
        const num = t.strongs[0];
        if (words.some((w) => w.num === num)) continue;
        const lex = (await lookupStrong(num)).find((r) => /^strongs-/.test(r.module.id)) || (await lookupStrong(num))[0];
        const e = lex?.found[0]?.entry;
        words.push({ token: t, num, lemma: e?.lemma, xlit: e?.xlit, def: e?.definition || e?.renderings?.[0]?.[0] });
      }
      const comm = await commentaryFor(ref);
      const xr = (await refsForVerse(moduleId, ref)).slice(0, 8);
      const xrefs = [];
      for (const x of xr) xrefs.push({ ...x, ...(await textForRef(moduleId, x.ref, 1)) });
      const places = (await placesInVerse(ref)).filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i);
      if (alive) setD({ text, words, comm, xrefs, places, tagged: tagged?.name });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const go = (r) => (onClose(), openInOther(pane, r));
  const inCollections = collections.filter((c) => c.items.some((x) => x.book === ref.book && x.chapter === ref.chapter && x.verse === ref.verse));
  const hl = highlights[key];

  return (
    <BottomSheet title={t('Всё о стихе · {ref}', { ref: formatRef(ref) })} onClose={onClose} initial={2}>
      {!d && (
        <div className="loading">
          <Loader2 className="spin" size={20} /> {t('Собираю сведения…')}
        </div>
      )}
      {d && (
        <>
          <blockquote className="xref-source">{d.text}</blockquote>
          {(notes[key] || hl || inCollections.length > 0) && (
            <section className="guide-sec">
              <h4>
                <NotebookPen size={13} /> {t('Ваши пометки')}
              </h4>
              {hl && (
                <p>
                  <span className="hl-swatch" style={{ background: hlColor(hl)?.css }} /> {hlLabel(hl, hlLabels)}
                </p>
              )}
              {notes[key] && (
                <button className="guide-card" onClick={() => openSheet('note', pane, { refs: [ref], moduleId })}>
                  {notes[key].text}
                </button>
              )}
              {inCollections.length > 0 && <p className="muted small">{t('В подборках: {names}', { names: inCollections.map((c) => c.name).join(', ') })}</p>}
            </section>
          )}
          {d.words.length > 0 && (
            <section className="guide-sec">
              <h4>
                <Languages size={13} /> {t('Слова оригинала · по {module}', { module: d.tagged })}
              </h4>
              <ul className="guide-words">
                {d.words.map((w) => (
                  <li key={w.num}>
                    <button
                      className="guide-word"
                      onClick={() => openSheet('dict', pane, { token: { text: w.token.text, strongs: w.token.strongs, morph: w.token.morph || null }, ref, moduleId })}
                    >
                      <span className="gw-ru">{w.token.text}</span>
                      <span className={`gw-orig ${w.num.startsWith('H') ? 'hebrew' : 'greek'}`} dir={w.num.startsWith('H') ? 'rtl' : 'ltr'}>
                        {w.lemma}
                      </span>
                      <span className="gw-meta">
                        {w.num}
                        {w.xlit ? ` · ${w.xlit}` : ''}
                        {w.def ? ` · ${w.def}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {d.comm.length > 0 && (
            <section className="guide-sec">
              <h4>
                <MessageSquareText size={13} /> {t('Комментарии')}
              </h4>
              {d.comm.map((c) => (
                <button key={c.module.id} className="guide-card" onClick={() => openSheet('commentary', pane, { ref, moduleId: c.module.id })}>
                  <b>{c.module.name}</b> {c.items[0]?.text.slice(0, 220)}
                  {c.items[0]?.text.length > 220 ? '…' : ''}
                </button>
              ))}
            </section>
          )}
          {d.xrefs.length > 0 && (
            <section className="guide-sec">
              <h4>
                <Link2 size={13} /> {t('Параллельные места')}
              </h4>
              {d.xrefs.map((x) => (
                <button key={x.osis} className="guide-card" onClick={() => go(x.ref)}>
                  <b>{formatRef(x.ref)}</b> {x.parts.map((p) => p.text).join(' ')}
                </button>
              ))}
            </section>
          )}
          {d.places.length > 0 && (
            <section className="guide-sec">
              <h4>
                <MapPin size={13} /> {t('Места на карте')}
              </h4>
              <div className="chips">
                {d.places.map((p) => (
                  <button key={p.id} className="chip" onClick={() => (onClose(), openPlaceMap(p))}>
                    <MapPin size={13} /> {p.name}
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </BottomSheet>
  );
}
