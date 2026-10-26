// Импорт модулей с устройства: выбор или перетаскивание JSON (.json, .json.gz),
// проверка структуры, предпросмотр, установка с прогрессом.
import React, { useRef, useState } from 'react';
import { Upload, FileJson, AlertTriangle, CheckCircle2, Copy } from 'lucide-react';
import { useApp } from '../App.jsx';
import * as repo from '../core/modules.js';
import { MODULE_TYPES } from '../core/schema.js';
import { Progress, Fold, fmtSize } from './ui.jsx';
import { t, fmtNum } from '../core/i18n.js';

// Пример файла модуля — образец формата, не переводится
const SAMPLE = `{
  "format": "aob-module",
  "formatVersion": 1,
  "type": "dictionary",
  "dictionaryKind": "words",
  "id": "my-dictionary",
  "name": "Мой словарь",
  "language": "ru",
  "license": "CC BY 4.0",
  "entries": {
    "агнец": {
      "word": "Агнец",
      "text": "Ягнёнок; жертвенное животное…",
      "refs": ["John.1.29", "Rev.5.6"]
    }
  }
}`;

export default function ModuleImporter({ onDone }) {
  const { modules, toast } = useApp();
  const [items, setItems] = useState([]); // { key, file, state: 'reading'|'ready'|'error'|'installing'|'done', p, label, norm, error }
  const [drag, setDrag] = useState(false);
  const input = useRef(null);

  const patch = (key, p) => setItems((list) => list.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const addFiles = async (files) => {
    for (const file of files) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setItems((l) => [...l, { key, file, state: 'reading', p: 0, label: t('Чтение…') }]);
      try {
        const norm = await repo.importFile(file, (p, label) => patch(key, { p, label }));
        patch(key, { state: 'ready', norm, p: 0.5 });
      } catch (e) {
        patch(key, { state: 'error', error: e.message });
      }
    }
  };

  const install = async (it) => {
    patch(it.key, { state: 'installing', p: 0.5, label: t('Установка…') });
    try {
      await repo.installNormalized(it.norm, { origin: 'file', onProgress: (p, label) => patch(it.key, { p: 0.5 + p * 0.5, label }) });
      patch(it.key, { state: 'done' });
      toast(t('{name} установлен', { name: it.norm.meta.name }));
    } catch (e) {
      patch(it.key, { state: 'error', error: t('Не удалось сохранить: {error}', { error: repo.errorText(e) }) });
    }
  };

  const copySample = async () => {
    try {
      await navigator.clipboard.writeText(SAMPLE);
      toast(t('Пример скопирован'));
    } catch {
      toast(t('Выделите пример и скопируйте вручную'));
    }
  };

  return (
    <>
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles([...e.dataTransfer.files]);
        }}
      >
        <Upload size={26} strokeWidth={1.6} />
        <div>{t('Перетащите JSON-файлы сюда или')}</div>
        <button className="btn primary" onClick={() => input.current?.click()}>
          {t('Выбрать файлы')}
        </button>
        <input
          ref={input}
          id="import-file"
          type="file"
          accept=".json,.gz,application/json,application/gzip"
          multiple
          hidden
          onChange={(e) => {
            addFiles([...e.target.files]);
            e.target.value = '';
          }}
        />
        <div className="field-hint">{t('Переводы, словари, параллельные места · .json или .json.gz')}</div>
      </div>

      {items.map((it) => {
        const m = it.norm?.meta;
        const exists = m && modules.some((x) => x.id === m.id);
        return (
          <div key={it.key} className="mod-card">
            <div className="mod-head">
              <FileJson size={18} className="accent" />
              <span className="mod-name">{m?.name || it.file.name}</span>
              <span className="mod-title">
                {it.file.name} · {fmtSize(it.file.size)}
              </span>
            </div>
            {(it.state === 'reading' || it.state === 'installing') && <Progress value={it.p} label={it.label} />}
            {it.state === 'error' && (
              <p className="error-text">
                <AlertTriangle size={15} /> {it.error}
              </p>
            )}
            {m && it.state !== 'error' && (
              <>
                <div className="mod-meta">
                  {t('Тип: {type}', { type: MODULE_TYPES[m.type] ? t(MODULE_TYPES[m.type]) : m.type })}
                  {m.dictionaryKind ? ` (${m.dictionaryKind === 'strongs' ? t('по номерам Стронга') : t('по словам')})` : ''} · id: <span className="mono">{m.id}</span>
                  {m.type === 'bible' && ` · ${t('{books} кн., {verses} стихов', { books: m.stats.books, verses: fmtNum(m.stats.verses) })}${m.features.strongs ? `, ${t('есть номера Стронга')}` : ''}`}
                  {m.type === 'dictionary' && ` · ${t('{n} статей', { n: fmtNum(m.stats.entries) })}`}
                  {m.type === 'crossrefs' && ` · ${t('ссылки для {n} стихов', { n: fmtNum(m.stats.verses) })}`}
                  <div>{t('Лицензия: {license}', { license: m.license })}</div>
                </div>
                {it.norm.warnings.length > 0 && (
                  <ul className="warn-list">
                    {it.norm.warnings.map((w, i) => (
                      <li key={i}>
                        <AlertTriangle size={13} /> {w}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <div className="row-actions">
              {it.state === 'ready' && (
                <button className="btn small primary" onClick={() => install(it)}>
                  {exists ? t('Заменить установленный') : t('Установить')}
                </button>
              )}
              {it.state === 'done' && (
                <>
                  <span className="badge ok">
                    <CheckCircle2 size={13} /> {t('Установлен')}
                  </span>
                  <button className="btn small" onClick={onDone}>
                    {t('К установленным')}
                  </button>
                </>
              )}
              {it.state !== 'installing' && it.state !== 'done' && (
                <button className="btn small" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))}>
                  {t('Убрать')}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <Fold title={t('Формат модуля')} id="imp-format">
        <p className="field-hint">
          {t('Родной формат — {native} (описание: docs/MODULE_SCHEMA.md в проекте). Также принимаются массив книг с полем {chapters}, список стихов {verses}, словарь {dict} и список статей {entries}.', {
            native: <span className="mono">aob-module</span>,
            chapters: <span className="mono">chapters</span>,
            verses: <span className="mono">{'{book, chapter, verse, text}'}</span>,
            dict: <span className="mono">{'{"H1": {...}}'}</span>,
            entries: <span className="mono">{'[{word, definition}]'}</span>,
          })}
        </p>
        <pre className="code">{SAMPLE}</pre>
        <button className="btn small btn-block" onClick={copySample}>
          <Copy size={14} /> {t('Скопировать пример')}
        </button>
      </Fold>
    </>
  );
}
