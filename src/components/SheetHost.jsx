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
  const { sheet, closeSheetIf, backSheetIf } = useApp();
  if (!sheet) return null;
  const C = KINDS[sheet.kind];
  if (!C) return null;
  const id = sheet.id;
  const to = sheet.payload?.backTo;
  // Крестик/свайп/Escape в окне, открытом из «Ещё», возвращают в «Ещё»; закрытие ради действия (урок, переход) — полное
  const back = to ? () => backSheetIf(id, to, sheet.pane) : null;
  return (
    <SheetBack.Provider value={back}>
      <C key={id} pane={sheet.pane} payload={sheet.payload || {}} onClose={() => closeSheetIf(id)} />
    </SheetBack.Provider>
  );
}
