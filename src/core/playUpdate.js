// Приложение из Google Play: есть ли новая версия — спрашиваем сам Google Play (In-App Updates).
// Обновление — прямо в приложении (экран Google Play поверх), если Google не разрешает — страница в магазине.
import { useSyncExternalStore } from 'react';
import { AppUpdate, AppUpdateAvailability } from '@capawesome/capacitor-app-update';
import { NATIVE } from './native.js';

let state = { available: false, checked: false, version: null, immediate: false };
const subs = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  subs.forEach((fn) => fn());
};

export async function checkPlayUpdate() {
  if (!NATIVE) return state;
  try {
    const info = await AppUpdate.getAppUpdateInfo();
    set({
      checked: true,
      available: info.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE,
      version: info.availableVersionCode || null,
      immediate: !!info.immediateUpdateAllowed,
    });
  } catch {
    set({ checked: true }); // установлено не из Google Play или нет связи — молчим
  }
  return state;
}

export async function installPlayUpdate() {
  if (state.immediate) {
    try {
      await AppUpdate.performImmediateUpdate();
      return;
    } catch {
      // не вышло — откроем страницу в магазине
    }
  }
  await AppUpdate.openAppStore().catch(() => {});
}

const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
export const usePlayUpdate = () => useSyncExternalStore(subscribe, () => state);
