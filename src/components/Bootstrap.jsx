// Первый запуск: устанавливает базовый набор модулей из каталога, опубликованного вместе с приложением.
import React, { useEffect, useRef, useState } from 'react';
import { Check, Library, RotateCw, WifiOff } from 'lucide-react';
import * as repo from '../core/modules.js';
import { load, save } from '../core/storage.js';
import { useApp } from '../App.jsx';
import { t } from '../core/i18n.js';

// Логотип AO Bible («AΩ Bible»: крест над раскрытой Библией) — как значок приложения в Google Play
function AppLogo() {
  return <img className="boot-logo" src="icons/logo-264.jpg" width="132" height="132" alt="" aria-hidden="true" />;
}

// Этапы установки по доле прогресса: каталог (ещё 0) → загрузка (до 60 %) → распаковка и запись
function Steps({ p, started }) {
  const stage = !started ? 0 : p < 0.6 ? 1 : p < 1 ? 2 : 3;
  const items = [t('Каталог модулей'), t('Загрузка перевода'), t('Установка')];
  const pct = Math.round((p || 0) * 100);
  return (
    <div className="boot-steps">
      <ol>
        {items.map((label, i) => {
          const st = i < stage ? 'done' : i === stage ? 'now' : 'wait';
          return (
            <li key={i} className={`boot-step ${st}`} aria-current={st === 'now' ? 'step' : undefined}>
              <span className="boot-mark">{st === 'done' ? <Check size={12} strokeWidth={3} /> : st === 'now' ? <span className="boot-spin" /> : null}</span>
              <span className="boot-label">{label}</span>
            </li>
          );
        })}
      </ol>
      <div className="boot-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="boot-track">
          <div className="boot-fill" style={{ transform: `scaleX(${Math.max(0.02, p || 0)})` }} />
        </div>
        <span className="boot-pct">{pct}%</span>
      </div>
    </div>
  );
}

export default function Bootstrap() {
  const { openSheet, modules, setSettings } = useApp();
  // Первый запуск — или данные восстановлены из резервной копии Android на новом телефоне (настройки и закладки
  // вернулись, а модулей нет совсем): ставим стартовый набор сами
  const firstRun = !load('bootstrapped', false) || modules?.length === 0;
  const [state, setState] = useState(firstRun ? { phase: 'run', label: t('Подключаю каталог…'), p: 0, started: false } : { phase: 'idle' });
  const started = useRef(false);

  const run = async () => {
    // Первую установку делает только этот экран — автодоустановка в App её не дублирует
    save('lateStarter', repo.lateStarter());
    if (!load('bootstrapped', false)) {
      save('welcomePending', true); // приветствие — только новому человеку, не после восстановления
      setSettings({ primaryModule: repo.homeBible() }); // основной перевод — на языке интерфейса
    }
    setState({ phase: 'run', label: t('Подключаю каталог…'), p: 0, started: false });
    try {
      const catalog = await repo.fetchCatalog();
      const list = repo.starter().map((id) => catalog.find((c) => c.id === id)).filter(Boolean);
      // Перевод ставим первым: как только он готов, можно читать; остальное доустановится следом.
      const [bible, ...rest] = list;
      await repo.installFromCatalog(bible, (p, label) => setState({ phase: 'run', label: `${bible.name}: ${label}`, p, started: true }));
      save('bootstrapped', true);
      // Следующий модуль качается, пока текущий распаковывается и записывается (по одному наперёд — память не растёт)
      let next = rest[0] ? repo.downloadModule(rest[0]).catch(() => null) : null;
      for (let i = 0; i < rest.length; i++) {
        const m = rest[i];
        const mine = next;
        next = rest[i + 1] ? repo.downloadModule(rest[i + 1]).catch(() => null) : null;
        try {
          const buf = await mine;
          await repo.installFromCatalog(m, undefined, buf ? Promise.resolve(buf) : null);
        } catch (e) {
          console.warn('Не удалось установить', m.id, e); // i18n-ignore: только для разработчика
        }
      }
      window.dispatchEvent(new Event('aob-bootstrapped')); // стартовые модули скачаны — можно ставить service worker
    } catch (e) {
      setState({ phase: 'error', message: repo.errorText(e) });
    }
  };

  useEffect(() => {
    if (firstRun && !started.current) {
      started.current = true;
      run();
    }
  }, []);

  return (
    <div className="bootstrap">
      <div className="bootstrap-card">
        <AppLogo />
        {/* название — уже на логотипе; для чтения с экрана — скрытым заголовком */}
        <h1 className="sr-only">AO Bible</h1>
        {state.phase === 'run' && (
          <>
            <p>{t('Готовлю Синодальный перевод, словари и параллельные места…')}</p>
            <Steps p={state.p} started={state.started} />
            <p className="boot-note">{t('Это нужно только один раз — дальше Библия работает без интернета.')}</p>
          </>
        )}
        {state.phase === 'error' && (
          <>
            <div className="boot-error">
              <WifiOff size={20} />
              <span>{state.message}</span>
            </div>
            <div className="row-actions">
              <button className="btn primary" onClick={run}>
                <RotateCw size={16} /> {t('Повторить')}
              </button>
              <button className="btn" onClick={() => openSheet('library', 0, { tab: 'import' })}>
                <Library size={16} /> {t('Импорт из файла')}
              </button>
            </div>
          </>
        )}
        {state.phase === 'idle' && (
          <>
            <p>{t('Пока нет ни одного перевода. Скачайте его из каталога или импортируйте JSON-файл.')}</p>
            <div className="row-actions">
              <button className="btn primary" onClick={run}>{t('Установить Синодальный перевод и словари')}</button>
              <button className="btn" onClick={() => openSheet('library', 0, { tab: 'catalog' })}>
                <Library size={16} /> {t('Библиотека модулей')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
