// Полноценная панель чтения: своя навигация, свой перевод, свои словари и параллельные места.
// Долгое нажатие на стих включает режим выделения: вместо верхней панели — панель действий.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import ReaderToolbar from './ReaderToolbar.jsx';
import SelectionBar, { sortedRefs } from './SelectionBar.jsx';
import { listenFrom } from '../core/listen.js';
import { useAudio } from '../core/audio.js';
import { formatRef } from '../core/books.js';
import ChapterView from './ChapterView.jsx';
import MapPane from './MapPane.jsx';
import PlanView from './PlanView.jsx';
import { useLivePosition } from '../core/livePosition.js';
import { usePlan } from '../core/planStore.js';
import { dayUnits, unitDone, readingDone } from '../core/plans.js';
import { CornerUpLeft, X, Headphones, ScrollText, Heart, Copy, TextSelect } from 'lucide-react';

// В режиме плана полоса показывает, сколько отрывков дня уже прочитано
function PlanProgress({ uid, day }) {
  const plan = usePlan(uid);
  if (!plan) return null;
  const units = dayUnits(plan, day);
  const pct = units.length ? (units.filter((u) => unitDone(plan, day, u.key)).length / units.length) * 100 : 0;
  const label = `Прочитано за день: ${Math.round(pct)}%`;
  return (
    <div className="read-progress plan" role="progressbar" aria-label={label} title={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

// Всегда под рукой: маленькая кнопка «Слушать с этого места» в правом нижнем углу.
// Пока текст прокручивают, она почти прозрачная (класс ставится напрямую, без перерисовки панели).
function ListenFab({ index, module, pane }) {
  const audio = useAudio();
  const ref = useLivePosition(index, pane.ref);
  const btn = useRef(null);
  useEffect(() => {
    const reader = btn.current?.closest('.reader');
    if (!reader) return;
    let t = 0;
    const onScroll = () => {
      btn.current?.classList.add('dim');
      clearTimeout(t);
      t = setTimeout(() => btn.current?.classList.remove('dim'), 900);
    };
    reader.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      clearTimeout(t);
      reader.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [audio.active]);
  if (audio.active) return null;
  return (
    <button ref={btn} className="listen-fab" onClick={() => listenFrom(index, module.id, ref)} aria-label={`Слушать с этого места: ${formatRef(ref)}`} title={`Слушать с ${formatRef(ref)}`}>
      <Headphones size={20} />
    </button>
  );
}

// Текст выбранной части стиха — прямо из страницы: от первого до последнего выбранного слова (с запятыми между ними)
function partText(index, part) {
  if (part?.from == null) return '';
  const [b, c, v] = part.key.split('.');
  const verse = document.querySelector(`.pane-slot.${index === 0 ? 'first' : 'second'} .verse[data-b="${b}"][data-c="${c}"][data-v="${v}"]`);
  const a = verse?.querySelector(`.w[data-i="${Math.min(part.from, part.to)}"]`);
  const z = verse?.querySelector(`.w[data-i="${Math.max(part.from, part.to)}"]`);
  if (!a || !z) return '';
  const r = document.createRange();
  r.setStartBefore(a);
  r.setEndAfter(z);
  return r.toString().replace(/\s+/g, ' ').trim();
}

// Часть стиха: нажмите первое и последнее слово — и действия только для этих слов
function PartInline({ index, module, refs, part, setPart, onDone }) {
  const { openSheet, addFavoritePart, toast } = useApp();
  const [text, setText] = useState('');
  useEffect(() => setText(partText(index, part)), [part]);
  const ref = refs[0];
  const ready = part.from != null && text;
  const copy = async () => {
    const s = `«${text}» (${formatRef(ref)})`;
    try {
      await navigator.clipboard.writeText(s);
      toast('Часть стиха скопирована');
    } catch {
      toast(s);
    }
    onDone();
  };
  return (
    <div className="sel-inline part-inline">
      <p className="part-hint">{ready ? `«${text}»` : 'Нажмите на первое слово нужной части, потом на последнее.'}</p>
      <div className="part-btns">
        <button className="btn primary" disabled={!ready} onClick={() => (openSheet('sermon-add', index, { refs: [ref], moduleId: module.id, fragment: { text } }), onDone())}>
          <ScrollText size={17} /> В проповедь
        </button>
        <button className="btn" disabled={!ready} onClick={() => (addFavoritePart(ref, text, Math.min(part.from, part.to), Math.max(part.from, part.to)), onDone())} aria-label="В любимые">
          <Heart size={17} />
        </button>
        <button className="btn" disabled={!ready} onClick={copy} aria-label="Копировать">
          <Copy size={17} />
        </button>
        <button className="btn" onClick={() => setPart(null)}>
          Отмена
        </button>
      </div>
    </div>
  );
}

// Выделен стих — прямо под ним: главная кнопка «Слушать» (с первого выделенного стиха)
// и «В проповедь» (выбор проповеди или новая, стихи добавляются сами); один стих — ещё «Часть стиха»
function SelectionInline({ index, module, refs, onDone, onPartStart }) {
  const { openSheet } = useApp();
  const first = refs[0];
  return (
    <div className="sel-inline">
      <button
        className="btn primary"
        onClick={() => {
          listenFrom(index, module.id, first);
          onDone();
        }}
      >
        <Headphones size={18} /> Слушать
      </button>
      <button
        className="btn"
        onClick={() => {
          openSheet('sermon-add', index, { refs, moduleId: module.id });
          onDone();
        }}
      >
        <ScrollText size={17} /> В проповедь
      </button>
      {refs.length === 1 && (
        <button className="btn" onClick={onPartStart}>
          <TextSelect size={17} /> Часть стиха
        </button>
      )}
    </div>
  );
}

// Человек ушёл из плана читать дальше — кнопка возврата к плану на день
function PlanReturn({ index, lastPlan }) {
  const { returnToPlan, dismissPlanReturn } = useApp();
  const plan = usePlan(lastPlan.uid);
  if (!plan || plan.done?.[lastPlan.day]) return null;
  const rs = plan.readings[lastPlan.day] || [];
  const done = rs.filter((r) => readingDone(plan, lastPlan.day, r)).length;
  return (
    <div className="plan-return">
      <button className="plan-return-btn" onClick={() => returnToPlan(index)}>
        <CornerUpLeft size={16} /> Вернуться к плану · {done} из {rs.length}
      </button>
      <button className="plan-return-x" onClick={() => dismissPlanReturn(index)} aria-label="Скрыть кнопку возврата к плану">
        <X size={15} />
      </button>
    </div>
  );
}

// Полоса прогресса чтения книги под верхней панелью: доля стихов книги до текущего места
function ReadingProgress({ module, index, fallback }) {
  const ref_ = useLivePosition(index, fallback);
  const book = module?.books.find((b) => b.id === ref_.book);
  if (!book) return null;
  const total = book.verses.reduce((a, b) => a + b, 0) || 1;
  const before = book.verses.slice(0, ref_.chapter - 1).reduce((a, b) => a + b, 0);
  const pct = Math.min(100, Math.max(0, ((before + ref_.verse) / total) * 100));
  const label = `Прочитано книги «${book.name}»: ${Math.round(pct)}%`;
  return (
    <div className="read-progress" role="progressbar" aria-label={label} title={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function BibleReader({ index }) {
  const { panes, bibles, settings, sheet } = useApp();
  const pane = panes[index];
  const [barHidden, setBarHidden] = useState(false);
  const [selection, setSelection] = useState(() => new Set());
  const module = pane ? bibles.find((b) => b.id === pane.moduleId) || bibles[0] : null;

  // Переход в другое место или смена перевода снимает выделение
  useEffect(() => setSelection(new Set()), [pane?.nav, module?.id]);
  // Выбор части стиха: { key: 'Книга.глава.стих', from, to } — номера слов; сбрасывается вместе с выделением
  const [part, setPart] = useState(null);
  useEffect(() => setPart(null), [selection]);
  const onPart = useCallback(
    (i) =>
      setPart((p) => {
        if (!p) return p;
        if (p.from == null || p.done) return { ...p, from: i, to: i, done: false }; // первое слово (или начать заново)
        return { ...p, to: i, done: true }; // последнее слово
      }),
    []
  );

  useEffect(() => {
    if (!selection.size || sheet) return;
    const onKey = (e) => e.key === 'Escape' && setSelection(new Set());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection.size, sheet]);

  const onSelect = useCallback((ref, mode) => {
    const key = `${ref.book}.${ref.chapter}.${ref.verse}`;
    setSelection((prev) => {
      if (mode === 'start') return new Set([key]);
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setBarHidden(false);
  }, []);

  if (!pane) return null;
  if (pane.kind === 'map') return <MapPane pane={pane} />;
  // Кнопки под последним выделенным стихом
  const selRefs = selection.size ? sortedRefs(selection) : null;
  const done = () => setSelection(new Set());
  const selActions = selRefs
    ? {
        last: selRefs[selRefs.length - 1],
        node: part ? (
          <PartInline index={index} module={module} refs={selRefs} part={part} setPart={setPart} onDone={done} />
        ) : (
          <SelectionInline index={index} module={module} refs={selRefs} onDone={done} onPartStart={() => setPart({ key: `${selRefs[0].book}.${selRefs[0].chapter}.${selRefs[0].verse}`, from: null, to: null })} />
        ),
      }
    : null;
  return (
    <section className={`reader ${settings.focusMode && barHidden && !selection.size ? 'bar-hidden' : ''}`} aria-label={index === 0 ? 'Основная панель' : 'Вторая панель'}>
      {selection.size ? (
        <SelectionBar index={index} module={module} selection={selection} onDone={() => setSelection(new Set())} />
      ) : (
        <ReaderToolbar index={index} pane={pane} module={module} />
      )}
      {pane.plan ? <PlanProgress uid={pane.plan.uid} day={pane.plan.day} /> : <ReadingProgress module={module} index={index} fallback={pane.ref} />}
      {pane.plan ? (
        <PlanView index={index} pane={pane} module={module} selection={selection} onSelect={onSelect} selActions={selActions} part={part} onPart={onPart} />
      ) : (
        <ChapterView
          index={index}
          pane={pane}
          module={module}
          selection={selection}
          onSelect={onSelect}
          selActions={selActions}
          part={part}
          onPart={onPart}
          onScrollDirection={(down) => settings.focusMode && setBarHidden(down)}
        />
      )}
      {!pane.plan && pane.lastPlan && !selection.size && <PlanReturn index={index} lastPlan={pane.lastPlan} />}
      {!selection.size && <ListenFab index={index} module={module} pane={pane} />}
    </section>
  );
}
