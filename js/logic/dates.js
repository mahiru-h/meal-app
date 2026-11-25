// 日付ユーティリティ（ブラウザ・Node 共通、純粋関数のみ）

const pad = (n) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD'（ローカル時刻基準） */
export function toKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → Date（ローカル 00:00） */
export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 'DD.MM.YYYY' → 'YYYY-MM-DD' */
export function germanToKey(s) {
  const [d, m, y] = s.trim().split('.');
  return `${y}-${pad(Number(m))}-${pad(Number(d))}`;
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** 2 つの日付キーの差（a - b）を日数で返す */
export function diffDays(a, b) {
  return Math.round((fromKey(a) - fromKey(b)) / 86400000);
}

/** ISO 8601 週番号 → 'YYYY-Www' */
export function isoWeek(key) {
  const d = fromKey(key);
  const day = (d.getDay() + 6) % 7; // 月曜 = 0
  d.setDate(d.getDate() - day + 3); // その週の木曜
  const year = d.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const week = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${year}-W${pad(week)}`;
}

/** カレンダー表示用: 月の日付キーを月曜始まりの 6 週 × 7 日で返す（範囲外は null） */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(toKey(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function isWeekend(key) {
  const g = fromKey(key).getDay();
  return g === 0 || g === 6;
}
