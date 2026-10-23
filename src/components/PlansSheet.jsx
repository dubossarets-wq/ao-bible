// Планы чтения: активные планы с прогрессом и кнопкой «Читать» (весь день одной страницей),
// учёт прочитанного, начало нового плана, свой план
import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, Flame, Library, CalendarDays, Sunrise, Music, Feather, Sparkles, CalendarPlus, Minus } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { usePlans } from '../core/planStore.js';
import { readStats } from '../core/readLog.js';
import { bookMeta } from '../core/books.js';
import { fetchPlanIndex, fetchPlan, makeCustomPlan, SCOPES, parseReading, planToday, behindDays, readingDone, localDate } from '../core/plans.js';
import { ConfirmButton, Hint, Switch } from './ui.jsx';
import { REMINDERS, getReminder, setReminder } from '../core/reminders.js';
import VerseOfDayCard from './VerseOfDayCard.jsx';
import { t, fmtDate, locale } from '../core/i18n.js';

// Кольцо прогресса: доля 0…1, в середине — подпись
function Ring({ value, size = 64, stroke = 7, children }) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-bg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle className="ring-fg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={len} strokeDashoffset={len * (1 - v)} />
      </svg>
      <span className="ring-label">{children}</span>
    </span>
  );
}

// Обложки планов: фотография (свободные снимки из фонов для картинок со стихом), значок и цвет;
// свой план и неизвестные — по умолчанию
const LOOK = {
  mcheyne: [Library, 'c1', '10'],
  'bible-year': [CalendarDays, 'c2', '06'],
  'nt-90': [Sunrise, 'c3', '01'],
  'ps-prov-31': [Music, 'c4', '07'],
  'gospels-30': [Feather, 'c5', '02'],
};
const look = (id) => LOOK[id] || [Sparkles, 'c6', '08'];
const coverUrl = (id) => `images/verse-bg/${look(id)[2]}.jpg`;

function ActivePlan({ plan, onChange, onRemove, read }) {
  const days = plan.readings.length;
  const today = planToday(plan);
  // Показываем день, с которого читать: прочитали вперёд — первый непрочитанный после сегодняшнего
  const [day, setDay] = useState(() => {
    let d = today;
    while (d < days - 1 && plan.done?.[d]) d++;
    return d;
  });
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
    const parts = { ...plan.parts };
    if (next[i]) {
      delete next[i];
      delete parts[i]; // снимаем и отметки отрывков — иначе день уже не закроется сам
    } else next[i] = Date.now();
    onChange({ ...plan, done: next, parts });
  };
  return (
    <div className={`plan-card cover-${look(plan.planId)[1]}`}>
      <div className="plan-banner" style={{ backgroundImage: `url(${coverUrl(plan.planId)})` }} aria-hidden="true" />
      <div className="plan-head">
        <Ring value={doneCount / days} size={48} stroke={5}>
          {Math.round((doneCount / days) * 100)}%
        </Ring>
        <span className="plan-head-text">
          <span className="plan-name">{t(plan.name)}</span>
          <span className="plan-meta">{t('{done} из {total} дн.', { done: doneCount, total: days })}</span>
        </span>
        <ConfirmButton className="icon-btn subtle" confirmText={t('Удалить')} onConfirm={onRemove} aria-label={t('Удалить план')}>
          <Trash2 size={15} />
        </ConfirmButton>
      </div>
      {behind.length > 0 && (
        <div className="plan-behind">
          {t('Пропущено дней: {n}', { n: behind.length })}
          {day !== behind[0] && (
            <button className="link-btn" onClick={() => setDay(behind[0])}>
              {t('к первому пропущенному')}
            </button>
          )}
        </div>
      )}
      <div className="plan-day">
        <button className="icon-btn subtle" onClick={() => setDay((d) => Math.max(0, d - 1))} disabled={day === 0} aria-label={t('Предыдущий день')}>
          <ChevronLeft size={18} />
        </button>
        <span className="plan-day-label">
          {t('День {n}', { n: day + 1 })}
          {day === today ? ` · ${t('сегодня')}` : ''}
          <small>{dayDone ? t('прочитано') : t('{done} из {total} отрывков', { done: partDone, total: rs.length })}</small>
        </span>
        <button className="icon-btn subtle" onClick={() => setDay((d) => Math.min(days - 1, d + 1))} disabled={day === days - 1} aria-label={t('Следующий день')}>
          <ChevronRight size={18} />
        </button>
        <button className={`btn small ${dayDone ? 'primary' : ''}`} onClick={() => toggle(day)} title={dayDone ? t('Снять отметку дня') : t('Отметить весь день прочитанным')}>
          <Check size={14} /> {dayDone ? t('Прочитано') : t('Отметить')}
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
        <BookOpen size={17} /> {dayDone ? t('Перечитать') : partDone ? t('Продолжить чтение') : t('Читать')}
      </button>
    </div>
  );
}

