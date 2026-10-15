// Различия между двумя текстами по словам (наибольшая общая подпоследовательность).
// Возвращает части второго текста с пометкой «отличается» и долю отличий.
const norm = (w) => w.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');

export function diffWords(base, other) {
  const a = base.split(/(\s+)/).filter((x) => x.trim()).map(norm);
  const parts = other.split(/(\s+)/);
  const b = parts.filter((x) => x.trim());
  const bn = b.map(norm);
  const n = a.length;
  const m = bn.length;
  if (!m) return { parts: [{ text: other, diff: false }], ratio: 0 };
  // Таблица НОП; стихи короткие — квадрат допустим
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === bn[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const same = new Array(m).fill(false);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === bn[j]) {
      same[j] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const out = [];
  let k = 0;
  for (const p of parts) {
    if (!p.trim()) out.push({ text: p, diff: false });
    else out.push({ text: p, diff: !same[k++] && !!norm(p) });
  }
  const ratio = 1 - dp[0][0] / Math.max(n, m);
  return { parts: out, ratio };
}
