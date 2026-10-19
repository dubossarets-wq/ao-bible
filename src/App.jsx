import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { usePersistentState, useEvent, load, save } from './core/storage.js';
import { DEFAULT_SETTINGS, applySettings, resolveTheme, migrateSettings } from './core/settings.js';
import { loadBg } from './core/userBg.js';
import * as repo from './core/modules.js';
import { bookMeta, registerModuleBooks } from './core/books.js';
import SplitScreenReader from './components/SplitScreenReader.jsx';
import SheetHost from './components/SheetHost.jsx';
import Bootstrap from './components/Bootstrap.jsx';
import WordPopover from './components/WordPopover.jsx';
import AudioBar from './components/AudioBar.jsx';
import TourOverlay from './components/TourOverlay.jsx';
import { fitsTranslation, detachFollow, audioState } from './core/audio.js';
import { useSermons } from './core/sermons.js';
import { pendingNews, markNewsSeen } from './core/whatsNew.js';
import { useUpdates, applyUpdate } from './core/updates.js';
import { IS_STAGING } from './core/channel.js';
import { Toasts } from './components/ui.jsx';
import { t, useLang } from './core/i18n.js';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const START_REF = { book: 'Josh', chapter: 13, verse: 32 };
const newPane = (moduleId, ref = START_REF) => ({ moduleId, ref, history: [ref], hIndex: 0, nav: 1, highlight: null, flash: null });

function usePrefersDark() {
  const get = () => {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  };
  const [dark, setDark] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const on = () => setDark(get());
    mq?.addEventListener?.('change', on);
    const mo = new MutationObserver(on);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq?.removeEventListener?.('change', on);
      mo.disconnect();
    };
  }, []);
  return dark;
}

