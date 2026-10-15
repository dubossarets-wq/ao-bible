// Интерактивная инструкция: какой урок идёт и на каком шаге. Хранилище вне React-состояния приложения.
import { useSyncExternalStore } from 'react';

let state = { id: null, step: 0 };
const subs = new Set();
const set = (s) => {
  state = s;
  subs.forEach((f) => f());
};
export const useTour = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => state
  );
export const startTour = (id) => set({ id, step: 0 });
export const stopTour = () => set({ id: null, step: 0 });
export const goStep = (step) => set({ ...state, step });
