import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { usePersistentState, useEvent, load, save } from './core/storage.js';
import { DEFAULT_SETTINGS, applySettings, resolveTheme, migrateSettings } from './core/settings.js';
import * as repo from './core/modules.js';
import { bookMeta, registerModuleBooks } from './core/books.js';
import SplitScreenReader from './components/SplitScreenReader.jsx';
import SheetHost from './components/SheetHost.jsx';
import Bootstrap from './components/Bootstrap.jsx';
import WordPopover from './components/WordPopover.jsx';
import { useUpdates } from './core/updates.js';
import { Toasts } from './components/ui.jsx';

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
  const [settings, setSettings] = usePersistentState('settings', DEFAULT_SETTINGS, migrateSettings);
  const fullSettings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...settings, colors: { ...DEFAULT_SETTINGS.colors, ...settings.colors } }), [settings]);
  const prefersDark = usePrefersDark();
  const themeName = resolveTheme(fullSettings, prefersDark);
  useEffect(() => applySettings(fullSettings, themeName), [fullSettings, themeName]);

  const [modules, setModules] = useState(null);
  useEffect(() => {
    const update = (l) => {
      registerModuleBooks(l);
      setModules([...l]);
    };
    repo.listModules().then(update);
    return repo.subscribe(update);
  }, []);
  const bibles = useMemo(() => (modules || []).filter((m) => m.type === 'bible'), [modules]);

  const [panes, setPanes] = usePersistentState('panes', () => [newPane(DEFAULT_SETTINGS.primaryModule), null]);
  const [sheet, setSheet] = useState(null);
  const [popover, setPopover] = useState(null); // выборка словарей над словом
  const [toasts, setToasts] = useState([]);
  const [bookmarks, setBookmarks] = usePersistentState('bookmarks', []);
  const [favorites, setFavorites] = usePersistentState('favorites', []);

  const updates = useUpdates();

  const toast = useCallback((text, kind = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  // О каждой новой версии сообщаем один раз; дальше — только точка на ⋮
  useEffect(() => {
    if (!updates.available || !updates.latest) return;
    if (load('notifiedBuild', null) === updates.latest) return;
    save('notifiedBuild', updates.latest);
    toast('Доступна новая версия — меню ⋮ → «Обновить приложение»');
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
        for (const id of todo) {
          const entry = cat.find((c) => c.id === id);
          if (!entry) continue;
          await repo.installFromCatalog(entry);
          toast(`Установлен модуль «${entry.name}»: нажмите на название города в стихе, чтобы увидеть его на карте`);
        }
      })
      .catch(() => save('lateStarter', done));
  }, [modules, bibles.length]);

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

  const navigate = useEvent((i, ref, { highlight = null, flash = true, push = true } = {}) => {
    const clean = { book: ref.book, chapter: ref.chapter, verse: ref.verse || 1 };
    updatePane(i, (p) => {
      const history = p.history.slice(0, p.hIndex + 1);
      history[history.length - 1] = p.ref;
      if (push) history.push(clean);
      else history[history.length - 1] = clean;
      const trimmed = history.slice(-100);
      return { ...p, ref: clean, history: trimmed, hIndex: trimmed.length - 1, nav: p.nav + 1, highlight, flash: flash ? `${clean.book}.${clean.chapter}.${clean.verse}.${Date.now()}` : null };
    });
  });

  const reportPosition = useEvent((i, ref) => {
    updatePane(i, (p) => {
      if (p.ref.book === ref.book && p.ref.chapter === ref.chapter && p.ref.verse === ref.verse) return p;
      const history = [...p.history];
      history[p.hIndex] = ref;
      return { ...p, ref, history };
    });
  });

  const go = useEvent((i, dir) => {
    updatePane(i, (p) => {
      const h = p.hIndex + dir;
      if (h < 0 || h >= p.history.length) return p;
      const history = [...p.history];
      history[p.hIndex] = p.ref;
      return { ...p, history, hIndex: h, ref: history[h], nav: p.nav + 1, flash: null, highlight: null };
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
      toast(`В переводе ${mod.name} нет книги «${bookMeta(ref.book).name}»`, 'error');
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
        next[target] = { ...p, moduleId, ref: clean, history, hIndex: history.length - 1, nav: p.nav + 1, flash, highlight: null };
      }
      return next;
    });
  });

  const isBookmarked = (ref) => bookmarks.some((b) => b.book === ref.book && b.chapter === ref.chapter && b.verse === ref.verse);
  const toggleBookmark = useEvent((ref) => {
    if (isBookmarked(ref)) {
      setBookmarks((bs) => bs.filter((b) => !(b.book === ref.book && b.chapter === ref.chapter && b.verse === ref.verse)));
      toast('Закладка удалена');
    } else {
      setBookmarks((bs) => [{ ...ref, at: Date.now() }, ...bs]);
      toast(`Закладка: ${bookMeta(ref.book).short} ${ref.chapter}:${ref.verse}`);
    }
  });
  const isFavorite = (ref) => favorites.some((b) => b.book === ref.book && b.chapter === ref.chapter && b.verse === ref.verse);
  const toggleFavorite = useEvent((ref, text) => {
    if (isFavorite(ref)) {
      setFavorites((fs) => fs.filter((b) => !(b.book === ref.book && b.chapter === ref.chapter && b.verse === ref.verse)));
      toast('Убрано из избранного');
    } else {
      setFavorites((fs) => [{ ...ref, text, at: Date.now() }, ...fs]);
      toast('Стих добавлен в избранное');
    }
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
  };

  const ready = modules !== null && bibles.length > 0;
  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        {modules === null ? null : ready ? <SplitScreenReader /> : <Bootstrap />}
        <SheetHost />
        <WordPopover />
        <Toasts items={toasts} />
      </div>
    </AppCtx.Provider>
  );
}
