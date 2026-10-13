// Библиотека модулей: установленные, онлайн-каталог, импорт файлов.
import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Trash2, Star, CheckCircle2, Ban, Globe, BookOpen, BookText, Link2 } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import ModuleImporter from './ModuleImporter.jsx';
import DictionaryManager from './DictionaryManager.jsx';
import { useApp } from '../App.jsx';
import * as repo from '../core/modules.js';
import { MODULE_TYPES } from '../core/schema.js';
import { isPersistent } from '../core/db.js';
import { ConfirmButton, Progress, Empty, fmtSize } from './ui.jsx';

const TYPE_ICON = { bible: BookOpen, dictionary: BookText, crossrefs: Link2 };

function ModuleMeta({ m }) {
  const stats = m.stats
    ? m.type === 'bible'
      ? `${m.stats.books} кн., ${m.stats.verses?.toLocaleString('ru-RU')} стихов`
      : m.type === 'dictionary'
        ? `${m.stats.entries?.toLocaleString('ru-RU')} статей`
        : `ссылки для ${m.stats.verses?.toLocaleString('ru-RU')} стихов`
    : null;
  return (
    <div className="mod-meta">
      {[MODULE_TYPES[m.type], m.language?.toUpperCase(), m.version && `версия ${m.version}`, stats, m.size && fmtSize(m.sizeGz || m.size)].filter(Boolean).join(' · ')}
      {m.license && <div>Лицензия: {m.license}</div>}
      {m.author && <div>Автор: {m.author}</div>}
      {m.source && <div className="mod-source">Источник: {m.source}</div>}
    </div>
  );
}

