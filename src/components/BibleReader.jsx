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
import { CornerUpLeft, X, Headphones, ScrollText } from 'lucide-react';

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

// Выделен стих — снизу кнопка «Слушать» с первого выделенного стиха
// и «В проповедь»: выбор проповеди или новая, стихи добавляются сами
function ListenSelected({ index, module, selection, onDone }) {
  const { openSheet } = useApp();
  const audio = useAudio();
  const refs = sortedRefs(selection);
  const first = refs[0];
  if (!first) return null;
  const playing = audio.active && audio.playing;
  return (
    <div className="float-pill listen-pill">
      <button
        className="btn primary"
        onClick={() => {
          openSheet('sermon-add', index, { refs, moduleId: module.id });
          onDone();
        }}
      >
        <ScrollText size={17} /> В проповедь
      </button>
      {!playing && (
        <button
          className="btn listen-sel"
          onClick={() => {
            listenFrom(index, module.id, first);
            onDone();
          }}
          aria-label={`Слушать с ${formatRef(first)}`}
        >
          <Headphones size={17} /> Слушать
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
  return (
    <section className={`reader ${settings.focusMode && barHidden && !selection.size ? 'bar-hidden' : ''}`} aria-label={index === 0 ? 'Основная панель' : 'Вторая панель'}>
      {selection.size ? (
        <SelectionBar index={index} module={module} selection={selection} onDone={() => setSelection(new Set())} />
      ) : (
        <ReaderToolbar index={index} pane={pane} module={module} />
      )}
      {pane.plan ? <PlanProgress uid={pane.plan.uid} day={pane.plan.day} /> : <ReadingProgress module={module} index={index} fallback={pane.ref} />}
      {pane.plan ? (
        <PlanView index={index} pane={pane} module={module} selection={selection} onSelect={onSelect} />
      ) : (
        <ChapterView
          index={index}
          pane={pane}
          module={module}
          selection={selection}
          onSelect={onSelect}
          onScrollDirection={(down) => settings.focusMode && setBarHidden(down)}
        />
      )}
      {!pane.plan && pane.lastPlan && !selection.size && <PlanReturn index={index} lastPlan={pane.lastPlan} />}
      {selection.size > 0 ? (
        <ListenSelected index={index} module={module} selection={selection} onDone={() => setSelection(new Set())} />
      ) : (
        <ListenFab index={index} module={module} pane={pane} />
      )}
    </section>
  );
}
