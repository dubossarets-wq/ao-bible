// Цветные выделения стихов. Палитра подобрана так, чтобы цвета различались и при нарушениях
// цветового зрения (оттенки Okabe–Ito, приглушённые под фон текста). Подписи цветов задаёт человек.
export const HL_COLORS = [
  { id: '1', name: 'Жёлтый', css: '#f3d36b' },
  { id: '2', name: 'Голубой', css: '#7fc4ec' },
  { id: '3', name: 'Зелёный', css: '#7ccfa4' },
  { id: '4', name: 'Оранжевый', css: '#f2a65a' },
  { id: '5', name: 'Розовый', css: '#e79ac0' },
  { id: '6', name: 'Сиреневый', css: '#b7a3e3' },
];
export const hlColor = (id) => HL_COLORS.find((c) => c.id === id);
export const hlLabel = (id, labels) => labels?.[id]?.trim() || hlColor(id)?.name || '';
