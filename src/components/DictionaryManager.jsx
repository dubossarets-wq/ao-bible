// Управление словарями: включение/отключение (влияет на нижнюю словарную панель), обновление, удаление.
import React from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import * as repo from '../core/modules.js';
import { ConfirmButton, Progress, fmtSize } from './ui.jsx';

const KIND = { strongs: 'по номерам Стронга', words: 'по словам' };

export default function DictionaryManager({ list, catalog, onUpdate, busy }) {
  const { toast } = useApp();
  return list.map((m) => {
    const cat = catalog?.find((c) => c.id === m.id);
    const on = m.enabled !== false;
    return (
      <div key={m.id} className={`mod-card ${on ? '' : 'off'}`}>
        <div className="mod-head">
          <span className="mod-name">{m.name}</span>
          <label className="inline-switch push" htmlFor={`dict-${m.id}`}>
            <input id={`dict-${m.id}`} type="checkbox" checked={on} onChange={(e) => repo.updateModuleMeta(m.id, { enabled: e.target.checked })} />
            {on ? 'Включён' : 'Отключён'}
          </label>
        </div>
        <p className="mod-desc">{m.description || m.title}</p>
        <div className="mod-meta">
          Поиск {KIND[m.dictionaryKind] || ''} · {m.language?.toUpperCase()} · {m.stats?.entries?.toLocaleString('ru-RU')} статей
          {m.size ? ` · ${fmtSize(m.sizeGz || m.size)}` : ''}
          <div>Лицензия: {m.license}</div>
          {m.source && <div className="mod-source">Источник: {m.source}</div>}
        </div>
        {busy[m.id] && <Progress value={busy[m.id].p} label={busy[m.id].label} />}
        <div className="row-actions">
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
  });
}