const chLabel = (key) => {
  const [b, c] = key.split('.');
  return `${bookMeta(b).short.replace(/\.$/, '')} ${c}`;
};

// Сколько прочитано — по дочитанным до конца главам: кольцо «доля Библии», серия дней, столбики за неделю
const BIBLE_CHAPTERS = 1189;
function ReadHero({ open }) {
  const st = useMemo(() => readStats(), []);
  const [more, setMore] = useState(false);
  const fmt = (d) => fmtDate(`${d}T12:00`, { day: 'numeric', month: 'short' });
  const wd = (d) => new Date(`${d}T12:00`).toLocaleDateString(locale(), { weekday: 'narrow' });
  const max = Math.max(1, ...st.days7.map((d) => d.n));
  const pct = (st.total / BIBLE_CHAPTERS) * 100;
  return (
    <section className="read-hero" aria-label={t('Прочитано')}>
      <div className="hero-top">
        <Ring value={st.total / BIBLE_CHAPTERS} size={84} stroke={8}>
          <b>{pct > 0 && pct < 1 ? '<1' : Math.round(pct)}%</b>
          <small>{t('Библии')}</small>
        </Ring>
        <div className="hero-nums">
          <span className={`hero-streak ${st.streak ? 'on' : ''}`}>
            <Flame size={18} /> <b>{st.streak}</b> {t('день подряд|дня подряд|дней подряд', { n: st.streak })}
          </span>
          <span className="hero-sub">
            {t('Сегодня: {n} гл.', { n: st.today })} · {t('Глав Библии: {n} из {total}', { n: st.total, total: BIBLE_CHAPTERS })}{' '}
            <Hint>{t('Глава засчитывается, когда дочитана до конца — по плану или просто так. Столбики — главы за каждый день, с повторами; «Глав Библии» — сколько разных глав прочитано хоть раз.')}</Hint>
          </span>
        </div>
      </div>
      <div className="week-bars" role="img" aria-label={t('За 7 дней: {n} гл.', { n: st.week })}>
        {st.days7.map((d) => (
          <span key={d.day} className={`wb ${d.n ? 'on' : ''}`} title={`${fmt(d.day)}: ${d.n}`}>
            <span className="wb-col">
              <span className="wb-bar" style={{ height: `${d.n ? Math.max(12, (d.n / max) * 100) : 4}%` }} />
            </span>
            <small>{wd(d.day)}</small>
          </span>
        ))}
      </div>
      {st.recent.length > 0 && (
        <div className="chips">
          {st.recent.slice(0, more ? 30 : 3).map((x) => (
            <button key={x.key + x.day} className="chip" onClick={() => open(x.key)} title={fmt(x.day)}>
              {chLabel(x.key)} <small className="muted">{fmt(x.day)}</small>
            </button>
          ))}
          {st.recent.length > 3 && !more && (
            <button className="chip" onClick={() => setMore(true)}>
              {t('ещё…')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// Готовый план — вертикальная обложка с фотографией и названием; нажатие выбирает план
function PlanTile({ m, on, onPick }) {
  const [Icon, c] = look(m.id);
  return (
    <button className={`plan-tile cover-${c} ${on ? 'on' : ''}`} onClick={onPick} aria-pressed={on}>
      <img src={coverUrl(m.id)} alt="" loading="lazy" />
      <span className="plan-tile-days">
        <Icon size={13} /> {t('{n} дн.', { n: m.days })}
      </span>
      <span className="plan-tile-name">{t(m.name)}</span>
    </button>
  );
}

// Напоминание о чтении (приложение из Google Play): каждый день в выбранное время — что читать сегодня
function ReminderCard() {
  const { toast } = useApp();
  const [r, setR] = useState(getReminder);
  const apply = async (next) => {
    const ok = await setReminder(next);
    if (!ok) return toast(t('Уведомления запрещены — разрешите их в настройках телефона'), 'error');
    setR(getReminder());
    if (next.on) toast(t('Напомню в {time}', { time: getReminder().time }));
  };
  return (
    <section className="reminder-card" aria-label={t('Напоминание о чтении')}>
      <Switch id="plan-reminder" checked={r.on} onChange={(on) => apply({ on })} label={t('Напоминать о чтении')} hint={t('Каждый день в это время — уведомление с отрывками на сегодня')} />
      {r.on && (
        <label className="reminder-time">
          <span>{t('Время')}</span>
          <input type="time" value={r.time} onChange={(e) => e.target.value && apply({ time: e.target.value })} />
        </label>
      )}
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
  const [pick, setPick] = useState(null); // выбранный в сетке план — под сеткой его описание и «Начать»

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
    setPlans((ps) => [{ ...plan, uid: Date.now().toString(36), start: localDate(), done: {}, ...(plan.calendar ? { year: new Date().getFullYear() } : {}) }, ...ps]);
    toast(t('План «{name}» начат — нажмите «Читать»', { name: t(plan.name) }));
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
    try {
      const readings = await makeCustomPlan(SCOPES[scope].books(), n);
      // Глав меньше, чем дней (Евангелия за 730 дней) — дней столько, сколько глав
      add({ planId: 'custom', name: t('{scope} за {n} дн.', { scope: t(SCOPES[scope].label), n: readings.length }), readings });
    } catch (e) {
      toast(e.message || t('Не удалось составить план'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet title={t('Планы чтения')} onClose={onClose} initial={2}>
      <VerseOfDayCard pane={pane} onClose={onClose} />

      {plans.map((p) => (
        <ActivePlan
          key={p.uid}
          plan={p}
          read={read}
          onChange={(np) => setPlans((ps) => ps.map((x) => (x.uid === p.uid ? np : x)))}
          onRemove={() => setPlans((ps) => ps.filter((x) => x.uid !== p.uid))}
        />
      ))}

      {REMINDERS && plans.length > 0 && <ReminderCard />}

      <ReadHero open={openChapter} />

      <section className="nav-group">
        <h4>{plans.length ? t('Ещё планы') : t('Выберите план')}</h4>
        {err && <p className="error-text small">{err}</p>}
        {!index && !err && (
          <div className="loading small">
            <Loader2 className="spin" size={16} /> {t('Загружаю планы…')}
          </div>
        )}
        {index && (
          <div className="plan-grid">
            {index.map((m) => (
              <PlanTile key={m.id} m={m} on={pick === m.id} onPick={() => (setPick((x) => (x === m.id ? null : m.id)), setTimeout(() => document.querySelector('.plan-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60))} />
            ))}
          </div>
        )}
        {index?.filter((m) => m.id === pick).map((m) => (
          <div key={m.id} className={`plan-detail cover-${look(m.id)[1]}`}>
            <span className="plan-name">{t(m.name)}</span>
            <span className="plan-meta">
              {t('{n} дн.', { n: m.days })}
              {m.short ? ` · ${t(m.short)}` : ''}
            </span>
            {m.description && <p className="plan-desc">{t(m.description)}</p>}
            <button className="btn primary" disabled={!!busy} onClick={() => start(m)}>
              {busy === m.id ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} {t('Начать')}
            </button>
          </div>
        ))}
      </section>

      {/* Свой план — отдельной карточкой: что читать, за сколько дней, начать */}
      <section className="custom-plan" aria-labelledby="custom-plan-h">
        <div className="cp-head">
          <span className="cp-icon" aria-hidden="true">
            <CalendarPlus size={22} />
          </span>
          <div className="cp-titles">
            <h3 id="custom-plan-h">{t('Свой план')}</h3>
            <p>{t('Главы делятся на дни поровну по числу стихов.')}</p>
          </div>
        </div>
        <div className="cp-label" id="plan-scope-l">
          {t('Что читать')}
        </div>
        <div className="cp-scopes" id="plan-scope" role="radiogroup" aria-labelledby="plan-scope-l">
          {Object.entries(SCOPES).map(([k, v]) => (
            <button key={k} type="button" role="radio" aria-checked={scope === k} className={`cp-scope ${scope === k ? 'on' : ''}`} onClick={() => setScope(k)}>
              {t(v.label)}
            </button>
          ))}
        </div>
        <label className="cp-label" htmlFor="plan-days">
          {t('За сколько дней')}
        </label>
        <div className="cp-days">
          <button type="button" className="cp-step" onClick={() => setDays(Math.max(7, (+days || 90) - 1))} aria-label={t('Уменьшить')}>
            <Minus size={18} />
          </button>
          <input id="plan-days" type="number" inputMode="numeric" min="7" max="730" value={days} onChange={(e) => setDays(e.target.value)} />
          <button type="button" className="cp-step" onClick={() => setDays(Math.min(730, (+days || 90) + 1))} aria-label={t('Увеличить')}>
            <Plus size={18} />
          </button>
        </div>
        <div className="cp-presets">
          {[30, 90, 180, 365].map((n) => (
            <button key={n} type="button" className={`chip ${+days === n ? 'on' : ''}`} aria-pressed={+days === n} onClick={() => setDays(n)}>
              {t('{n} дн.', { n })}
            </button>
          ))}
        </div>
        <button className="btn primary cp-start" onClick={startCustom} disabled={!!busy}>
          {busy === 'custom' ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} {t('Начать на {n} дн.', { n: Math.max(7, Math.min(730, +days || 90)) })}
        </button>
      </section>
    </BottomSheet>
  );
}
