// Mensa の表示・価格照合（純粋関数のみ）
import { JUICE } from './nutrition.js';

export const MIN_PRICE = 1.9;
const cents = (x) => Math.round(Number(x) * 100);

/** 主菜候補: 学生価格 €1.9 以上、価格昇順 */
export function mainsForDay(day) {
  if (!day) return [];
  return (day.mains || [])
    .filter((m) => cents(m.price) >= cents(MIN_PRICE))
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}

/** 付け合わせを出すか: 主菜が 1 つ以上選ばれ、そのうちサラダ付きでないものがある場合 */
export function shouldOfferSides(selectedMains) {
  return selectedMains.length > 0 && selectedMains.some((m) => !m.salad);
}

/**
 * 支払額から組み合わせを推定する。
 * 主菜 1 品 + ジュース 0/1 本 + 付け合わせ 0〜2 個、または ジュースのみ。
 * @returns {{main: object|null, juice: boolean, sides: number, total: number}[]}
 */
export function matchPrice(day, price) {
  const target = cents(price);
  if (!Number.isFinite(target) || target <= 0) return [];
  const sidePrice = cents(day?.sides?.[0]?.price ?? 0.8);
  const juice = cents(JUICE.price);
  const out = [];
  if (target === juice) out.push({ main: null, juice: true, sides: 0, total: juice / 100 });
  for (const m of mainsForDay(day)) {
    for (const j of [false, true]) {
      for (let s = 0; s <= 2; s++) {
        if (s > 0 && m.salad) continue;
        const total = cents(m.price) + (j ? juice : 0) + s * sidePrice;
        if (total === target) out.push({ main: m, juice: j, sides: s, total: total / 100 });
      }
    }
  }
  return out;
}

export function describeCombo(c) {
  const parts = [];
  if (c.main) parts.push(c.main.name);
  if (c.sides) parts.push(`付け合わせ ×${c.sides}`);
  if (c.juice) parts.push(JUICE.name);
  return parts.join(' + ');
}

export const fmtPrice = (x) => `€${Number(x).toFixed(2)}`;
