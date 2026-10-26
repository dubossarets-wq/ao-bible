// Подложка выбранной части стиха — одной цельной плашкой со скруглёнными углами, как выделение текста
// на телефоне. Рисуется под текстом по точным границам строк: соседние строки стыкуются ровно посередине
// промежутка (без наложений и просветов); скругляются и выступающие углы, и внутренние — на стыке строк разной длины.
// Та же плашка (цветом сердечка) — у любимых частей стихов: drawPart(root, part, 'fav').
const R = 6; // радиус скругления, px
const PAD = 2; // запас вокруг текста, px

// Один контур по прямоугольникам строк {l, r, t, b}: строки стыкуются посередине промежутка (без зазоров и
// наложений), затем каждая вершина скругляется дугой радиуса R — выпуклые наружу, вогнутые («ступеньки» между
// строками разной длины) внутрь. Закрашивается один раз — двойных тонов и зубцов на стыках нет.
export function plateD(src) {
  const ls = src.map((x) => ({ l: x.l - PAD, r: x.r + PAD, t: x.t, b: x.b })).sort((x, y) => x.t - y.t);
  for (let i = 1; i < ls.length; i++) {
    const y = (ls[i - 1].b + ls[i].t) / 2;
    ls[i - 1].b = y;
    ls[i].t = y;
  }
  ls[0].t -= PAD;
  ls[ls.length - 1].b += PAD;
  const pts = [];
  for (const x of ls) pts.push([x.r, x.t], [x.r, x.b]);
  for (const x of [...ls].reverse()) pts.push([x.l, x.b], [x.l, x.t]);
  let v = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 0.01);
  if (v.length > 1 && Math.hypot(v[0][0] - v[v.length - 1][0], v[0][1] - v[v.length - 1][1]) < 0.01) v.pop();
  const cross = (p0, p1, p2) => (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
  for (let again = true; again && v.length > 3; ) {
    again = false;
    for (let i = 0; i < v.length; i++) {
      if (Math.abs(cross(v[(i + v.length - 1) % v.length], v[i], v[(i + 1) % v.length])) < 0.01) {
        v.splice(i, 1);
        again = true;
        break;
      }
    }
  }
  const n = v.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = v[(i + n - 1) % n], p1 = v[i], p2 = v[(i + 1) % n];
    const d1 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const rad = Math.min(R, d1 / 2, d2 / 2);
    const a1 = [p1[0] + ((p0[0] - p1[0]) / d1) * rad, p1[1] + ((p0[1] - p1[1]) / d1) * rad];
    const a2 = [p1[0] + ((p2[0] - p1[0]) / d2) * rad, p1[1] + ((p2[1] - p1[1]) / d2) * rad];
    d += `${i ? 'L' : 'M'}${a1[0].toFixed(2)} ${a1[1].toFixed(2)}A${rad} ${rad} 0 0 ${cross(p0, p1, p2) > 0 ? 1 : 0} ${a2[0].toFixed(2)} ${a2[1].toFixed(2)}`;
  }
  return d + 'Z';
}

// SVG с одним контуром; координаты — от левого верхнего угла контейнера
export function plateSvg(lines) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'part-svg');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', plateD(lines));
  svg.appendChild(path);
  return svg;
}

export function clearPart(root) {
  root.querySelectorAll('.part-shape').forEach((x) => x.remove());
}

export function drawPart(root, part, kind = '') {
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
  const box = document.createElement('div');
  box.className = kind ? `part-shape ${kind}` : 'part-shape';
  box.setAttribute('aria-hidden', 'true');
  box.appendChild(plateSvg(lines.map((l) => ({ l: l.l - base.left, r: l.r - base.left, t: l.t - base.top, b: l.b - base.top }))));
  host.appendChild(box);
}
