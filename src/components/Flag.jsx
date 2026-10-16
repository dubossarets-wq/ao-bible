// Круглые флажки для выбора языка. Эмодзи-флаги Windows не рисует, поэтому — свои упрощённые SVG
// (квадрат 32×32, середина флага; круг вырезает CSS — .flag, тонкая обводка, чтобы белое не терялось на фоне).
// Мелкие гербы опущены: на кружке в 24 px их всё равно не разглядеть.
import React from 'react';

// Пятиконечная звезда: координаты вершин для <polygon>
function star(cx, cy, r, rot = 0) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = ((rot - 90 + i * 36) * Math.PI) / 180;
    const rr = i % 2 ? r * 0.382 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

// Полосы: горизонтальные (h) или вертикальные (v), доли — по ширине полосы
const stripes = (dir, colors, parts = colors.map(() => 1)) => {
  const sum = parts.reduce((a, b) => a + b, 0);
  let at = 0;
  return colors.map((c, i) => {
    const size = (32 * parts[i]) / sum;
    const r = dir === 'h' ? <rect key={i} x="0" y={at} width="32" height={size + 0.1} fill={c} /> : <rect key={i} x={at} y="0" width={size + 0.1} height="32" fill={c} />;
    at += size;
    return r;
  });
};

// Триграммы флага Кореи: 1 — сплошная черта, 0 — разорванная
const trigram = (bits, x, y, rot) => (
  <g transform={`translate(${x} ${y}) rotate(${rot})`} fill="#000">
    {bits.map((b, i) =>
      b ? <rect key={i} x="-3.2" y={-2.6 + i * 1.9} width="6.4" height="1.2" /> : (
        <g key={i}>
          <rect x="-3.2" y={-2.6 + i * 1.9} width="2.9" height="1.2" />
          <rect x="0.3" y={-2.6 + i * 1.9} width="2.9" height="1.2" />
        </g>
      )
    )}
  </g>
);

