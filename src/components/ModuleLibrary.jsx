// Библиотека модулей: установленные, онлайн-каталог, импорт файлов.
// Модули разложены по видам (переводы, комментарии, словари, карты, параллельные места) и показаны
// компактными строками: справа — действие (скачать / установлен / обновить) и стрелка «подробнее».
import React, { useEffect, useMemo, useState } from 'react';
import {
  Download, RefreshCw, Trash2, Star, CheckCircle2, Ban, Globe, BookOpen, BookText, Link2, ChevronDown,
  MessageSquareText, Map as MapIcon, Loader2,
  Search,
} from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import ModuleImporter from './ModuleImporter.jsx';
import { useApp } from '../App.jsx';
import * as repo from '../core/modules.js';
import { MODULE_TYPES, MODULE_SECTIONS } from '../core/schema.js';
import { isPersistent } from '../core/db.js';
import { ConfirmButton, Empty, Hint, fmtSize } from './ui.jsx';

export const TYPE_ICON = { bible: BookOpen, commentary: MessageSquareText, dictionary: BookText, maps: MapIcon, crossrefs: Link2 };

function statsText(m) {
  const s = m.stats;
  if (!s) return null;
  if (m.type === 'bible') return `${s.books} кн., ${s.verses?.toLocaleString('ru-RU')} стихов`;
  if (m.type === 'dictionary' || m.type === 'commentary') return `${s.entries?.toLocaleString('ru-RU')} статей`;
  if (m.type === 'maps') return `${s.maps} карт`;
  return `ссылки для ${s.verses?.toLocaleString('ru-RU')} стихов`;
}

