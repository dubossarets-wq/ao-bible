// Планы чтения: активные планы с прогрессом и кнопкой «Читать» (весь день одной страницей),
// учёт прочитанного, начало нового плана, свой план
import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarCheck, Check, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { usePlans } from '../core/planStore.js';
import { readStats } from '../core/readLog.js';
import { bookMeta } from '../core/books.js';
import { fetchPlanIndex, fetchPlan, makeCustomPlan, SCOPES, parseReading, planToday, behindDays, readingDone, isoDate } from '../core/plans.js';
import { ConfirmButton, Empty, Segmented, Hint } from './ui.jsx';

function ActivePlan({ plan, onChange, onRemove, read }) {
  const days = plan.readings.length;
  const today = planToday(plan);
  const [day, setDay] = useState(today);
  const done = plan.done || {};
  const doneCount = Object.keys(done).length;
  const behind = behindDays(plan);
  const rs = plan.readings[day] || [];
  const flags = rs.map((r) => readingDone(plan, day, r));
  const partDone = flags.filter(Boolean).length;
  const dayDone = !!done[day];
  const firstLeft = flags.findIndex((f) => !f);
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
          {doneCount} из {days} дн.
        </span>
        <ConfirmButton className="icon-btn subtle" confirmText="Удалить" onConfirm={onRemove} aria-label="Удалить план">
          <Trash2 size={15} />
        </ConfirmButton>
      </div>
      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${(doneCount / days) * 100}%` }} />
      </div>
      {behind.length > 0 && (
        <div className="plan-behind">
          Пропущено дней: {behind.length}
          {day !== behind[0] && (
            <button className="link-btn" onClick={() => setDay(behind[0])}>
              к первому пропущенному
            </button>
          )}
        </div>
      )}
      <div className="plan-day">
        <button className="icon-btn subtle" onClick={() => setDay((d) => Math.max(0, d - 1))} disabled={day === 0} aria-label="Предыдущий день">
          <ChevronLeft size={18} />
        </button>
        <span className="plan-day-label">
          День {day + 1}
          {day === today ? ' · сегодня' : ''}
          <small>{dayDone ? 'прочитано' : `${partDone} из ${rs.length} отрывков`}</small>
        </span>
        <button className="icon-btn subtle" onClick={() => setDay((d) => Math.min(days - 1, d + 1))} disabled={day === days - 1} aria-label="Следующий день">
          <ChevronRight size={18} />
        </button>
        <button className={`btn small ${dayDone ? 'primary' : ''}`} onClick={() => toggle(day)} title={dayDone ? 'Снять отметку дня' : 'Отметить весь день прочитанным'}>
          <Check size={14} /> {dayDone ? 'Прочитано' : 'Отметить'}
        </button>
      </div>
      <div className="chips">
        {rs.map((r, i) => (
          <button key={r + i} className={`chip ${flags[i] ? 'done' : ''}`} onClick={() => read(plan, day, i)}>
            {flags[i] && <Check size={12} />} {parseReading(r).label}
          </button>
        ))}
      </div>
      <button className={`btn ${dayDone ? '' : 'primary'} plan-read`} onClick={() => read(plan, day, dayDone || firstLeft < 0 ? 0 : firstLeft)}>
        <BookOpen size={17} /> {dayDone ? 'Перечитать' : partDone ? 'Продолжить чтение' : 'Читать'}
        {!dayDone && <span className="plan-read-sub">{rs.length > 1 ? `все ${rs.length} отрывка на одной странице` : 'отрывок дня'}</span>}
      </button>
    </div>
  );
}

const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
const chLabel = (key) => {
  const [b, c] = key.split('.');
  return `${bookMeta(b).short.replace(/\.$/, '')} ${c}`;
};

// Сколько и что прочитано — по дочитанным до конца главам
function ReadStats({ open }) {
  const st = useMemo(() => readStats(), []);
  const [more, setMore] = useState(false);
  if (!st.total) return null;
  const fmt = (d) => new Date(`${d}T12:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return (
    <section className="nav-group read-stats">
      <h4>
        Прочитано <Hint>Глава засчитывается, когда вы дочитали её до последнего стиха — в плане или в обычном чтении.</Hint>
      </h4>
      <div className="stat-row">
        <div className="stat">
          <b>{st.today}</b>
          <span>сегодня</span>
        </div>
        <div className="stat">
          <b>{st.week}</b>
          <span>за 7 дней</span>
        </div>
        <div className="stat">
          <b>{st.total}</b>
          <span>{plural(st.total, 'глава', 'главы', 'глав')} всего</span>
        </div>
      </div>
      <div className="chips">
        {st.recent.slice(0, more ? 30 : 8).map((x) => (
          <button key={x.key + x.day} className="chip" onClick={() => open(x.key)} title={fmt(x.day)}>
            {chLabel(x.key)} <small className="muted">{fmt(x.day)}</small>
          </button>
        ))}
        {st.recent.length > 8 && !more && (
          <button className="chip" onClick={() => setMore(true)}>
            ещё…
          </button>
        )}
      </div>
    </section>
  );
}

export default function PlansSheet({ pane, onClose }) {
  const { navigate, toast, openPlanDay } = useApp();
  const [plans, setPlans] = usePlans();
  const [index, setIndex] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [scope, setScope] = useState('nt');
  const [days, setDays] = useState(90);

  useEffect(() => {
    fetchPlanIndex().then(setIndex, (e) => setErr(e.message));
  }, []);

  // Весь день плана одной страницей, с прокруткой к нужному отрывку
  const read = (plan, day, at) => {
    onClose();
    openPlanDay(pane, plan.uid, day, at);
  };
  const openChapter = (key) => {
    const [book, c] = key.split('.');
    onClose();
    navigate(pane, { book, chapter: +c, verse: 1 });
  };
  const add = (plan) => {
    setPlans((ps) => [{ ...plan, uid: Date.now().toString(36), start: isoDate(), done: {} }, ...ps]);
    toast(`План «${plan.name}» начат — нажмите «Читать»`);
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
          read={read}
          onChange={(np) => setPlans((ps) => ps.map((x) => (x.uid === p.uid ? np : x)))}
          onRemove={() => setPlans((ps) => ps.filter((x) => x.uid !== p.uid))}
        />
      ))}

      <ReadStats open={openChapter} />

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
