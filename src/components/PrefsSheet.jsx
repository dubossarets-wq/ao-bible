// Настройки: что показывать в меню ⋮, вид текста, аудио (ИИ-диктор, книги без интернета),
// библиотека модулей, мои данные (сохранить в файл / перенести на другой телефон), обновления и «О приложении».
import React, { useRef, useState } from 'react';
import { ChevronRight, Library, Palette, RefreshCw, History, Info, Download, Upload, Trash2, BookOpenCheck, Loader2, AlignLeft, MoreVertical, Headphones, HardDrive } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { Segmented, Switch, Hint, ConfirmButton } from './ui.jsx';
import { textView } from './AppearanceSettings.jsx';
import { IS_PWA_BUILD, applyUpdate, buildDate, BUILD } from '../core/updates.js';
import { saveDataFile, readDataFile, describeData, importData } from '../core/dataFile.js';
import { listOffline, removeBook } from '../core/offlineAudio.js';
import { bookMeta } from '../core/books.js';

// Строка-переход в другой раздел
function Row({ icon: Icon, children, sub, onClick, extra }) {
  return (
    <button className="pref-row" onClick={onClick}>
      <Icon size={19} />
      <span className="pref-row-text">
        {children}
        {sub && <small>{sub}</small>}
      </span>
      {extra}
      <ChevronRight size={17} className="pref-chev" />
    </button>
  );
}

const MENU_ITEMS = [
  ['help', 'Инструкция'],
  ['lastBookmark', '«К последней закладке»'],
  ['sermons', 'Проповеди'],
  ['plans', 'Планы чтения'],
  ['listen', '«Слушать с этого места»'],
  ['maps', 'Карты'],
  ['focus', 'Режим чтения (вкл/выкл)', 'Прячет кнопки в тексте, верхняя панель уходит при прокрутке вниз'],
  ['book', '«Как книга» (вкл/выкл)', 'Быстро переключать текст в вид книги и обратно'],
  ['split', 'Синхронная прокрутка и расположение панелей', 'Видны в меню, когда экран разделён на две панели'],
];