function Details({ m }) {
  return (
    <div className="mod-details">
      {m.description && <p className="mod-desc">{m.description}</p>}
      <dl className="mod-facts">
        <dt>Вид</dt>
        <dd>{MODULE_TYPES[m.type] || m.type}{m.dictionaryKind ? (m.dictionaryKind === 'strongs' ? ' · по номерам Стронга' : ' · по словам') : ''}</dd>
        {statsText(m) && (
          <>
            <dt>Объём</dt>
            <dd>
              {statsText(m)}
              {m.size ? ` · ${fmtSize(m.sizeGz || m.size)}` : ''}
            </dd>
          </>
        )}
        {m.language && (
          <>
            <dt>Язык</dt>
            <dd>{m.language.toUpperCase()}</dd>
          </>
        )}
        {m.version && (
          <>
            <dt>Версия</dt>
            <dd>{m.version}</dd>
          </>
        )}
        {m.license && (
          <>
            <dt>Лицензия</dt>
            <dd>{m.license}</dd>
          </>
        )}
        {m.author && (
          <>
            <dt>Автор</dt>
            <dd>{m.author}</dd>
          </>
        )}
        {m.source && (
          <>
            <dt>Источник</dt>
            <dd className="mod-source">{m.source}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

// Одна компактная строка модуля
function ModuleRow({ m, installed, cat, busy, mode, onInstall, open, onToggle }) {
  const { settings, setSettings, toast } = useApp();
  const Icon = TYPE_ICON[m.type] || BookText;
  const isPrimary = installed && settings.primaryModule === installed.id;
  const updatable = installed && cat && !cat.unavailable && cat.version && installed.catalogVersion && cat.version !== installed.catalogVersion;
  const toggleable = installed && installed.type !== 'bible';
  const on = installed?.enabled !== false;
  const pct = busy ? Math.round((busy.p || 0) * 100) : 0;

  let action;
  if (busy)
    action = (
      <span className="row-act busy" title={busy.label} aria-label={`Загрузка ${pct}%`}>
        <Loader2 size={16} className="spin" />
        <span className="row-pct">{pct}%</span>
      </span>
    );
  else if (mode === 'catalog' && m.unavailable)
    action = (
      <span className="row-act muted" title="Нет свободной электронной версии" aria-label="Недоступен">
        <Ban size={20} />
      </span>
    );
  else if (updatable)
    action = (
      <button className="row-act accent" onClick={() => onInstall(cat)} aria-label={`Обновить ${m.name}`} title="Доступна новая версия модуля">
        <RefreshCw size={20} />
      </button>
    );
  else if (mode === 'installed' && installed?.type === 'bible')
    action = (
      <button
        className={`row-act ${isPrimary ? 'accent' : 'muted'}`}
        onClick={() => !isPrimary && (setSettings({ primaryModule: installed.id }), toast(`${installed.name} — основной перевод`))}
        aria-label={isPrimary ? 'Основной перевод' : `Сделать ${m.name} основным`}
        title={isPrimary ? 'Основной перевод' : 'Сделать основным'}
      >
        <Star size={20} fill={isPrimary ? 'currentColor' : 'none'} />
      </button>
    );
  else if (mode === 'installed' && toggleable)
    action = (
      <label className="row-switch" title={on ? 'Включён' : 'Отключён'}>
        <input type="checkbox" checked={on} onChange={(e) => repo.updateModuleMeta(installed.id, { enabled: e.target.checked })} aria-label={`${m.name}: ${on ? 'включён' : 'отключён'}`} />
        <span className="switch" aria-hidden="true" />
      </label>
    );
  else if (installed)
    action = (
      <span className="row-act ok" title="Установлен" aria-label="Установлен">
        <CheckCircle2 size={20} />
      </span>
    );
  else
    action = (
      <button className="row-act accent" onClick={() => onInstall(cat || m)} aria-label={`Скачать ${m.name}${m.sizeGz || m.size ? `, ${fmtSize(m.sizeGz || m.size)}` : ''}`} title={`Скачать${m.sizeGz || m.size ? ` · ${fmtSize(m.sizeGz || m.size)}` : ''}`}>
        <Download size={20} />
      </button>
    );

  return (
    <li className={`mod-row ${open ? 'open' : ''} ${toggleable && !on ? 'off' : ''} ${m.unavailable ? 'unavailable' : ''}`}>
      <div className="mod-line">
        <button className="mod-main" onClick={onToggle} aria-expanded={open}>
          <Icon size={20} className="mod-icon" />
          <span className="mod-texts">
            <span className="mod-name">{m.name}</span>
            <span className="mod-sub">{[m.language && langName(m.language), m.title || MODULE_TYPES[m.type]].filter(Boolean).join(' · ')}</span>
          </span>
        </button>
        {action}
        <button className="row-chev" onClick={onToggle} aria-label={open ? 'Свернуть' : 'Подробнее'} aria-expanded={open}>
          <ChevronDown size={20} />
        </button>
      </div>
      {open && (
        <div className="mod-more">
          <Details m={installed ? { ...cat, ...installed } : m} />
          {busy && <div className="progress-label">{busy.label}</div>}
          <div className="row-actions">
            {installed?.type === 'bible' && !isPrimary && (
              <button className="btn small" onClick={() => (setSettings({ primaryModule: installed.id }), toast(`${installed.name} — основной перевод`))}>
                <Star size={14} /> Сделать основным
              </button>
            )}
            {!installed && !m.unavailable && (
              <button className="btn small primary" disabled={!!busy} onClick={() => onInstall(cat || m)}>
                <Download size={14} /> Скачать{m.sizeGz || m.size ? ` · ${fmtSize(m.sizeGz || m.size)}` : ''}
              </button>
            )}
            {installed && cat && !cat.unavailable && (
              <button className="btn small" disabled={!!busy} onClick={() => onInstall(cat)}>
                <RefreshCw size={14} /> {updatable ? 'Обновить' : 'Переустановить'}
              </button>
            )}
            {installed && (
              <ConfirmButton className="btn small" confirmText="Удалить" onConfirm={() => repo.removeModule(installed.id).then(() => toast(`${installed.name} удалён`))}>
                <Trash2 size={14} /> Удалить
              </ConfirmButton>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function Sections({ items, mode, catalog, busy, onInstall, filter }) {
  const { modules } = useApp();
  const [open, setOpen] = useState(null);
  const groups = MODULE_SECTIONS.map(([type, label]) => [type, label, items.filter((m) => m.type === type)]).filter(
    ([type, , list]) => (filter === 'all' ? list.length : type === filter)
  );
  if (!groups.length) return <Empty icon={BookOpen} title="Модулей нет">{mode === 'installed' ? 'Установите их из онлайн-каталога или импортируйте JSON-файл.' : 'В каталоге пока нет модулей.'}</Empty>;
  return groups.map(([type, label, list]) => (
    <section key={type} className="nav-group">
      <h4>
        {label} <span className="tab-n">{list.length}</span>
      </h4>
      {list.length ? (
        <ul className="mod-list">
          {list.map((m) => {
            const installed = mode === 'installed' ? m : modules.find((x) => x.id === m.id);
            const cat = mode === 'catalog' ? m : catalog?.find((c) => c.id === m.id);
            return (
              <ModuleRow
                key={m.id}
                m={m}
                installed={installed}
                cat={cat}
                busy={busy[m.id]}
                mode={mode}
                onInstall={onInstall}
                open={open === m.id}
                onToggle={() => setOpen((o) => (o === m.id ? null : m.id))}
              />
            );
          })}
        </ul>
      ) : (
        <p className="field-hint">
          {mode === 'installed' ? `Не установлено. ` : `В каталоге пока нет. `}
          {type === 'commentary' && 'Комментарии к стихам (например, «Толковая Библия» Лопухина) можно импортировать в формате JSON.'}
          {type === 'maps' && 'Модули карт можно импортировать в формате JSON.'}
        </p>
      )}
    </section>
  ));
}

// Языки модулей: код → название; порядок показа
export const LANGS = { ru: 'Русский', cu: 'Церковнославянский', uk: 'Українська', en: 'English', he: 'Иврит', grc: 'Греческий' };
const langName = (code) => LANGS[code] || (code ? code.toUpperCase() : 'Другие');

function LangFilter({ value, onChange, items }) {
  const counts = {};
  items.forEach((m) => (counts[m.language || ''] = (counts[m.language || ''] || 0) + 1));
  const codes = Object.keys(counts).sort((a, b) => Object.keys(LANGS).indexOf(a) - Object.keys(LANGS).indexOf(b));
  if (codes.length < 2) return null;
  return (
    <div className="chips filter-chips lang-chips" role="group" aria-label="Язык модулей">
      {[['all', 'Все языки'], ...codes.map((c) => [c, langName(c)])].map(([k, l]) => (
        <button key={k} className={`chip ${value === k ? 'on' : ''}`} aria-pressed={value === k} onClick={() => onChange(k)}>
          {l}
          {k !== 'all' ? <span className="tab-n"> {counts[k]}</span> : null}
        </button>
      ))}
    </div>
  );
}

// Поиск по названию, описанию, автору и языку модуля
const matches = (m, q) => !q || [m.name, m.title, m.description, m.author, langName(m.language)].some((x) => x && x.toLowerCase().replace(/ё/g, 'е').includes(q));

function Filter({ value, onChange, counts }) {
  return (
    <div className="chips filter-chips" role="group" aria-label="Вид модулей">
      {[['all', 'Все'], ...MODULE_SECTIONS].map(([k, l]) => (
        <button key={k} className={`chip ${value === k ? 'on' : ''}`} aria-pressed={value === k} onClick={() => onChange(k)}>
          {l}
          {k !== 'all' && counts[k] ? <span className="tab-n"> {counts[k]}</span> : null}
        </button>
      ))}
    </div>
  );
}

export default function ModuleLibrary({ payload, onClose }) {
  const { toast, modules } = useApp();
  const [tab, setTab] = useState(payload.tab || 'installed');
  const [filter, setFilter] = useState(payload.section || 'all');
  const [catalog, setCatalog] = useState(null);
  const [catErr, setCatErr] = useState(null);
  const [busy, setBusy] = useState({});
  const [sourceUrl, setSourceUrl] = useState(repo.CATALOG_URL);
  const [url, setUrl] = useState('');
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

  const [lang, setLang] = useState('all');
  const [mq, setMq] = useState('');
  const q = mq.trim().toLowerCase().replace(/ё/g, 'е');
  const base = tab === 'installed' ? modules : catalog || [];
  const list = base.filter((m) => (lang === 'all' || (m.language || '') === lang) && matches(m, q));
  const counts = useMemo(() => Object.fromEntries(MODULE_SECTIONS.map(([t]) => [t, list.filter((m) => m.type === t).length])), [list]);

  return (
    <BottomSheet title="Библиотека модулей" onClose={onClose} variant="wide">
      {!persist && <p className="warn small">Браузер не дал доступ к IndexedDB: модули работают до перезагрузки страницы и не сохраняются.</p>}
      <div className="tabs" role="tablist" aria-label="Разделы библиотеки">
        {[
          ['installed', 'Установленные'],
          ['catalog', 'Каталог'],
          ['import', 'Импорт'],
        ].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab !== 'import' && (
        <>
          <div className="input-wrap">
            <Search size={18} className="input-icon" />
            <label htmlFor="mod-q" className="sr-only">
              Поиск модулей
            </label>
            <input id="mod-q" type="search" value={mq} onChange={(e) => setMq(e.target.value)} placeholder="Поиск модулей: Лопухин, Стронг, KJV…" autoComplete="off" />
          </div>
          <Filter value={filter} onChange={setFilter} counts={counts} />
          <LangFilter value={lang} onChange={setLang} items={base} />
        </>
      )}
      {tab === 'installed' && <Sections items={list} mode="installed" catalog={catalog} busy={busy} onInstall={install} filter={filter} />}
      {tab === 'catalog' && (
        <>
          {catErr && <p className="error-text">{catErr}</p>}
          {!catalog && !catErr && (
            <div className="loading">
              <Loader2 className="spin" size={20} /> Загружаю каталог…
            </div>
          )}
          {catalog && <Sections items={list} mode="catalog" catalog={catalog} busy={busy} onInstall={install} filter={filter} />}
          <section className="nav-group">
            <h4>
              Источник каталога
              <Hint>
                {sourceUrl === repo.CATALOG_URL ? 'Сейчас — каталог, опубликованный вместе с приложением. ' : `Сейчас — ${sourceUrl}. `}
                Можно подключить другой каталог в формате aob-catalog по адресу https://…/catalog.json (сервер должен разрешать CORS).
              </Hint>
            </h4>
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
              <input id="cat-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/catalog.json" inputMode="url" autoComplete="off" />
              <button className="btn" type="submit">
                Подключить
              </button>
            </form>
            <div className="row-actions">
              {sourceUrl !== repo.CATALOG_URL && (
                <button className="btn small" onClick={() => (setUrl(''), setSourceUrl(repo.CATALOG_URL))}>
                  Встроенный каталог
                </button>
              )}
              <button className="btn small" onClick={loadCatalog}>
                <RefreshCw size={14} /> Обновить список
              </button>
            </div>
          </section>
        </>
      )}
      {tab === 'import' && <ModuleImporter onDone={() => setTab('installed')} />}
    </BottomSheet>
  );
}
