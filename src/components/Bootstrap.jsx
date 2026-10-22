// Первый запуск: устанавливает базовый набор модулей из каталога, опубликованного вместе с приложением.
import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Library, RotateCw } from 'lucide-react';
import * as repo from '../core/modules.js';
import { load, save } from '../core/storage.js';
import { useApp } from '../App.jsx';
import { Progress } from './ui.jsx';
import { t } from '../core/i18n.js';

export default function Bootstrap() {
  const { openSheet } = useApp();
  const firstRun = !load('bootstrapped', false);
  const [state, setState] = useState(firstRun ? { phase: 'run', label: t('Подключаю каталог…'), p: 0 } : { phase: 'idle' });
  const started = useRef(false);

  const run = async () => {
    // Первую установку делает только этот экран — автодоустановка в App её не дублирует
    save('lateStarter', repo.LATE_STARTER);
    save('welcomePending', true); // когда библиотека будет готова, App покажет приветствие
    setState({ phase: 'run', label: t('Подключаю каталог…'), p: 0 });
    try {
      const catalog = await repo.fetchCatalog();
      const list = repo.STARTER.map((id) => catalog.find((c) => c.id === id)).filter(Boolean);
      // Перевод ставим первым: как только он готов, можно читать; остальное доустановится следом.
      const [bible, ...rest] = list;
      await repo.installFromCatalog(bible, (p, label) => setState({ phase: 'run', label: `${bible.name}: ${label}`, p }));
      save('bootstrapped', true);
      for (const m of rest) {
        try {
          await repo.installFromCatalog(m);
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
        <BookOpen size={36} strokeWidth={1.5} className="bootstrap-icon" />
        <h1>AO Bible</h1>
        {state.phase === 'run' && (
          <>
            <p>{t('Готовлю Синодальный перевод, словари и параллельные места…')}</p>
            <Progress value={state.p} label={state.label} />
          </>
        )}
        {state.phase === 'error' && (
          <>
            <p className="error-text">{state.message}</p>
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