function MyData() {
  const { toast } = useApp();
  const input = useRef(null);
  const [pending, setPending] = useState(null); // файл, который собираются восстановить
  const [err, setErr] = useState(null);
  const save = async () => {
    const r = await saveDataFile();
    if (r === 'downloaded') toast('Файл с данными сохранён в «Загрузки»');
    if (r === 'shared') toast('Файл с данными сохранён');
  };
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr(null);
    try {
      setPending(await readDataFile(f));
    } catch (x) {
      setErr(x.message);
    }
  };
  const d = pending && describeData(pending);
  return (
    <section className="settings-group">
      <p className="pref-note">
        Сохраните файл, чтобы не потерять заметки или перенести всё на другой телефон. В файл входят закладки, заметки, любимые стихи, выделения, планы, проповеди и настройки.
      </p>
      <div className="pref-btns">
        <button className="btn primary" onClick={save}>
          <Download size={17} /> Сохранить в файл
        </button>
        <button className="btn" onClick={() => input.current?.click()}>
          <Upload size={17} /> Восстановить из файла
        </button>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={pick} />
      </div>
      {err && <p className="error-text small">{err}</p>}
      {d && (
        <div className="pref-restore">
          <p>
            В файле{d.at ? ` от ${d.at.toLocaleDateString('ru-RU')}` : ''}: закладок {d.bookmarks}, заметок {d.notes}, любимых стихов {d.favorites}, выделений {d.highlights}, планов {d.plans}, проповедей {d.sermons}.
          </p>
          <p className="pref-note">Данные в этом телефоне заменятся данными из файла. Нынешние сохранятся в резервной копии («Версии приложения»).</p>
          <div className="pref-btns">
            <button className="btn primary" onClick={() => importData(pending)}>
              Восстановить
            </button>
            <button className="btn" onClick={() => setPending(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function OfflineList() {
  const { modules } = useApp();
  const [list, setList] = useState(listOffline);
  const items = Object.entries(list);
  if (!items.length)
    return <p className="pref-note">Пока ничего не скачано. Чтобы слушать без интернета: включите прослушивание, нажмите в проигрывателе кнопку настроек (с ползунками) и «Скачать».</p>;
  const total = items.reduce((a, [, v]) => a + (v.bytes || 0), 0);
  return (
    <>
      <p className="pref-note">Скачано {items.length} кн. · {(total / 1048576).toFixed(0)} МБ</p>
      <ul className="pref-list">
        {items.map(([k, v]) => {
          const [audioId, book] = k.split('|');
          return (
            <li key={k}>
              <span>
                {bookMeta(book).name} <small>{modules.find((m) => m.id === audioId)?.name || audioId} · {(v.bytes / 1048576).toFixed(0)} МБ</small>
              </span>
              <ConfirmButton className="icon-btn subtle" confirmText="Удалить" onConfirm={() => removeBook(audioId, book).then(() => setList(listOffline()))} aria-label={`Удалить скачанную книгу ${bookMeta(book).name}`}>
                <Trash2 size={15} />
              </ConfirmButton>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// Простые настройки: короткий список крупных строк, каждая открывает свою страницу
const PAGES = {
  view: 'Вид текста',
  menu: 'Меню ⋮',
  audio: 'Аудио',
  data: 'Мои данные',
  app: 'Обновления',
};
const VIEW_NAMES = { verses: 'По стихам', flow: 'Сплошной текст', book: 'Как книга' };

export default function PrefsSheet({ pane, onClose }) {
  const { settings: s, setSettings: set, openSheet, updates, toast } = useApp();
  const [page, setPage] = useState(null);
  const [checking, setChecking] = useState(false);
  const setMenu = (k, v) => set({ menu: { ...s.menu, [k]: v } });
  const go = (kind) => openSheet(kind, pane);

  const check = async () => {
    if (updates.available) return applyUpdate();
    setChecking(true);
    const found = await updates.check();
    setChecking(false);
    if (!found) toast(updates.error ? `Не удалось проверить: ${updates.error}` : 'У вас последняя версия');
  };

  return (
    <BottomSheet title={page ? PAGES[page] : 'Настройки'} onClose={onClose} onBack={page ? () => setPage(null) : null} initial={2}>
      {!page && (
        <div className="pref-list-main">
          <Row icon={BookOpenCheck} onClick={() => go('help')} sub="Как пользоваться приложением">
            Инструкция
          </Row>
          <Row icon={Palette} onClick={() => go('settings')} sub="Тема, шрифт, размер букв">
            Оформление
          </Row>
          <Row icon={AlignLeft} onClick={() => setPage('view')} sub={VIEW_NAMES[textView(s)] + (s.focusMode ? ' · режим чтения' : '')}>
            Вид текста
          </Row>
          <Row icon={MoreVertical} onClick={() => setPage('menu')} sub="Что показывать в меню «три точки»">
            Меню ⋮
          </Row>
          <Row icon={Headphones} onClick={() => setPage('audio')} sub="ИИ-диктор, книги без интернета">
            Аудио
          </Row>
          <Row icon={Library} onClick={() => go('library')} sub="Переводы, словари, аудиокниги">
            Библиотека модулей
          </Row>
          <Row icon={HardDrive} onClick={() => setPage('data')} sub="Сохранить в файл, перенести на другой телефон">
            Мои данные
          </Row>
          {IS_PWA_BUILD && (
            <Row icon={RefreshCw} onClick={() => setPage('app')} sub={updates.available ? 'Есть новая версия' : `Версия от ${buildDate(BUILD)}`} extra={updates.available ? <span className="badge-new">новая</span> : null}>
              Обновления
            </Row>
          )}
          <Row icon={Info} onClick={() => go('about')} sub="Переводы, словари, авторы">
            О приложении
          </Row>
        </div>
      )}

      {page === 'view' && (
        <section className="settings-group">
          <Segmented
            id="pref-view"
            value={textView(s)}
            onChange={(v) => set({ bookMode: v === 'book', continuousVerses: v === 'flow' })}
            options={[
              ['verses', 'По стихам'],
              ['flow', 'Сплошной'],
              ['book', 'Как книга'],
            ]}
          />
          <p className="pref-note">
            {textView(s) === 'verses' && 'Каждый стих с новой строки, с номером.'}
            {textView(s) === 'flow' && 'Стихи идут подряд, как в обычной книге, но с номерами.'}
            {textView(s) === 'book' && 'Текст абзацами, без номеров и кнопок — для спокойного долгого чтения.'}
          </p>
          <Switch id="pref-focus" checked={s.focusMode} onChange={(focusMode) => set({ focusMode })} label="Режим чтения" hint="Прячет кнопки в тексте, верхняя панель уходит при прокрутке вниз" />
        </section>
      )}

      {page === 'menu' && (
        <section className="settings-group">
          <p className="pref-note">Отметьте, что показывать в меню «три точки» вверху справа. Остальное всегда есть здесь, в настройках.</p>
          {MENU_ITEMS.map(([k, label, hint]) => (
            <Switch key={k} id={`menu-${k}`} checked={!!s.menu[k]} onChange={(v) => setMenu(k, v)} label={label} hint={hint} />
          ))}
        </section>
      )}

      {page === 'audio' && (
        <section className="settings-group">
          <Switch
            id="pref-tts"
            checked={s.ttsFallback}
            onChange={(ttsFallback) => set({ ttsFallback })}
            label="ИИ-диктор, когда нет записи"
            hint="Если к главе нет живой аудиозаписи, текст прочитает синтезированный голос"
          />
          <h4>Книги без интернета</h4>
          <OfflineList />
        </section>
      )}

      {page === 'data' && <MyData />}

      {page === 'app' && (
        <section className="settings-group">
          <Row icon={RefreshCw} onClick={check} sub={updates.available ? 'Нажмите, чтобы обновить' : `Сейчас: версия от ${buildDate(BUILD)}`} extra={checking ? <Loader2 size={16} className="spin" /> : null}>
            {updates.available ? 'Обновить приложение' : 'Проверить обновления'}
          </Row>
          <Row icon={History} onClick={() => go('versions')} sub="Вернуться к прежней версии, резервные копии">
            Версии приложения
          </Row>
        </section>
      )}
    </BottomSheet>
  );
}
