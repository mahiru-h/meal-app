// 入力候補・履歴・頻度の計算（純粋関数のみ）
import { diffDays } from './dates.js';

/** 比較用に正規化: 全角英数→半角、カタカナ→ひらがな、小文字、空白除去 */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s・･\-_/]+/g, '')
    .replace(/[äöüß]/g, (c) => ({ ä: 'a', ö: 'o', ü: 'u', ß: 'ss' })[c]);
}

/** 入力と候補の一致度 0〜1 */
export function matchScore(query, text) {
  const q = normalize(query);
  const t = normalize(text);
  if (!q) return 1;
  if (!t) return 0;
  if (t === q) return 1;
  if (t.startsWith(q)) return 0.9;
  const i = t.indexOf(q);
  if (i >= 0) return 0.75 - Math.min(i, 10) * 0.01;
  // 順番どおりに文字が含まれるか（ゆるい一致）
  let j = 0;
  for (const ch of t) if (ch === q[j]) j++;
  if (j === q.length) return 0.4 * (q.length / t.length) + 0.2;
  // 先頭 2 文字以上が共通
  let k = 0;
  while (k < q.length && k < t.length && q[k] === t[k]) k++;
  return k >= 2 ? 0.25 : 0;
}

/** 記録の同一性キー */
export function entryKey(e) {
  if (e.type === 'product') return `p:${normalize(e.product)}|${normalize(e.seller)}`;
  if (e.type === 'dish') return `d:${normalize(e.dishType)}|${normalize(e.menuName)}`;
  return null;
}

/**
 * 頻度（件数）を数える
 * @param {object[]} entries
 * @param {(e) => string|null} keyFn
 * @param {{today: string, days?: number, timing?: string, group?: string}} opt
 */
export function countBy(entries, keyFn, { today, days = 30, timing, group } = {}) {
  const counts = new Map();
  let total = 0;
  for (const e of entries) {
    if (timing && e.timing !== timing) continue;
    if (group && e.group !== group) continue;
    if (today) {
      const d = diffDays(today, e.date);
      if (d < 0 || d >= days) continue;
    }
    const k = keyFn(e);
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
    total++;
  }
  return { counts, total };
}

/**
 * 入力欄の候補を並べる。
 * 空欄: 直前 n 日の割合順。入力あり: 一致度 0.65 + 割合 0.35 の合成。
 * @param {string} query
 * @param {{key: string, text: string}[]} candidates
 * @param {{counts: Map, total: number}} freq
 */
export function rankCandidates(query, candidates, freq, limit = 8) {
  const total = Math.max(1, freq.total);
  const q = normalize(query);
  const seen = new Set();
  const scored = [];
  for (const c of candidates) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    const share = (freq.counts.get(c.key) || 0) / total;
    let score;
    if (!q) {
      score = share + (c.seed ? 0 : 0.0001);
    } else {
      const m = Math.max(matchScore(q, c.text), ...(c.alt || []).map((a) => matchScore(q, a)));
      if (m <= 0) continue;
      score = m * 0.65 + Math.min(share * 2, 1) * 0.35;
    }
    scored.push({ ...c, share, score });
  }
  scored.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text, 'ja'));
  return scored.slice(0, limit);
}

/** 履歴: 新しい順・重複なし */
export function recentUnique(entries, { limit = 10, group, timing } = {}) {
  const sorted = [...entries]
    .filter((e) => (!group || e.group === group) && (!timing || e.timing === timing) && entryKey(e))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const seen = new Set();
  const out = [];
  for (const e of sorted) {
    const k = entryKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

/** このタイミングでよく食べるもの（過去 days 日の割合順） */
export function timingRanking(entries, { today, timing, group = 'home', days = 30, limit = 10 }) {
  const { counts, total } = countBy(entries, entryKey, { today, days, timing, group });
  const latest = new Map();
  for (const e of entries) {
    const k = entryKey(e);
    if (k && counts.has(k) && e.timing === timing && (!latest.has(k) || latest.get(k).date < e.date)) latest.set(k, e);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || latest.get(b[0]).date.localeCompare(latest.get(a[0]).date))
    .slice(0, limit)
    .map(([key, n]) => ({ key, share: n / total, entry: latest.get(key) }));
}

/** 「前回と同じ」: 指定日より前で、同じタイミングの記録がある直近の日の記録 */
export function previousSame(entries, date, timing) {
  let best = null;
  for (const e of entries) {
    if (e.timing !== timing || e.date >= date || e.type === 'pending') continue;
    if (!best || e.date > best) best = e.date;
  }
  return best ? entries.filter((e) => e.date === best && e.timing === timing && e.type !== 'pending') : [];
}