export default function App() {
  useLang(); // смена языка перерисовывает всё приложение
  const [settings, setSettings] = usePersistentState('settings', DEFAULT_SETTINGS, migrateSettings);
  const fullSettings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...settings, colors: { ...DEFAULT_SETTINGS.colors, ...settings.colors }, menu: { ...DEFAULT_SETTINGS.menu, ...settings.menu } }), [settings]);
  const prefersDark = usePrefersDark();
  const themeName = resolveTheme(fullSettings, prefersDark);
  useEffect(() => applySettings(fullSettings, themeName), [fullSettings, themeName]);
  // Своя картинка под текстом: загружаем из IndexedDB и ставим CSS-переменной
  useEffect(() => {
    const root = document.documentElement;
    let url = null;
    let alive = true;
    if (fullSettings.bgImage)
      loadBg().then((blob) => {
        if (!alive || !blob) return;
        url = URL.createObjectURL(blob);
        root.style.setProperty('--user-bg', `url("${url}")`);
        root.classList.add('has-user-bg');
      });
    return () => {
      alive = false;
      root.classList.remove('has-user-bg');
      root.style.removeProperty('--user-bg');
      if (url) URL.revokeObjectURL(url);
    };
  }, [fullSettings.bgImage]);

  const [modules, setModules] = useState(null);
  useEffect(() => {
    const update = (l) => {
      registerModuleBooks(l);
      setModules([...l]);
    };
    repo.listModules().then(update);
    return repo.subscribe(update);
  }, []);
  // Служебные модули (features.helper — подстрочник к Вульгате) читает только окно «Подстрочник», в переводах их нет
  const bibles = useMemo(() => (modules || []).filter((m) => m.type === 'bible' && !m.features?.helper), [modules]);

  const [panes, setPanes] = usePersistentState('panes', () => [newPane(DEFAULT_SETTINGS.primaryModule), null]);
  const [sheet, setSheet] = useState(null);
  // Кнопка «Назад» телефона (Android) и жест «назад» закрывают открытое окно, а не приложение:
  // пока окно открыто, в истории браузера лежит одна запись; закрыли окно сами — запись убираем
  const sheetOpen = !!sheet;
  const backEntry = useRef(false);
  useEffect(() => {
    if (sheetOpen && !backEntry.current) {
      history.pushState({ aobSheet: 1 }, '');
      backEntry.current = true;
    } else if (!sheetOpen && backEntry.current) {
      backEntry.current = false;
      if (history.state?.aobSheet) history.back();
    }
  }, [sheetOpen]);
  useEffect(() => {
    const onPop = () => {
      if (!backEntry.current) return;
      backEntry.current = false;
      setSheet(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [popover, setPopover] = useState(null); // выборка словарей над словом
  const [toasts, setToasts] = useState([]);
  const [bookmarks, setBookmarks] = usePersistentState('bookmarks', []);
  const [favorites, setFavorites] = usePersistentState('favorites', []);
  // Заметки к стихам: { 'Josh.14.15': { text, label, at, updated } } — label хранит выделение («Нав. 14:15–16»)
  const [notes, setNotes] = usePersistentState('notes', {});
  // Цветные выделения { 'Josh.14.15': '2' } и подписи цветов { '2': 'Обетования' }
  const [highlights, setHighlights] = usePersistentState('highlights', {});
  const [hlLabels, setHlLabels] = usePersistentState('highlightLabels', {});
  // Подборки стихов: [{ id, name, at, items: [{ book, chapter, verse, text, at }] }]
  const [collections, setCollections] = usePersistentState('collections', []);

  const updates = useUpdates();

  // Уведомление внизу — одно: новое заменяет предыдущее. Короткое показывается 1,6 с,
  // длинное — чуть дольше, чтобы его успели прочитать (не дольше 3,2 с)
  const toastTimer = useRef(0);
  const toast = useCallback((text, kind = 'info') => {
    const id = Math.random();
    setToasts([{ id, text, kind }]);
    clearTimeout(toastTimer.current);
    const ms = Math.min(3200, 1600 + Math.max(0, String(text).length - 40) * 20);
    toastTimer.current = setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  // Автообновление (по умолчанию) и экстренное обновление: переходим на новую версию сразу,
  // но не посреди открытого окна (например, недописанной заметки) — ждём, пока его закроют
  useEffect(() => {
    if (!updates.available || !(updates.auto || updates.forced) || sheet) return;
    if (!updates.forced && audioState().active && audioState().playing) return; // дослушают — обновимся при следующей проверке
    toast(updates.forced ? t('Экстренное обновление…') : t('Обновляюсь до новой версии…'));
    const timer = setTimeout(() => applyUpdate(), 600);
    return () => clearTimeout(timer);
  }, [updates.available, updates.auto, updates.forced, sheet]);

  // О каждой новой версии сообщаем один раз; дальше — только точка на ⋮
  useEffect(() => {
    if (!updates.available || !updates.latest || updates.auto || updates.forced) return;
    if (load('notifiedBuild', null) === updates.latest) return;
    save('notifiedBuild', updates.latest);
    toast(t('Доступна новая версия — меню ⋮ → «Обновить приложение»'));
  }, [updates.available, updates.latest, toast]);

  // Один раз доустанавливаем новые базовые модули (например, «Места» для карты) у прежних пользователей
  useEffect(() => {
    if (!modules || !bibles.length) return;
    const done = load('lateStarter', []);
    const todo = repo.LATE_STARTER.filter((id) => !done.includes(id) && !modules.some((m) => m.id === id));
    if (!todo.length) return;
    save('lateStarter', [...done, ...todo]);
    repo
      .fetchCatalog()
      .then(async (cat) => {
        // Модуля ещё нет в каталоге — не отмечаем его, поставим при следующем запуске
        const missing = todo.filter((id) => !cat.some((c) => c.id === id));
        if (missing.length) save('lateStarter', [...done, ...todo.filter((id) => !missing.includes(id))]);
        for (const id of todo) {
          const entry = cat.find((c) => c.id === id);
          if (!entry) continue;
          await repo.installFromCatalog(entry);
          if (entry.id === 'strongs-ru-greek') continue; // о русском Стронге — одно уведомление на оба модуля
          toast(
            entry.type === 'illustrations'
              ? t('Добавлены иллюстрации к стихам: нажмите на значок картинки в конце стиха')
              : entry.id === 'strongs-ru-hebrew'
                ? t('Добавлен словарь Стронга на русском: нажмите на слово или номер Стронга')
                : t('Установлен модуль «{name}»: нажмите на название города в стихе, чтобы увидеть его на карте', { name: entry.name })
          );
        }
      })
      .catch(() => save('lateStarter', done));
  }, [modules, bibles.length]);

  const merging = useRef(false);
  // После обновления — один раз «Что нового» (когда приложение готово и не открыто другое окно)
  const ready0 = modules !== null && bibles.length > 0;
  useEffect(() => {
    if (!ready0) return;
    // Новый человек (первая установка поставила отметку) — приветствие вместо «Что нового»
    if (load('welcomePending', false)) {
      markNewsSeen();
      const t = setTimeout(() => setSheet((s) => s || { kind: 'welcome', pane: 0, payload: {}, id: Date.now() }), 1200);
      return () => clearTimeout(t);
    }
    const items = pendingNews();
    if (!items.length) return;
    const t = setTimeout(() => setSheet((s) => s || { kind: 'news', pane: 0, payload: { items }, id: Date.now() }), 1200);
    return () => clearTimeout(t);
  }, [ready0]);

  // Объединённые модули: вместо частей одного автора («Лопухин 1/2/3») ставим общий модуль, части убираем,
  // выбор «какие комментарии показывать в тексте» переносим на новый id. Нет общего в каталоге — ничего не трогаем.
  useEffect(() => {
    if (!modules || !navigator.onLine) return;
    const old = modules.filter((m) => repo.MERGED[m.id]);
    if (!old.length || merging.current) return;
    merging.current = true;
    repo
      .fetchCatalog()
      .then(async (cat) => {
        for (const target of [...new Set(old.map((m) => repo.MERGED[m.id]))]) {
          const entry = cat.find((c) => c.id === target);
          if (!entry) continue;
          if (!modules.some((m) => m.id === target)) await repo.installFromCatalog(entry);
          const parts = old.filter((m) => repo.MERGED[m.id] === target).map((m) => m.id);
          for (const id of parts) await repo.removeModule(id);
          setSettings((s) => {
            const list = s.inlineCommentaries;
            if (!list || !list.some((id) => parts.includes(id))) return s;
            return { ...s, inlineCommentaries: [...new Set(list.map((id) => repo.MERGED[id] || id))] };
          });
          toast(t('«{name}» теперь одним модулем вместо нескольких частей', { name: entry.name }));
        }
      })
      .catch(() => {})
      .finally(() => (merging.current = false));
  }, [!!modules && modules.map((m) => m.id).join()]);

  // Аудиокниги ставятся вместе с переводом: к каждому установленному переводу — его записи из каталога.
  // Уже установленные обновляются сами, когда в каталоге появилась новая версия.
  // Каждая ставится один раз: если человек её удалил, сама она больше не вернётся.
  const bibleIds = bibles.map((b) => b.id).join();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => (window.removeEventListener('online', on), window.removeEventListener('offline', on));
  }, []);
  // Память браузера переполнена — предупреждаем: иначе правки молча не сохранились бы
  useEffect(() => {
    const full = () => toast(t('Память приложения заполнена — последние изменения могут не сохраниться. Сохраните данные в файл: Настройки → «Мои данные».'), 'error');
    window.addEventListener('aob-storage-full', full);
    return () => window.removeEventListener('aob-storage-full', full);
  }, [toast]);
  useEffect(() => {
    if (!modules || !bibleIds || !online) return;
    let alive = true;
    repo
      .fetchCatalog()
      .then(async (cat) => {
        const tried = load('autoAudio', []);
        const todo = cat.filter(
          (e) => e.type === 'audio' && !e.unavailable && !tried.includes(e.id) && !modules.some((m) => m.id === e.id) && bibles.some((b) => fitsTranslation(e.translation, b.id))
        );
        // Уже стоящие аудиокниги обновляем сами, без вопросов: они маленькие, а в новой версии — новые главы и точнее разметка
        const stale = cat.filter((e) => {
          const m = e.type === 'audio' && modules.find((x) => x.id === e.id);
          return m && m.origin === 'catalog' && !e.unavailable && (m.catalogVersion !== e.version || (e.size && m.size !== e.size));
        });
        for (const e of stale) {
          if (!alive) return;
          await repo.installFromCatalog(e).catch(() => {});
        }
        const added = [];
        for (const e of todo) {
          if (!alive) return;
          save('autoAudio', [...load('autoAudio', []), e.id]);
          try {
            await repo.installFromCatalog(e);
            added.push(e);
          } catch {
            save('autoAudio', load('autoAudio', []).filter((x) => x !== e.id)); // не вышло — попробуем в следующий раз
          }
        }
        // Одно сообщение на все подключённые записи
        if (added.length) {
          const names = [...new Set(added.map((e) => bibles.find((b) => fitsTranslation(e.translation, b.id))?.name).filter(Boolean))];
          toast(names.length ? t('Подключены аудиокниги к переводу {names} — нажмите 🎧 внизу, чтобы слушать', { names: names.join(', ') }) : t('Подключены аудиокниги — нажмите 🎧 внизу, чтобы слушать'));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [bibleIds, !!modules, online]);

  // Если модуль панели удалён — переключаем на основной/первый доступный перевод.
  useEffect(() => {
    if (!modules || !bibles.length) return;
    const fallback = bibles.find((b) => b.id === fullSettings.primaryModule)?.id || bibles[0].id;
    setPanes((ps) => {
      let changed = false;
      const next = ps.map((p) => {
        if (!p || p.kind === 'map' || bibles.some((b) => b.id === p.moduleId)) return p;
        changed = true;
        return { ...p, moduleId: fallback, nav: p.nav + 1 };
      });
      return changed ? next : ps;
    });
  }, [modules, bibles, fullSettings.primaryModule, setPanes]);

  const updatePane = useCallback((i, fn) => setPanes((ps) => ps.map((p, j) => (j === i && p ? fn(p) : p))), [setPanes]);

  // Режим «план на день» (pane.plan = { uid, day, at }). Любой переход в другое место выводит из него,
  // а план запоминается в lastPlan — внизу появляется кнопка «Вернуться к плану».
  // planReturn — куда вернуться: { at } — к отрывку с этим номером.
  const leavePlan = (p, planReturn) => (p.plan ? { plan: null, lastPlan: { ...p.plan, at: null, ref: p.ref, ...planReturn } } : {});

  // audio: true — переход за чтецом; любой другой переход в панели, где звучит запись, отцепляет текст от чтеца
  const navigate = useEvent((i, ref, { highlight = null, flash = true, push = true, planReturn = null, audio = false } = {}) => {
    const clean = { book: ref.book, chapter: ref.chapter, verse: ref.verse || 1 };
    if (!audio) detachFollow(i);
    updatePane(i, (p) => {
      const history = p.history.slice(0, p.hIndex + 1);
      history[history.length - 1] = p.ref;
      if (push) history.push(clean);
      else history[history.length - 1] = clean;
      const trimmed = history.slice(-100);
      return { ...p, ...leavePlan(p, planReturn), ref: clean, history: trimmed, hIndex: trimmed.length - 1, nav: p.nav + 1, highlight, flash: flash ? `${clean.book}.${clean.chapter}.${clean.verse}.${Date.now()}` : null };
    });
  });

  // Открыть день плана одной страницей; at — номер отрывка, к которому прокрутить
  const openPlanDay = useEvent((i, uid, day, at = 0) =>
    updatePane(i, (p) => {
      const history = p.plan ? p.history : [...p.history.slice(0, p.hIndex + 1), p.ref].slice(-100);
      return { ...p, history, hIndex: history.length - 1, plan: { uid, day, at, t: Date.now() }, lastPlan: null, nav: p.nav + 1, flash: null, highlight: null };
    })
  );
  const returnToPlan = useEvent((i) =>
    updatePane(i, (p) => (p.lastPlan ? { ...p, plan: { ...p.lastPlan, t: Date.now() }, lastPlan: null, nav: p.nav + 1, flash: null, highlight: null } : p))
  );
  // Выйти из плана: остаёмся на том же месте в обычном чтении
  const exitPlan = useEvent((i) => updatePane(i, (p) => ({ ...p, plan: null, lastPlan: null, nav: p.nav + 1, flash: null, highlight: null })));
  // Место открытия плана уже применено — дальше открываемся на последнем месте чтения
  const settlePlan = useEvent((i) => updatePane(i, (p) => (p.plan ? { ...p, plan: { uid: p.plan.uid, day: p.plan.day } } : p)));
  const dismissPlanReturn = useEvent((i) => updatePane(i, (p) => ({ ...p, lastPlan: null })));

  const reportPosition = useEvent((i, ref) => {
    updatePane(i, (p) => {
      if (p.ref.book === ref.book && p.ref.chapter === ref.chapter && p.ref.verse === ref.verse) return p;
      const history = [...p.history];
      history[p.hIndex] = ref;
      return { ...p, ref, history };
    });
  });

  const go = useEvent((i, dir) => {
    detachFollow(i);
    updatePane(i, (p) => {
      const h = p.hIndex + dir;
      if (h < 0 || h >= p.history.length) return p;
      const history = [...p.history];
      history[p.hIndex] = p.ref;
      return { ...p, ...leavePlan(p), history, hIndex: h, ref: history[h], nav: p.nav + 1, flash: null, highlight: null };
    });
  });

  const setPaneModule = useEvent((i, moduleId) => {
    updatePane(i, (p) => {
      const mod = bibles.find((b) => b.id === moduleId);
      let ref = p.ref;
      if (mod && !mod.books.some((b) => b.id === ref.book)) ref = { book: mod.books[0].id, chapter: 1, verse: 1 };
      return { ...p, moduleId, ref, nav: p.nav + 1, flash: null };
    });
  });

  const openSplit = useEvent(() => setPanes((ps) => (ps[1] ? ps : [ps[0], { ...newPane(ps[0].moduleId, ps[0].ref), flash: null }])));

  // Карта одного места во второй половине экрана. Если там была панель чтения, она запоминается
  // и возвращается, когда карту закрывают.
  const openPlaceMap = useEvent((place) => {
    const { module, ...rest } = place;
    setPanes((ps) => {
      const under = ps[1]?.kind === 'map' ? ps[1].under : ps[1];
      return [ps[0], { kind: 'map', place: { ...rest, moduleName: module?.name, license: module?.license, author: module?.author }, under: under || null }];
    });
  });
  const closePlaceMap = useEvent(() => setPanes((ps) => [ps[0], ps[1]?.kind === 'map' ? ps[1].under || null : ps[1]]));

  const closeSplit = useEvent(() => setPanes((ps) => [ps[0], null]));

  // Открыть место во второй панели (из первой) или в самой второй панели (из второй).
  const openInOther = useEvent((fromPane, ref) => {
    if (fromPane === 0) {
      if (!panes[1] || panes[1].kind === 'map') {
        setPanes((ps) => [ps[0], { ...newPane(ps[0].moduleId, ref), flash: `${ref.book}.${ref.chapter}.${ref.verse}.${Date.now()}` }]);
      } else navigate(1, ref);
    } else navigate(fromPane, ref);
  });

  // То же место в другом переводе в соседней панели (из первой — во второй, из второй — в первой)
  const openParallel = useEvent((fromPane, ref, moduleId) => {
    const mod = bibles.find((b) => b.id === moduleId);
    if (!mod) return;
    if (!mod.books.some((b) => b.id === ref.book)) {
      toast(t('В переводе {module} нет книги «{book}»', { module: mod.name, book: bookMeta(ref.book).name }), 'error');
      return;
    }
    const clean = { book: ref.book, chapter: ref.chapter, verse: ref.verse };
    const flash = `${clean.book}.${clean.chapter}.${clean.verse}.${Date.now()}`;
    const target = fromPane === 0 ? 1 : 0;
    setPanes((ps) => {
      const next = [...ps];
      const p = ps[target]?.kind === 'map' ? null : ps[target];
      if (!p) next[target] = { ...newPane(moduleId, clean), flash };
      else {
        const history = p.history.slice(0, p.hIndex + 1);
        history[history.length - 1] = p.ref;
        history.push(clean);
        next[target] = { ...p, ...leavePlan(p), moduleId, ref: clean, history, hIndex: history.length - 1, nav: p.nav + 1, flash, highlight: null };
      }
      return next;
    });
  });

  const isBookmarked = (ref) => bookmarks.some((b) => b.book === ref.book && b.chapter === ref.chapter && b.verse === ref.verse);
  const toggleBookmark = useEvent((ref, text) => {
    if (isBookmarked(ref)) {
      setBookmarks((bs) => bs.filter((b) => !(b.book === ref.book && b.chapter === ref.chapter && b.verse === ref.verse)));
      toast(t('Закладка удалена'));
    } else {
      setBookmarks((bs) => [{ book: ref.book, chapter: ref.chapter, verse: ref.verse, text: text || '', at: Date.now() }, ...bs]);
      toast(t('Закладка: {ref}', { ref: `${bookMeta(ref.book).short} ${ref.chapter}:${ref.verse}` }));
    }
  });
  const isFavorite = (ref) => favorites.some((b) => b.book === ref.book && b.chapter === ref.chapter && b.verse === ref.verse);
  const toggleFavorite = useEvent((ref, text) => {
    if (isFavorite(ref)) {
      setFavorites((fs) => fs.filter((b) => !(b.book === ref.book && b.chapter === ref.chapter && b.verse === ref.verse)));
      toast(t('Убрано из любимых стихов'));
    } else {
      setFavorites((fs) => [{ ...ref, text, at: Date.now() }, ...fs]);
      toast(t('♥ Добавлено в любимые стихи'));
    }
  });

  // Любимая часть стиха: слова from..to (номера слов в стихе); заменяет прежнюю отметку этого стиха
  const addFavoritePart = useEvent((ref, text, from, to) => {
    setFavorites((fs) => [{ book: ref.book, chapter: ref.chapter, verse: ref.verse, text, part: { from, to }, at: Date.now() }, ...fs.filter((b) => !(b.book === ref.book && b.chapter === ref.chapter && b.verse === ref.verse))]);
    toast(t('♥ Часть стиха — в любимых'));
  });
  // «Книга.глава» → { стих: [from, to] } — какие слова подчеркнуть как любимую часть
  const favParts = useMemo(() => {
    const m = new Map();
    for (const f of favorites)
      if (f.part) {
        const k = `${f.book}.${f.chapter}`;
        m.set(k, { ...m.get(k), [f.verse]: [f.part.from, f.part.to] });
      }
    return m;
  }, [favorites]);

  const noteKey = (ref) => `${ref.book}.${ref.chapter}.${ref.verse}`;
  const setNote = useEvent((ref, text, label) => {
    const key = noteKey(ref);
    setNotes((ns) => {
      const next = { ...ns };
      if (!text.trim()) delete next[key];
      else next[key] = { text, label: label || '', at: ns[key]?.at || Date.now(), updated: Date.now() };
      return next;
    });
  });

  const sermons = useSermons();
  // Отметки в тексте: «Книга.глава» → { стих: 'fbns' } (f — любимый стих, b — закладка, n — заметка, s — в проповеди)
  const marks = useMemo(() => {
    const m = new Map();
    const add = (book, c, v, flag) => {
      const k = `${book}.${c}`;
      const row = m.get(k) || {};
      row[v] = (row[v] || '') + flag;
      m.set(k, row);
    };
    favorites.forEach((r) => add(r.book, r.chapter, r.verse, r.part ? 'p' : 'f')); // p — любимая только часть стиха
    bookmarks.forEach((r) => add(r.book, r.chapter, r.verse, 'b'));
    Object.keys(notes).forEach((k) => {
      const [b, c, v] = k.split('.');
      add(b, +c, +v, 'n');
    });
    for (const s of sermons)
      for (const b of s.blocks)
        if (b.type === 'verse') for (let v = b.verse; v <= (b.to || b.verse); v++) if (!m.get(`${b.book}.${b.chapter}`)?.[v]?.includes('s')) add(b.book, b.chapter, v, 's');
    Object.entries(highlights).forEach(([k, color]) => {
      const [b, c, v] = k.split('.');
      add(b, +c, +v, color); // цифра — цвет выделения
    });
    return m;
  }, [favorites, bookmarks, notes, highlights, sermons]);

  const setHighlight = useEvent((refs, color) => {
    setHighlights((h) => {
      const next = { ...h };
      for (const r of refs) {
        const k = `${r.book}.${r.chapter}.${r.verse}`;
        if (color) next[k] = color;
        else delete next[k];
      }
      return next;
    });
  });

  const addToCollection = useEvent((collectionId, items, newName) => {
    setCollections((cs) => {
      let list = cs;
      let id = collectionId;
      if (!id) {
        id = Date.now().toString(36);
        list = [{ id, name: newName || t('Подборка'), at: Date.now(), items: [] }, ...cs];
      }
      return list.map((c) => {
        if (c.id !== id) return c;
        const have = new Set(c.items.map((x) => `${x.book}.${x.chapter}.${x.verse}`));
        const add = items.filter((x) => !have.has(`${x.book}.${x.chapter}.${x.verse}`)).map((x) => ({ ...x, at: Date.now() }));
        return { ...c, items: [...c.items, ...add] };
      });
    });
  });

  const ctx = {
    settings: fullSettings,
    setSettings: (patch) => setSettings((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) })),
    resetSettings: () => setSettings({ ...DEFAULT_SETTINGS, primaryModule: fullSettings.primaryModule }),
    themeName,
    modules: modules || [],
    bibles,
    panes,
    navigate,
    openPlanDay,
    returnToPlan,
    exitPlan,
    dismissPlanReturn,
    settlePlan,
    reportPosition,
    go,
    setPaneModule,
    openSplit,
    closeSplit,
    openInOther,
    openParallel,
    openPlaceMap,
    closePlaceMap,
    sheet,
    openSheet: (kind, pane = 0, payload = {}) => setSheet({ kind, pane, payload, id: Date.now() }),
    updates,
    popover,
    openPopover: (p) => setPopover({ ...p, id: Date.now() + Math.random() }),
    closePopover: () => setPopover(null),
    closeSheet: () => setSheet(null),
    toast,
    bookmarks,
    setBookmarks,
    favorites,
    setFavorites,
    isBookmarked,
    toggleBookmark,
    isFavorite,
    toggleFavorite,
    addFavoritePart,
    favParts,
    notes,
    setNote,
    marks,
    highlights,
    setHighlight,
    hlLabels,
    setHlLabels,
    collections,
    setCollections,
    addToCollection,
  };

  const ready = modules !== null && bibles.length > 0;
  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        {modules === null ? null : ready ? <SplitScreenReader /> : <Bootstrap />}
        <SheetHost />
        <WordPopover />
        <AudioBar />
        <TourOverlay />
        <Toasts items={toasts} />
        {IS_STAGING && (
          <div className="staging-badge" aria-label={t('Тестовое приложение')}>
            {t('ТЕСТ')}
          </div>
        )}
      </div>
    </AppCtx.Provider>
  );
}
