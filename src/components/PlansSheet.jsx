// Планы чтения: активные планы с прогрессом и чтением дня, начало нового плана, свой план
import React, { useEffect, useState } from 'react';
import { CalendarCheck, Check, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { usePersistentState } from '../core/storage.js';
import { fetchPlanIndex, fetchPlan, makeCustomPlan, SCOPES, parseReading, todayIndex, calendarIndex, isoDate } from '../core/plans.js';
import { ConfirmButton, Empty, Segmented, Hint } from './ui.jsx';

function ActivePlan({ plan, onChange, onRemove, open }) {
  const days = plan.readings.length;
  const today = plan.calendar ? calendarIndex() : todayIndex(plan.start, days);
  const [day, setDay] = useState(today);
  const done = plan.done || {};
  const doneCount = Object.keys(done).length;
  // Для календарного плана «отставание» считаем с дня начала, а не с 1 января
  const from = plan.calendar ? Math.min(today, calendarIndex(new Date(plan.start))) : 0;
  const behind = Array.from({ length: today - from }, (_, i) => i + from).filter((i) => !done[i]).length;
  const toggle = (i) => {
    const next = { ...done };
    if (next[i]) delete next[i];
    else next[i] = Date.now();
    onChange({ ...plan, done: next });
  };
  return (
    <div className="plan-card">
      <div className="plan-head">
        <span className="plan-name">{plan.name}</span>
        <span className="plan-meta">
          {doneCount} из {days} дн.{behind ? ` · отстаёте на ${behind}` : ''}
        </span>
        <ConfirmButton className="icon-btn subtle" confirmText="Удалить" onConfirm={onRemove} aria-label="Удалить план">
          <Trash2 size={15} />
        </ConfirmButton>
      </div>
      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${(doneCount / days) * 100}%` }} />
      </div>
      <div className="plan-day">
        <button className="icon-btn subtle" onClick={() => setDay((d) => Math.max(0, d - 1))} disabled={day === 0} aria-label="Предыдущий день">
          <ChevronLeft size={18} />
        </button>
        <span className="plan-day-label">
          День {day + 1}
          {day === today ? ' · сегодня' : ''}
        </span>
        <button className="icon-btn subtle" onClick={() => setDay((d) => Math.min(days - 1, d + 1))} disabled={day === days - 1} aria-label="Следующий день">
          <ChevronRight size={18} />
        </button>
        <button className={`btn small ${done[day] ? 'primary' : ''}`} onClick={() => toggle(day)}>
          <Check size={14} /> {done[day] ? 'Прочитано' : 'Отметить'}
        </button>
      </div>
      <div className="chips">
        {plan.readings[day].map((r) => {
          const p = parseReading(r);
          return (
            <button key={r} className={`chip ${done[day] ? 'done' : ''}`} onClick={() => open(p)}>
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PlansSheet({ pane, onClose }) {
  const { navigate, toast } = useApp();
  const [plans, setPlans] = usePersistentState('plans', []);
  const [index, setIndex] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [scope, setScope] = useState('nt');
  const [days, setDays] = useState(90);

  useEffect(() => {
    fetchPlanIndex().then(setIndex, (e) => setErr(e.message));
  }, []);

  const open = (p) => {
    onClose();
    navigate(pane, { book: p.book, chapter: p.chapter, verse: p.verse || 1 });
  };
  const add = (plan) => {
    setPlans((ps) => [{ ...plan, uid: Date.now().toString(36), start: isoDate(), done: {} }, ...ps]);
    toast(`План «${plan.name}» начат`);
  };
  const start = async (meta) => {
    setBusy(meta.id);
    try {
      const p = await fetchPlan(meta.file);
      add({ planId: p.id, name: p.name, readings: p.readings, calendar: !!p.calendar });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };
  const startCustom = async () => {
    const n = Math.max(7, Math.min(730, +days || 90));
    setBusy('custom');
    const readings = await makeCustomPlan(SCOPES[scope].books(), n);
    add({ planId: 'custom', name: `${SCOPES[scope].label} за ${n} дн.`, readings });
    setBusy(null);
  };

  return (
    <BottomSheet title="Планы чтения" onClose={onClose} initial={2}>
      {plans.length === 0 && (
        <Empty icon={CalendarCheck} title="Активных планов нет">
          Выберите план ниже — каждый день здесь будет чтение на сегодня.
        </Empty>
      )}
      {plans.map((p) => (
        <ActivePlan
          key={p.uid}
          plan={p}
          open={open}
          onChange={(np) => setPlans((ps) => ps.map((x) => (x.uid === p.uid ? np : x)))}
          onRemove={() => setPlans((ps) => ps.filter((x) => x.uid !== p.uid))}
        />
      ))}

      <section className="nav-group">
        <h4>Начать план</h4>
        {err && <p className="error-text small">{err}</p>}
        {!index && !err && (
          <div className="loading small">
            <Loader2 className="spin" size={16} /> Загружаю планы…
          </div>
        )}
        {index?.map((m) => (
          <div key={m.id} className="plan-offer">
            <div className="plan-offer-text">
              <span className="plan-name">{m.name}</span>
              <span className="plan-meta">
                {m.days} дн.{m.description ? ` · ${m.description}` : ''}
              </span>
            </div>
            <button className="btn small" disabled={!!busy} onClick={() => start(m)}>
              {busy === m.id ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Начать
            </button>
          </div>
        ))}
      </section>

      <section className="nav-group">
        <h4>
          Свой план <Hint>Главы выбранных книг делятся на дни поровну по числу стихов.</Hint>
        </h4>
        <Segmented id="plan-scope" value={scope} onChange={setScope} options={Object.entries(SCOPES).map(([k, v]) => [k, v.label])} />
        <div className="ref-form">
          <label htmlFor="plan-days" className="sr-only">
            Число дней
          </label>
          <input id="plan-days" type="number" inputMode="numeric" min="7" max="730" value={days} onChange={(e) => setDays(e.target.value)} />
          <button className="btn primary" onClick={startCustom} disabled={!!busy}>
            Начать на {Math.max(7, Math.min(730, +days || 90))} дн.
          </button>
        </div>
      </section>
    </BottomSheet>
  );
}
