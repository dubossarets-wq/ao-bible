// «Версии приложения»: список всех опубликованных версий с датой, временем и описанием.
// Можно обновиться до последней или откатиться на любую прежнюю. Автообновление выключено по умолчанию.
import React, { useEffect, useState } from 'react';
import { Loader2, History, CheckCircle2, RotateCcw } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { BUILD, fetchVersions, switchToVersion, buildDate, autoUpdateEnabled, setAutoUpdate } from '../core/updates.js';
import { Switch, Empty, ConfirmButton, Hint } from './ui.jsx';
import { listBackups, restoreBackup } from '../core/backup.js';

export default function VersionsSheet({ onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [auto, setAuto] = useState(autoUpdateEnabled());
  const [backups] = useState(listBackups);

  useEffect(() => {
    fetchVersions().then(setData, () => setError('Не удалось загрузить список версий. Проверьте подключение к интернету.'));
  }, []);

  const go = (build) => {
    setBusy(build);
    switchToVersion(build, data.latest);
  };

  return (
    <BottomSheet title="Версии приложения" subtitle={`Сейчас: ${buildDate(BUILD)}`} onClose={onClose} initial={1}>
      <Switch
        id="auto-update"
        checked={auto}
        onChange={(v) => {
          setAuto(v);
          setAutoUpdate(v);
        }}
        label="Обновлять автоматически"
        hint="Включено: новая версия ставится сама сразу после выхода. Выключено: приложение остаётся на выбранной версии. Откат на старую версию выключает автообновление."
      />
      {error && <p className="error-text">{error}</p>}
      {!data && !error && (
        <div className="loading">
          <Loader2 className="spin" size={20} /> Загружаю список версий…
        </div>
      )}
      {data && data.versions.length === 0 && <Empty icon={History} title="Версий пока нет" />}
      {data && (
        <ul className="versions">
          {data.versions.map((v) => {
            const current = v.build === BUILD;
            const latest = v.build === data.latest;
            return (
              <li key={v.build} className={`version ${current ? 'current' : ''}`}>
                <div className="version-head">
                  <span className="version-date">{buildDate(v.build, v.date)}</span>
                  {latest && <span className="badge ok">последняя</span>}
                  {current && (
                    <span className="badge muted-badge">
                      <CheckCircle2 size={13} /> установлена
                    </span>
                  )}
                </div>
                {v.notes && <p className="version-notes">{v.notes}</p>}
                {!current && (
                  <button className={`btn small ${latest ? 'primary' : ''}`} disabled={!!busy} onClick={() => go(v.build)}>
                    {busy === v.build ? <Loader2 className="spin" size={14} /> : null}
                    {latest ? 'Обновить до этой версии' : v.build > BUILD ? 'Перейти на эту версию' : 'Откатиться на эту версию'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <section className="nav-group">
        <h4>
          Резервные копии ваших данных
          <Hint>Настройки, закладки, заметки и любимые стихи сохраняются перед каждым обновлением (последние 5 копий).</Hint>
        </h4>
        {backups.length === 0 && <p className="field-hint">Копий пока нет — первая появится при следующем обновлении.</p>}
        {backups.length > 0 && (
          <ul className="versions backups">
            {backups.map((b) => (
              <li key={b.at} className="version">
                <div className="version-head">
                  <span className="version-date">{new Date(b.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="version-notes">
                  {b.reason} · закладок {b.bookmarks}, заметок {b.notes}, любимых {b.favorites}
                </p>
                <ConfirmButton className="btn small" confirmText="Восстановить" onConfirm={() => restoreBackup(b.at)}>
                  <RotateCcw size={14} /> Восстановить эту копию
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </BottomSheet>
  );
}
