// Подложка выбранной части стиха — одной цельной плашкой со скруглёнными углами, как выделение текста
// на телефоне. Рисуется под текстом по точным границам строк: соседние строки стыкуются ровно посередине
// промежутка (без наложений и просветов), выступающие углы скругляются.
const R = 6; // радиус скругления, px
const PAD = 2; // запас вокруг текста, px

export function clearPart(root) {
  root.querySelectorAll('.part-shape').forEach((x) => x.remove());
}

export function drawPart(root, part) {
  if (part?.from == null) return;
  const [b, c, v] = part.key.split('.');
  const verse = root.querySelector(`.verse[data-b="${b}"][data-c="${c}"][data-v="${v}"]`);
  const a = verse?.querySelector(`.w[data-i="${Math.min(part.from, part.to)}"]`);
  const z = verse?.querySelector(`.w[data-i="${Math.max(part.from, part.to)}"]`);
  if (!a || !z) return;
  const range = document.createRange();
  range.setStartBefore(a);
  range.setEndAfter(z);
  // Координаты — от колонки текста: так плашка верна и в сплошном тексте, где стих идёт внутри абзаца
  const host = verse.closest('.text-col') || verse;
  const base = host.getBoundingClientRect();
  // Прямоугольники строк (несколько кусков одной строки — в один)
  const lines = [];
  for (const r of range.getClientRects()) {
    if (r.width < 1 || r.height < 1) continue;
    const line = lines.find((l) => Math.abs(l.mid - (r.top + r.bottom) / 2) < r.height / 2);
    if (line) {
      line.l = Math.min(line.l, r.left);
      line.r = Math.max(line.r, r.right);
      line.t = Math.min(line.t, r.top);
      line.b = Math.max(line.b, r.bottom);
    } else lines.push({ l: r.left, r: r.right, t: r.top, b: r.bottom, mid: (r.top + r.bottom) / 2 });
  }
  if (!lines.length) return;
  lines.sort((x, y) => x.t - y.t);
  // Стык строк — посередине промежутка между ними
  for (let i = 1; i < lines.length; i++) {
    const y = (lines[i - 1].b + lines[i].t) / 2;
    lines[i - 1].b = y;
    lines[i].t = y;
  }
  lines[0].t -= PAD;
  lines[lines.length - 1].b += PAD;
  const box = document.createElement('div');
  box.className = 'part-shape';
  box.setAttribute('aria-hidden', 'true');
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    const next = lines[i + 1];
    const left = l.l - PAD;
    const right = l.r + PAD;
    // Угол скругляем, если он «торчит»: нет соседней строки или она с этой стороны короче
    const tl = !prev || prev.l - PAD > left + 1 ? R : 0;
    const tr = !prev || prev.r + PAD < right - 1 ? R : 0;
    const bl = !next || next.l - PAD > left + 1 ? R : 0;
    const br = !next || next.r + PAD < right - 1 ? R : 0;
    const d = document.createElement('i');
    d.style.cssText = `left:${left - base.left}px;top:${l.t - base.top}px;width:${right - left}px;height:${l.b - l.t}px;border-radius:${tl}px ${tr}px ${br}px ${bl}px`;
    box.appendChild(d);
  });
  host.appendChild(box);
}
