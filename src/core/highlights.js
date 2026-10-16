// Цветные выделения стихов. Палитра подобрана так, чтобы цвета различались и при нарушениях
// цветового зрения (оттенки Okabe–Ito, приглушённые под фон текста). Подписи цветов задаёт человек.
import { t, N_ } from './i18n.js';

export const HL_COLORS = [
  { id: '1', name: N_('Жёлтый'), css: '#f3d36b' },
  { id: '2', name: N_('Голубой'), css: '#7fc4ec' },
  { id: '3', name: N_('Зелёный'), css: '#7ccfa4' },
  { id: '4', name: N_('Оранжевый'), css: '#f2a65a' },
  { id: '5', name: N_('Розовый'), css: '#e79ac0' },
  { id: '6', name: N_('Сиреневый'), css: '#b7a3e3' },
];
export const hlColor = (id) => HL_COLORS.find((c) => c.id === id);
export const hlLabel = (id, labels) => labels?.[id]?.trim() || (hlColor(id) ? t(hlColor(id).name) : '');
