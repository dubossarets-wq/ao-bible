// Планы чтения: активные планы с прогрессом и кнопкой «Читать» (весь день одной страницей),
// учёт прочитанного, начало нового плана, свой план
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Scroll, ListChecks, Play, Check, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, Flame, Library, CalendarDays, Sunrise, Music, Feather, Sparkles, CalendarPlus, Minus } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { usePlans } from '../core/planStore.js';
import { readStats } from '../core/readLog.js';
import { bookMeta, BOOKS } from '../core/books.js';
import { fetchPlanIndex, fetchPlan, makeCustomPlan, makeParallelPlan, chapterList, streamList, firstDayText, SCOPES, STREAMS, parseReading, planToday, behindDays, readingDone, localDate } from '../core/plans.js';
import { ConfirmButton, Hint, Switch, Segmented, Reveal } from './ui.jsx';
import { usePersistentState } from '../core/storage.js';
import { REMINDERS, getReminder, setReminder } from '../core/reminders.js';
import VerseOfDayCard from './VerseOfDayCard.jsx';
import { t, N_, fmtDate, locale } from '../core/i18n.js';

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
// Свои значки в манере lucide (сетка 24, линия 2). Новый Завет — книга с крестом (рядом со свитком Ветхого Завета);
// Евангелия — латинский крест: жизнь, смерть и воскресение Христа
const lineIcon = (paths) => {
  const Icon = ({ size = 24, ...rest }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
  return Icon;
};
const BookCross = lineIcon(['M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20', 'M12 6v7', 'M9.5 8.5h5']);
const LatinCross = lineIcon(['M10 2h4v5h5v4h-5v11h-4V11H5V7h5Z']); // контуром — с объёмом, как соседние значки
const SCOPE_ICONS = { all: BookOpen, ot: Scroll, nt: BookCross, gospels: LatinCross, ps: Music, own: ListChecks };
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

// Дата окончания плана из N дней, начатого сегодня: «24 января» (другой год — с годом)
function planEndText(days) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Math.max(1, days) - 1, 12);
  return fmtDate(end, { day: 'numeric', month: 'long', ...(end.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

// Нагрузка выбранного срока: глав и минут в день (~8 секунд на стих); глав меньше, чем дней, — дней столько, сколько глав
function usePlanLoad(books, days) {
  const [load, setLoad] = useState(null);
  const key = books.join(',');
  useEffect(() => {
    let live = true;
    chapterList(books)
      .then((ch) => {
        if (!live) return;
        if (!ch.length || !(days > 0)) return setLoad(null);
        const d = Math.min(days, ch.length);
        const verses = ch.reduce((a, c) => a + (c.n || 0), 0);
        setLoad({ d, per: Math.max(1, Math.round(ch.length / d)), minutes: Math.max(1, Math.round(((verses / d) * 8) / 60)) });
      })
      .catch(() => live && setLoad(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, days]);
  return load;
}

// «≈ 13 гл. в день · до 24 января»; больше часа чтения в день — цветом предупреждения
function LoadLine({ load }) {
  if (!load) return null;
  return (
    <p className={`cp-load ${load.minutes > 60 ? 'heavy' : ''}`}>
      ≈ {t('{n} гл. в день', { n: load.per })} · {t('до {date}', { date: planEndText(load.d) })}
    </p>
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
      <Reveal open={r.on}>
        <label className="reminder-time">
          <span>{t('Время')}</span>
          <input type="time" value={r.time} onChange={(e) => e.target.value && apply({ time: e.target.value })} />
        </label>
      </Reveal>
    </section>
  );
}

// Свои книги для плана: сетка коротких названий по Заветам, нажатие — выбрать или убрать
function BookPicker({ value, onChange }) {
  const toggle = (id) => onChange((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  return (
    <div className="cp-books">
      {[
        ['OT', t('Ветхий Завет')],
        ['NT', t('Новый Завет')],
      ].map(([tt, label]) => (
        <div key={tt} className="cp-books-group">
          <div className="cp-books-h">{label}</div>
          <div className="cp-books-grid">
            {BOOKS.filter((b) => b.t === tt && !b.dc).map((b) => {
              const on = value.includes(b.id);
              return (
                <button key={b.id} type="button" className={`cp-book ${on ? 'on' : ''}`} aria-pressed={on} title={bookMeta(b.id).name} onClick={() => toggle(b.id)}>
                  {bookMeta(b.id).short.replace(/\.$/, '')}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {value.length > 0 && <div className="cp-books-sum">{t('Выбрано книг: {n}', { n: value.length })}</div>}
    </div>
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
  // Свой план: «Последовательно» (раздел или свои книги за N дней) или «Параллельно» (из каждого раздела по N глав в день)
  const [cpMode, setCpMode] = usePersistentState('customPlanMode', 'seq');
  const [own, setOwn] = usePersistentState('customPlanBooks', []);
  const [streams, setStreams] = usePersistentState('customPlanStreams', { ot: 1, nt: 1, ps: 1 });
  const lastPer = useRef({}); // число глав у выключаемого раздела — пока шаги уезжают, оно не меняется
  const [parMode, setParMode] = usePersistentState('customPlanParMode', 'perday'); // «Глав в день» или «За срок»
  const [periodDays, setPeriodDays] = usePersistentState('customPlanParDays', 90);
  const [parDays, setParDays] = useState(null); // сколько дней выйдет у параллельного плана
  const [firstDay, setFirstDay] = useState(''); // «Быт. 1 · Пс. 1 · Мф. 1» — как выглядит обычный день
  const ownOrdered = useMemo(() => BOOKS.filter((b) => own.includes(b.id)).map((b) => b.id), [own]);
  const seqLoad = usePlanLoad(scope === 'own' ? ownOrdered : SCOPES[scope]?.books() || [], Math.max(7, Math.min(730, +days || 90)));
  const parLoad = usePlanLoad(
    streamList(streams, ownOrdered).flatMap((x) => x.books),
    Math.max(7, Math.min(730, +periodDays || 90)),
  );
  useEffect(() => {
    if (cpMode !== 'par' || parMode !== 'perday') return;
    let live = true;
    Promise.all(streamList(streams, ownOrdered).map(async (x) => ({ per: x.perDay, n: (await chapterList(x.books)).length })))
      .then((r) => live && setParDays(r.filter((x) => x.n).reduce((m, x) => Math.max(m, Math.ceil(x.n / x.per)), 0)))
      .catch(() => live && setParDays(null));
    firstDayText(streamList(streams, ownOrdered))
      .then((s) => live && setFirstDay(s))
      .catch(() => live && setFirstDay(''));
    return () => {
      live = false;
    };
  }, [cpMode, parMode, streams, ownOrdered]);
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
    const started = t('План «{name}» начат — нажмите «Читать»', { name: t(plan.name) });
    // без напоминания планы чаще бросают — сразу предлагаем включить (приложение из Google Play)
    if (REMINDERS && !getReminder().on) {
      toast(started, 'info', {
        action: {
          label: t('Напоминать о чтении'),
          run: async () => {
            const ok = await setReminder({ ...getReminder(), on: true });
            toast(ok ? t('Напомню в {time}', { time: getReminder().time }) : t('Уведомления запрещены — разрешите их в настройках телефона'), ok ? 'info' : 'error');
          },
        },
      });
    } else toast(started);
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
  // «Исаия, Деяния» или «Исаия, Деяния и ещё 3»
  const ownLabel = () => {
    const names = ownOrdered.map((id) => bookMeta(id).name);
    return names.length > 2 ? t('{books} и ещё {n}', { books: names.slice(0, 2).join(', '), n: names.length - 2 }) : names.join(', ');
  };
  // «За сколько дней»: число с «−»/«+» и быстрые значения (общий для «Последовательно» и «Параллельно → За срок»)
  const daysBlock = (id, value, setValue, load) => (
    <>
      <label className="cp-label" htmlFor={id}>
        {t('За сколько дней')}
      </label>
      {/* одна капсула «− | 90 дней | +»: кнопки по краям, тонкие разделители, посередине число и подпись */}
      <div className="cp-days">
        <button type="button" className="cp-days-btn" onClick={() => setValue(Math.max(7, (+value || 90) - 1))} disabled={+value <= 7} aria-label={t('Уменьшить')}>
          <Minus size={20} />
        </button>
        <span className="cp-days-sep" />
        <span className="cp-days-mid">
          <input id={id} type="number" inputMode="numeric" min="7" max="730" value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="cp-days-unit">{t('день|дня|дней', { n: +value || 0 })}</span>
        </span>
        <span className="cp-days-sep" />
        <button type="button" className="cp-days-btn" onClick={() => setValue(Math.min(730, (+value || 90) + 1))} disabled={+value >= 730} aria-label={t('Увеличить')}>
          <Plus size={20} />
        </button>
      </div>
      {/* во что выльется выбор */}
      <LoadLine load={load} />
      {/* сроки словами — два ряда по три, точное число — кнопками «− / +» выше */}
      <div className="cp-presets cp-terms">
        {[
          [7, N_('Неделя')],
          [14, N_('2 недели')],
          [30, N_('Месяц')],
          [90, N_('3 месяца')],
          [180, N_('Полгода')],
          [365, N_('Год')],
        ].map(([n, label]) => (
          <button key={n} type="button" className={`chip ${+value === n ? 'on' : ''}`} aria-pressed={+value === n} onClick={() => setValue(n)}>
            {t(label)}
          </button>
        ))}
      </div>
    </>
  );

  const startCustom = async () => {
    const n = Math.max(7, Math.min(730, +days || 90));
    setBusy('custom');
    try {
      if (cpMode === 'par') {
        const list = streamList(streams, ownOrdered);
        const period = parMode === 'period' ? Math.max(7, Math.min(730, +periodDays || 90)) : null;
        const readings = await makeParallelPlan(list, period);
        if (!readings.length) throw new Error(t('Выберите книги'));
        const names = list.map((x) => (x.key === 'own' ? ownLabel() : t(STREAMS[x.key].short))).join(' + ');
        add({ planId: 'custom', name: period ? t('{scope} за {n} дн.', { scope: names, n: readings.length }) : t('{list} параллельно', { list: names }), readings });
        return;
      }
      const books = scope === 'own' ? ownOrdered : SCOPES[scope].books();
      if (!books.length) throw new Error(t('Выберите книги'));
      const readings = await makeCustomPlan(books, n);
      // Глав меньше, чем дней (Евангелия за 730 дней) — дней столько, сколько глав
      add({ planId: 'custom', name: t('{scope} за {n} дн.', { scope: scope === 'own' ? ownLabel() : t(SCOPES[scope].label), n: readings.length }), readings });
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
            <p>{cpMode === 'par' ? t('Каждый день — немного из разных частей Библии') : t('Читаете книги по порядку, понемногу каждый день')}</p>
          </div>
        </div>
        <Segmented
          id="plan-mode"
          value={cpMode}
          onChange={setCpMode}
          options={[
            ['seq', t('Последовательно')],
            ['par', t('Параллельно')],
          ]}
        />
        {/* «Последовательно» ↔ «Параллельно»: одно сворачивается, другое раскрывается */}
        <Reveal open={cpMode === 'par'}>
          <div className="cp-body">
            <Segmented
              id="plan-par-mode"
              value={parMode}
              onChange={setParMode}
              options={[
                ['perday', t('Глав в день')],
                ['period', t('За срок')],
              ]}
            />
            <div className="cp-label">{parMode === 'period' ? t('Разделы') : t('Разделы и глав в день')}</div>
            <div className="cp-streams">
              {Object.entries(STREAMS).map(([k, v]) => {
                const on = streams[k] != null;
                if (on) lastPer.current[k] = streams[k];
                const n = streams[k] ?? lastPer.current[k] ?? 1;
                const steps = on && parMode === 'perday';
                const per = (d) => setStreams((x) => ({ ...x, [k]: Math.max(1, Math.min(10, (x[k] || 1) + d)) }));
                return (
                  <div key={k} className={`cp-stream ${on ? 'on' : ''}`}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      className="cp-stream-name"
                      onClick={() => setStreams((x) => (on ? Object.fromEntries(Object.entries(x).filter(([y]) => y !== k)) : { ...x, [k]: 1 }))}
                    >
                      <span className="cp-check" aria-hidden="true">
                        <Check size={14} />
                      </span>
                      <span className="cp-stream-label">{t(v.label)}</span>
                    </button>
                    <div className={`cp-per-wrap ${steps ? 'on' : ''}`} inert={steps ? undefined : ''}>
                      <div className="cp-per">
                        <button type="button" className="cp-step small" onClick={() => per(-1)} disabled={n <= 1} aria-label={t('Уменьшить')}>
                          <Minus size={16} />
                        </button>
                        <span>{t('{n} гл. в день', { n })}</span>
                        <button type="button" className="cp-step small" onClick={() => per(1)} disabled={n >= 10} aria-label={t('Увеличить')}>
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Reveal open={streams.own != null}>
              <BookPicker value={own} onChange={setOwn} />
            </Reveal>
            {/* «За срок» ↔ «Глав в день»: срок и пояснение сменяют друг друга плавно */}
            <Reveal open={parMode === 'period'}>
              <div className="cp-body">{daysBlock('plan-par-days', periodDays, setPeriodDays, parLoad)}</div>
            </Reveal>
            <Reveal open={parMode !== 'period'}>
              {firstDay && Object.keys(streams).length > 0 && <p className="cp-first">{t('Первый день: {list}', { list: firstDay })}</p>}
              <p className="cp-note">{t('Короткие разделы начинаются заново, пока идут длинные.')}</p>
            </Reveal>
          </div>
        </Reveal>
        <Reveal open={cpMode !== 'par'}>
          <div className="cp-body">
            <div className="cp-label" id="plan-scope-l">
              {t('Что читать')}
            </div>
            <div className="cp-scopes" id="plan-scope" role="radiogroup" aria-labelledby="plan-scope-l">
              {[...Object.entries(SCOPES), ['own', { label: N_('Свои книги') }]].map(([k, v]) => (
                <button key={k} type="button" role="radio" aria-checked={scope === k} className={`cp-scope ${scope === k ? 'on' : ''}`} onClick={() => setScope(k)}>
                  {(() => {
                    // у каждого раздела свой значок (как у готовых планов); свои книги — список с отметками
                    const Icon = SCOPE_ICONS[k] || BookOpen;
                    return <Icon size={17} aria-hidden="true" />;
                  })()}
                  {t(v.label)}
                </button>
              ))}
            </div>
            <Reveal open={scope === 'own'}>
              <BookPicker value={own} onChange={setOwn} />
            </Reveal>
            {daysBlock('plan-days', days, setDays, seqLoad)}
          </div>
        </Reveal>
        <button
          className="btn primary cp-start"
          onClick={startCustom}
          disabled={!!busy || ((cpMode === 'par' ? streams.own != null : scope === 'own') && !own.length) || (cpMode === 'par' && parMode === 'perday' && !parDays)}
        >
          {busy === 'custom' ? <Loader2 size={16} className="spin" /> : <Play size={16} fill="currentColor" />}{' '}
          {/* срок и дата окончания — в строке нагрузки над кнопкой */}
          {cpMode === 'par' && parMode === 'perday' && !parDays ? t('Выберите книги') : t('Начать')}
        </button>
      </section>
    </BottomSheet>
  );
}
