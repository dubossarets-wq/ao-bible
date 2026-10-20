// Показывает текущую нижнюю панель. Каждая панель знает, из какой панели чтения её открыли (sheet.pane).
import React from 'react';
import { useApp } from '../App.jsx';
import { SheetBack } from './BottomSheet.jsx';
import DictionaryBottomSheet from './DictionaryBottomSheet.jsx';
import CrossReferencesSheet from './CrossReferencesSheet.jsx';
import BookNavigator from './BookNavigator.jsx';
import ModulePicker from './ModulePicker.jsx';
import ModuleLibrary from './ModuleLibrary.jsx';
import SearchPanel from './SearchPanel.jsx';
import AppearanceSettings from './AppearanceSettings.jsx';
import BookmarksManager from './BookmarksManager.jsx';
import VerseActions from './VerseActions.jsx';
import About from './About.jsx';
import CompareSheet from './CompareSheet.jsx';
import VersionsSheet from './VersionsSheet.jsx';
import CommentarySheet from './CommentarySheet.jsx';
import MapsSheet from './MapsSheet.jsx';
import NoteSheet from './NoteSheet.jsx';
import CollectSheet from './CollectSheet.jsx';
import VerseGuide from './VerseGuide.jsx';
import InterlinearSheet from './InterlinearSheet.jsx';
import ConcordanceSheet from './ConcordanceSheet.jsx';
import PlansSheet from './PlansSheet.jsx';
import PrefsSheet from './PrefsSheet.jsx';
import SermonsSheet from './SermonsSheet.jsx';
import SermonAddSheet from './SermonAddSheet.jsx';
import VerseImageSheet from './VerseImageSheet.jsx';
import HelpSheet from './HelpSheet.jsx';
import NewsSheet from './NewsSheet.jsx';
import Welcome from './Welcome.jsx';
import ImageViewer from './ImageViewer.jsx';
import MoreSheet from './MoreSheet.jsx';

const KINDS = {
  dict: DictionaryBottomSheet,
  xrefs: CrossReferencesSheet,
  nav: BookNavigator,
  modules: ModulePicker,
  library: ModuleLibrary,
  search: SearchPanel,
  settings: AppearanceSettings,
  bookmarks: BookmarksManager,
  verse: VerseActions,
  about: About,
  compare: CompareSheet,
  versions: VersionsSheet,
  commentary: CommentarySheet,
  maps: MapsSheet,
  note: NoteSheet,
  collect: CollectSheet,
  guide: VerseGuide,
  interlinear: InterlinearSheet,
  concord: ConcordanceSheet,
  plans: PlansSheet,
  prefs: PrefsSheet,
  sermons: SermonsSheet,
  'sermon-add': SermonAddSheet,
  'verse-image': VerseImageSheet,
  help: HelpSheet,
  welcome: Welcome,
  news: NewsSheet,
  illus: ImageViewer,
  more: MoreSheet,
};

// Есть ли такое окно (вкладка открывает своё окно, только если оно зарегистрировано)
export const hasSheet = (kind) => Object.prototype.hasOwnProperty.call(KINDS, kind);

export default function SheetHost() {
  const { sheet, closeSheetIf, backSheetIf, returnSheet } = useApp();
  if (!sheet || !KINDS[sheet.kind]) return null;
  const id = sheet.id;
  // Стопка окон: подменю выезжает справа поверх того окна, из которого его открыли, а то остаётся на месте.
  // Родитель — payload.backTo === 'more' (подменю «Ещё») или payload.returnTo (например, пункт «Настроек»).
  // Ключ родителя — его прежний id: при возврате окно не переоткрывается и помнит, где было.
  const layers = [{ kind: sheet.kind, payload: sheet.payload || {}, id }];
  for (let d = 0; d < 4; d++) {
    const p = layers[0].payload;
    const parent = p.returnTo ? { kind: p.returnTo.kind, payload: p.returnTo.payload || {}, id: p.returnTo.id ?? `${p.returnTo.kind}-parent` } : p.backTo === 'more' && layers[0].kind !== 'more' ? { kind: 'more', payload: {}, id: 'more-host' } : null;
    if (!parent || !KINDS[parent.kind]) break;
    layers.unshift(parent);
  }
  return (
    <>
      {layers.map((L, i) => {
        const C = KINDS[L.kind];
        const below = layers[i - 1];
        const push = below ? { back: () => (below.kind === 'more' ? backSheetIf(id, 'more', sheet.pane) : returnSheet(id, below, sheet.pane)) } : null;
        return (
          <SheetBack.Provider key={L.kind === 'more' ? 'more-host' : String(L.id)} value={push}>
            <C pane={sheet.pane} payload={L.payload} sheetId={L.id} onClose={() => closeSheetIf(id)} />
          </SheetBack.Provider>
        );
      })}
    </>
  );
}
