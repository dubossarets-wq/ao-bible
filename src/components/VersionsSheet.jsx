// «Версии приложения»: список всех опубликованных версий с датой, временем и описанием.
// Можно обновиться до последней или откатиться на любую прежнюю. Автообновление выключено по умолчанию.
import React, { useEffect, useState } from 'react';
import { Loader2, History, CheckCircle2, RotateCcw, RefreshCw } from 'lucide-react';
import { useApp } from '../App.jsx';
import BottomSheet from './BottomSheet.jsx';
import { BUILD, fetchVersions, switchToVersion, buildDate, autoUpdateEnabled, setAutoUpdate } from '../core/updates.js';
import { Switch, Empty, ConfirmButton, Hint } from './ui.jsx';
import { listBackups, restoreBackup, reasonLabel } from '../core/backup.js';
import { t, fmtDateTime } from '../core/i18n.js';

export default function VersionsSheet({ onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [auto, setAuto] = useState(autoUpdateEnabled());
  const [backups] = useState(listBackups);

  const { toast } = useApp();
  const [checking, setChecking] = useState(false);
  const load = () => fetchVersions().then(setData, () => setError(t('Не удалось загрузить версии. Проверьте интернет.')));
  useEffect(() => {
    load();
  }, []);

  // Кнопка «обновить» рядом с крестиком: свежий список версий; есть новее установленной — сразу обновляемся
  const refresh = async () => {
    if (checking) return;
    setChecking(true);
    setError(null);
    try {
      const d = await fetchVersions();
      setData(d);
      if (d.latest && d.latest > BUILD) {
        toast(t('Есть новая версия — обновляюсь…'));
        setTimeout(() => switchToVersion(d.latest, d.latest), 500);
        return;
      }
      toast(t('У вас последняя версия'));
    } catch {
      setError(t('Не удалось проверить обновления. Проверьте интернет.'));
    } finally {
      setChecking(false);
    }
  };

  const go = (build) => {
    setBusy(build);
    switchToVersion(build, data.latest);
  };

  return (
    <BottomSheet
      title={t('Версии приложения')}
      subtitle={t('Сейчас: {date}', { date: buildDate(BUILD) })}
      onClose={onClose}
      initial={1}
      headerExtra={
        <button className="icon-btn" onClick={refresh} aria-label={t('Проверить обновления')} title={t('Проверить обновления')} disabled={checking}>
          <RefreshCw size={20} className={checking ? 'spin' : ''} />
        </button>
      }
    >
      <Switch
        id="auto-update"
        checked={auto}
        onChange={(v) => {
          setAuto(v);
          setAutoUpdate(v);
        }}
        label={t('Обновлять автоматически')}
        hint={t('Новая версия ставится сама, как только выйдет. Откат на старую версию это выключает.')}
      />
      {error && <p className="error-text">{error}</p>}
      {!data && !error && (
        <div className="loading">
          <Loader2 className="spin" size={20} /> {t('Загружаю список версий…')}
        </div>
      )}
      {data && data.versions.length === 0 && <Empty icon={History} title={t('Версий пока нет')} />}
      {data && (
        <ul className="versions">
          {data.versions.map((v) => {
            const current = v.build === BUILD;
            const latest = v.build === data.latest;
            return (
              <li key={v.build} className={`version ${current ? 'current' : ''}`}>
                <div className="version-head">
                  <span className="version-date">{buildDate(v.build, v.date)}</span>
                  {latest && <span className="badge ok">{t('последняя')}</span>}
                  {current && (
                    <span className="badge muted-badge">
                      <CheckCircle2 size={13} /> {t('установлена')}
                    </span>
                  )}
                </div>
                {v.notes && <p className="version-notes">{v.notes}</p>}
                {!current && (
                  <button className={`btn small ${latest ? 'primary' : ''}`} disabled={!!busy} onClick={() => go(v.build)}>
                    {busy === v.build ? <Loader2 className="spin" size={14} /> : null}
                    {latest ? t('Обновить до этой версии') : v.build > BUILD ? t('Перейти на эту версию') : t('Откатиться на эту версию')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <section className="nav-group">
        <h4>
          {t('Резервные копии')}
          <Hint>{t('Настройки, закладки, заметки и любимые стихи сохраняются перед каждым обновлением (последние 5 копий).')}</Hint>
        </h4>
        {backups.length === 0 && <p className="field-hint">{t('Копий пока нет — первая появится при следующем обновлении.')}</p>}
        {backups.length > 0 && (
          <ul className="versions backups">
            {backups.map((b) => (
              <li key={b.at} className="version">
                <div className="version-head">
                  <span className="version-date">{fmtDateTime(b.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="version-notes">
                  {reasonLabel(b.reason)} · {t('закладок {bookmarks}, заметок {notes}, любимых {favorites}', { bookmarks: b.bookmarks, notes: b.notes, favorites: b.favorites })}
                </p>
                <ConfirmButton className="btn small" confirmText={t('Восстановить')} onConfirm={() => restoreBackup(b.at)}>
                  <RotateCcw size={14} /> {t('Восстановить эту копию')}
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </BottomSheet>
  );
}