function Installed({ catalog, onUpdate, busy }) {
  const { modules, settings, setSettings, toast } = useApp();
  const groups = ['bible', 'dictionary', 'crossrefs'].map((t) => [t, modules.filter((m) => m.type === t)]);
  if (!modules.length) return <Empty icon={BookOpen} title="Модулей нет">Установите их из онлайн-каталога или импортируйте JSON-файл.</Empty>;
  return (
    <>
      {groups.map(([type, list]) =>
        list.length ? (
          <section key={type} className="nav-group">
            <h4>{{ bible: 'Переводы', dictionary: 'Словари', crossrefs: 'Параллельные места' }[type]}</h4>
            {type === 'dictionary' ? (
              <DictionaryManager list={list} catalog={catalog} onUpdate={onUpdate} busy={busy} />
            ) : (
              list.map((m) => {
                const cat = catalog?.find((c) => c.id === m.id);
                return (
                  <div key={m.id} className="mod-card">
                    <div className="mod-head">
                      <span className="mod-name">{m.name}</span>
                      <span className="mod-title">{m.title}</span>
                    </div>
                    {m.description && <p className="mod-desc">{m.description}</p>}
                    <ModuleMeta m={m} />
                    {busy[m.id] && <Progress value={busy[m.id].p} label={busy[m.id].label} />}
                    <div className="row-actions">
                      {type === 'bible' &&
                        (settings.primaryModule === m.id ? (
                          <span className="badge ok">
                            <Star size={13} fill="currentColor" /> Основной
                          </span>
                        ) : (
                          <button className="btn small" onClick={() => (setSettings({ primaryModule: m.id }), toast(`${m.name} — основной перевод`))}>
                            <Star size={14} /> Сделать основным
                          </button>
                        ))}
                      {type === 'crossrefs' && (
                        <label className="inline-switch">
                          <input type="checkbox" checked={m.enabled !== false} onChange={(e) => repo.updateModuleMeta(m.id, { enabled: e.target.checked })} /> Включён
                        </label>
                      )}
                      {cat && !cat.unavailable && (
                        <button className="btn small" disabled={!!busy[m.id]} onClick={() => onUpdate(cat)}>
                          <RefreshCw size={14} /> Обновить
                        </button>
                      )}
                      <ConfirmButton className="btn small" confirmText="Удалить" onConfirm={() => repo.removeModule(m.id).then(() => toast(`${m.name} удалён`))}>
                        <Trash2 size={14} /> Удалить
                      </ConfirmButton>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        ) : null
      )}
    </>
  );
}

function Catalog({ catalog, error, onInstall, busy, reload, sourceUrl, setSourceUrl }) {
  const { modules } = useApp();
  const [url, setUrl] = useState(sourceUrl === repo.CATALOG_URL ? '' : sourceUrl);
  return (
    <>
      <p className="sheet-hint">
        <Globe size={14} /> Источник: {sourceUrl === repo.CATALOG_URL ? 'каталог, опубликованный вместе с приложением' : sourceUrl}
      </p>
      {error && <p className="error-text">{error}</p>}
      {!catalog && !error && <Progress value={0} label="Загружаю каталог…" />}
      {catalog?.map((c) => {
        const installed = modules.find((m) => m.id === c.id);
        const Icon = TYPE_ICON[c.type] || BookText;
        return (
          <div key={c.id} className={`mod-card ${c.unavailable ? 'disabled' : ''}`}>
            <div className="mod-head">
              <Icon size={18} className="accent" />
              <span className="mod-name">{c.name}</span>
              <span className="mod-title">{c.title}</span>
            </div>
            {c.description && <p className="mod-desc">{c.description}</p>}
            {!c.unavailable && <ModuleMeta m={c} />}
            {busy[c.id] && <Progress value={busy[c.id].p} label={busy[c.id].label} />}
            <div className="row-actions">
              {c.unavailable ? (
                <span className="badge muted-badge">
                  <Ban size={13} /> Ожидает загрузки — нет свободной электронной версии
                </span>
              ) : installed ? (
                <>
                  <span className="badge ok">
                    <CheckCircle2 size={13} /> Установлен
                  </span>
                  <button className="btn small" disabled={!!busy[c.id]} onClick={() => onInstall(c)}>
                    <RefreshCw size={14} /> Переустановить
                  </button>
                </>
              ) : (
                <button className="btn small primary" disabled={!!busy[c.id]} onClick={() => onInstall(c)}>
                  <Download size={14} /> Установить {c.sizeGz || c.size ? `· ${fmtSize(c.sizeGz || c.size)}` : ''}
                </button>
              )}
            </div>
          </div>
        );
      })}
      <section className="nav-group">
        <h4>Другой каталог</h4>
        <form
          className="ref-form"
          onSubmit={(e) => {
            e.preventDefault();
            setSourceUrl(url.trim() || repo.CATALOG_URL);
          }}
        >
          <label htmlFor="cat-url" className="sr-only">
            Адрес каталога
          </label>
          <input id="cat-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/catalog.json (формат aob-catalog)" inputMode="url" autoComplete="off" />
          <button className="btn" type="submit">
            Подключить
          </button>
        </form>
        <p className="field-hint">
          Внутри Claude Artifact браузер пропускает только файлы самого приложения, поэтому внешний адрес здесь не загрузится. В установленной версии (PWA на своём домене) работает любой каталог с разрешённым CORS.
        </p>
        {sourceUrl !== repo.CATALOG_URL && (
          <button className="btn small" onClick={() => (setUrl(''), setSourceUrl(repo.CATALOG_URL))}>
            Вернуть встроенный каталог
          </button>
        )}
        <button className="btn small" onClick={reload}>
          <RefreshCw size={14} /> Обновить список
        </button>
      </section>
    </>
  );
}

export default function ModuleLibrary({ pane, payload, onClose }) {
  const { toast } = useApp();
  const [tab, setTab] = useState(payload.tab || 'installed');
  const [catalog, setCatalog] = useState(null);
  const [catErr, setCatErr] = useState(null);
  const [busy, setBusy] = useState({});
  const [sourceUrl, setSourceUrl] = useState(repo.CATALOG_URL);
  const [persist, setPersist] = useState(true);

  const loadCatalog = () => {
    setCatalog(null);
    setCatErr(null);
    repo.fetchCatalog(sourceUrl).then(setCatalog, (e) => setCatErr(e.message));
  };
  useEffect(loadCatalog, [sourceUrl]);
  useEffect(() => {
    isPersistent().then(setPersist);
  }, []);

  const install = async (c) => {
    setBusy((b) => ({ ...b, [c.id]: { p: 0, label: 'Подготовка…' } }));
    try {
      await repo.installFromCatalog(c, (p, label) => setBusy((b) => ({ ...b, [c.id]: { p, label } })));
      toast(`${c.name} установлен`);
    } catch (e) {
      toast(`${c.name}: ${e.message}`, 'error');
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[c.id];
        return n;
      });
    }
  };

  return (
    <BottomSheet title="Библиотека модулей" onClose={onClose} variant="wide">
      {!persist && <p className="warn small">Браузер не дал доступ к IndexedDB: модули работают до перезагрузки страницы и не сохраняются.</p>}
      <div className="tabs" role="tablist" aria-label="Разделы библиотеки">
        {[
          ['installed', 'Установленные'],
          ['catalog', 'Онлайн-каталог'],
          ['import', 'Импорт файлов'],
        ].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'installed' && <Installed catalog={catalog} onUpdate={install} busy={busy} />}
      {tab === 'catalog' && <Catalog catalog={catalog} error={catErr} onInstall={install} busy={busy} reload={loadCatalog} sourceUrl={sourceUrl} setSourceUrl={setSourceUrl} />}
      {tab === 'import' && <ModuleImporter onDone={() => setTab('installed')} />}
    </BottomSheet>
  );
}