const FLAGS = {
  ru: () => stripes('h', ['#fff', '#0039a6', '#d52b1e']),
  ua: () => stripes('h', ['#0057b7', '#ffd700']),
  ro: () => stripes('v', ['#002b7f', '#fcd116', '#ce1126']),
  gb: () => (
    <>
      <rect width="32" height="32" fill="#012169" />
      <path d="M0 0L32 32M32 0L0 32" stroke="#fff" strokeWidth="6" />
      <path d="M0 0L32 32M32 0L0 32" stroke="#c8102e" strokeWidth="2" />
      <path d="M16 0V32M0 16H32" stroke="#fff" strokeWidth="10" />
      <path d="M16 0V32M0 16H32" stroke="#c8102e" strokeWidth="6" />
    </>
  ),
  es: () => stripes('h', ['#aa151b', '#f1bf00', '#aa151b'], [1, 2, 1]),
  br: () => (
    <>
      <rect width="32" height="32" fill="#009b3a" />
      <polygon points="1,16 16,4.5 31,16 16,27.5" fill="#fedf00" />
      <circle cx="16" cy="16" r="7" fill="#002776" />
      <path d="M9.3 14.4q7.2-1.9 13.5 3.6" stroke="#fff" strokeWidth="1.3" fill="none" />
    </>
  ),
  fr: () => stripes('v', ['#002654', '#fff', '#ce1126']),
  de: () => stripes('h', ['#000', '#dd0000', '#ffce00']),
  it: () => stripes('v', ['#009246', '#fff', '#ce2b37']),
  pl: () => stripes('h', ['#fff', '#dc143c']),
  by: () => (
    <>
      {stripes('h', ['#c8313e', '#4aa657'], [2, 1])}
      <rect width="5" height="32" fill="#fff" />
      {[2, 7.3, 12.6, 17.9, 23.2, 28.5].map((y) => (
        <path key={y} d={`M2.5 ${y - 2}L4.3 ${y}L2.5 ${y + 2}L0.7 ${y}Z`} fill="#c8313e" />
      ))}
    </>
  ),
  bg: () => stripes('h', ['#fff', '#00966e', '#d62612']),
  rs: () => (
    <>
      {stripes('h', ['#c6363c', '#0c4076', '#fff'])}
      <path d="M7 9.5h7v6.5q0 4-3.5 5.5Q7 20 7 16Z" fill="#c6363c" stroke="#fff" strokeWidth="0.8" />
      <path d="M10.5 10.5v10M7.5 14.5h6" stroke="#fff" strokeWidth="1.1" />
    </>
  ),
  cz: () => (
    <>
      {stripes('h', ['#fff', '#d7141a'])}
      <polygon points="-8,0 16,16 -8,32" fill="#11457e" />
    </>
  ),
  ge: () => (
    <>
      <rect width="32" height="32" fill="#fff" />
      <path d="M16 0V32M0 16H32" stroke="#ff0000" strokeWidth="5" />
      {[[7.5, 7.5], [24.5, 7.5], [7.5, 24.5], [24.5, 24.5]].map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y - 3}V${y + 3}M${x - 3} ${y}H${x + 3}`} stroke="#ff0000" strokeWidth="1.7" />
      ))}
    </>
  ),
  am: () => stripes('h', ['#d90012', '#0033a0', '#f2a800']),
  kr: () => (
    <>
      <rect width="32" height="32" fill="#fff" />
      <g transform="rotate(33.7 16 16)">
        <circle cx="16" cy="16" r="7.5" fill="#0047a0" />
        <path d="M8.5 16a7.5 7.5 0 0 1 15 0a3.75 3.75 0 0 1-7.5 0a3.75 3.75 0 0 0-7.5 0Z" fill="#cd2e3a" />
      </g>
      {trigram([1, 1, 1], 6.6, 7.4, -56.3)}
      {trigram([0, 1, 0], 25.4, 7.4, 56.3)}
      {trigram([1, 0, 1], 6.6, 24.6, 56.3)}
      {trigram([0, 0, 0], 25.4, 24.6, -56.3)}
    </>
  ),
  cn: () => (
    <>
      <rect width="32" height="32" fill="#ee1c25" />
      <polygon points={star(9, 10, 5)} fill="#ffde00" />
      <polygon points={star(16, 4.5, 1.6, 23)} fill="#ffde00" />
      <polygon points={star(19, 7.8, 1.6, 46)} fill="#ffde00" />
      <polygon points={star(19, 12, 1.6, 70)} fill="#ffde00" />
      <polygon points={star(16, 15.2, 1.6, 21)} fill="#ffde00" />
    </>
  ),
  jp: () => (
    <>
      <rect width="32" height="32" fill="#fff" />
      <circle cx="16" cy="16" r="9.6" fill="#bc002d" />
    </>
  ),
  id: () => stripes('h', ['#ce1126', '#fff']),
  in: () => (
    <>
      {stripes('h', ['#ff9933', '#fff', '#138808'])}
      <circle cx="16" cy="16" r="4.2" fill="none" stroke="#000080" strokeWidth="0.9" />
      <circle cx="16" cy="16" r="1" fill="#000080" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 12;
        return <path key={i} d={`M${16 - 4 * Math.cos(a)} ${16 - 4 * Math.sin(a)}L${16 + 4 * Math.cos(a)} ${16 + 4 * Math.sin(a)}`} stroke="#000080" strokeWidth="0.35" />;
      })}
    </>
  ),
  tz: () => (
    <>
      <rect width="32" height="32" fill="#1eb53a" />
      <polygon points="32,0 32,32 0,32" fill="#00a3dd" />
      <path d="M-2 34L34 -2" stroke="#fcd116" strokeWidth="12" />
      <path d="M-2 34L34 -2" stroke="#000" strokeWidth="8" />
    </>
  ),
};

export default function Flag({ code, size = 24 }) {
  const draw = FLAGS[code];
  return (
    <span className="flag" style={{ width: size, height: size }} aria-hidden="true">
      {draw && (
        <svg viewBox="0 0 32 32" width={size} height={size}>
          {draw()}
        </svg>
      )}
    </span>
  );
}
