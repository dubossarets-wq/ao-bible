// Показывает текущую нижнюю панель. Каждая панель знает, из какой панели чтения её открыли (sheet.pane).
import React from 'react';
import { useApp } from '../App.jsx';
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
};

export default function SheetHost() {
  const { sheet, closeSheet } = useApp();
  if (!sheet) return null;
  const C = KINDS[sheet.kind];
  if (!C) return null;
  return <C key={sheet.id} pane={sheet.pane} payload={sheet.payload || {}} onClose={closeSheet} />;
}
