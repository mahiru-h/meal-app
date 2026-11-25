// Mensa API の生データを、アプリで使う形に正規化する（Node から使用）
import { germanToKey, isoWeek } from '../js/logic/dates.js';

export const API_URL =
  'https://www.stwdo.de/api/v2/speiseplan/naechste-2-wochen?verbrauchsortnr=341&limit=500';

const SIDE_CATEGORY = 116; // 'Beilagen Speiseplan'

/** "spätzle pan (20a,22,26)" → "spätzle pan" */
export function cleanLine(s) {
  if (!s) return '';
  return s.replace(/\s*\([0-9a-z,\s]+\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
}

function lines(raw, prefix, max) {
  const out = [];
  for (let i = 1; i <= max; i++) {
    const v = cleanLine(raw[`${prefix}${i}`]);
    if (v) out.push(v);
  }
  return out;
}

const SALAD_RE = /salat|salad|coleslaw/i;

/** 1 件の生データ → { kind: 'main' | 'side', items: [...] } */
export function normalizeItem(raw) {
  const date = germanToKey(raw.PRODUKTIONSDATUM);
  const en = lines(raw, 'AUSGABETEXT2ZEILE', 8);
  const de = lines(raw, 'AUSGABETEXTZEILE', 7);
  const price = Number(raw.VKPREISSTUD) || 0;
  const tags = (raw.FREIKENNZEICHEN || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  if (raw.PRODUKTIONSARTNR === SIDE_CATEGORY) {
    const items = (en.length ? en : de).map((name, i) => ({
      id: `${raw.PRODUKTIONSNUMMER}-${i}`,
      name,
      nameDe: de[i] || name,
      price,
    }));
    return { date, kind: 'side', items };
  }

  return {
    date,
    kind: 'main',
    items: [
      {
        id: String(raw.PRODUKTIONSNUMMER),
        cat: raw.PRODUKTIONSNAME,
        catNo: raw.PRODUKTIONSARTNR,
        name: en[0] || de[0] || raw.PRODUKTIONSBEZEICHNUNG,
        with: en.slice(1),
        de,
        price,
        tags,
        salad: [...en, ...de].some((l) => SALAD_RE.test(l)),
      },
    ],
  };
}

/** API 配列 → { 'YYYY-MM-DD': { mains: [], sides: [] } } */
export function groupByDate(rawList) {
  const days = {};
  for (const raw of rawList) {
    if (!raw || !raw.PRODUKTIONSDATUM) continue;
    const n = normalizeItem(raw);
    const day = (days[n.date] ||= { mains: [], sides: [] });
    if (n.kind === 'side') day.sides.push(...n.items);
    else day.mains.push(...n.items);
  }
  for (const d of Object.values(days)) {
    d.mains.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
    // 同じ英語名の付け合わせは 1 つにまとめる
    const seen = new Set();
    d.sides = d.sides.filter((s) => (seen.has(s.name.toLowerCase()) ? false : seen.add(s.name.toLowerCase())));
  }
  return days;
}

/**
 * 既存の週ファイル群に新しい日付データを統合する。
 * 取得できた日付は上書き（当日の変更に追随）、それ以外の過去データは保持する。
 * @param {Record<string, object>} weekFiles 'YYYY-Www' → { week, days }
 * @param {Record<string, object>} days groupByDate の結果
 * @returns {string[]} 変更された週
 */
export function mergeDays(weekFiles, days) {
  const changed = new Set();
  for (const [date, content] of Object.entries(days)) {
    const w = isoWeek(date);
    const file = (weekFiles[w] ||= { week: w, days: {} });
    if (JSON.stringify(file.days[date]) !== JSON.stringify(content)) {
      file.days[date] = content;
      changed.add(w);
    }
  }
  for (const w of changed) {
    const f = weekFiles[w];
    f.days = Object.fromEntries(Object.entries(f.days).sort(([a], [b]) => a.localeCompare(b)));
  }
  return [...changed].sort();
}
