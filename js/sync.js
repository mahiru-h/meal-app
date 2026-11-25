// Mensa メニューの取得・端末内キャッシュ・照合待ち記録の自動照合
import { db } from './db.js';
import { state, addEntries, deleteEntries, updateEntry } from './store.js';
import { isoWeek, toKey, addDays } from './logic/dates.js';
import { matchPrice } from './logic/mensa.js';
import { mensaEntries } from './logic/model.js';

const BASE = 'data/mensa/';
const memo = new Map(); // week → file

async function fetchJson(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export async function getWeek(week) {
  if (memo.has(week)) return memo.get(week);
  const row = await db.get('mensa', week);
  if (row) memo.set(week, row.data);
  return row ? row.data : null;
}

/** 端末に保存済みのその日のメニュー（なければ null） */
export async function getMensaDay(date) {
  const w = await getWeek(isoWeek(date));
  return w?.days?.[date] || null;
}

export async function mensaStatus() {
  return db.kvGet('mensaIndex', null);
}

let running = null;

/**
 * オンラインなら最新の週ファイルを取得し、照合待ちを解決する。
 * オフラインでも、保存済みのメニューで照合を試みる。
 */
export function sync() {
  return (running ||= (async () => {
    let fetched = 0;
    try {
      if (navigator.onLine) fetched = await fetchWeeks();
    } catch (e) {
      console.warn('Mensa sync failed', e);
    }
    const resolved = await resolvePending();
    return { fetched, resolved };
  })().finally(() => (running = null)));
}

async function fetchWeeks() {
  const index = await fetchJson(`${BASE}index.json`);
  await db.kvSet('mensaIndex', { ...index, syncedAt: new Date().toISOString() });
  const available = new Set(index.weeks || []);
  const today = toKey(new Date());
  const wanted = new Set([isoWeek(today), isoWeek(addDays(today, 7))]);
  for (const e of state.entries) if (e.type === 'pending') wanted.add(isoWeek(e.date));
  let n = 0;
  for (const w of wanted) {
    if (!available.has(w)) continue;
    const cached = await getWeek(w);
    const isPast = w < isoWeek(today);
    if (cached && isPast) continue; // 過去の週は変わらない
    const data = await fetchJson(`${BASE}${w}.json`);
    await db.put('mensa', { week: w, data });
    memo.set(w, data);
    n++;
  }
  return n;
}

/** 照合待ちの記録を、保存済みメニューと価格で照合する */
export async function resolvePending() {
  let resolved = 0;
  for (const e of state.entries.filter((x) => x.type === 'pending')) {
    const day = await getMensaDay(e.date);
    if (!day) continue;
    const combos = matchPrice(day, e.price);
    if (combos.length === 1) {
      const c = combos[0];
      const sides = Array.from({ length: c.sides }, () => ({ name: 'side dish', price: day.sides?.[0]?.price ?? 0.8 }));
      const list = mensaEntries({ date: e.date, mains: c.main ? [c.main] : [], sides, juice: c.juice, auto: true });
      await addEntries(list);
      await deleteEntries([e.id]);
      resolved++;
    } else if (e.candidates !== combos.length) {
      await updateEntry({ ...e, candidates: combos.length, checkedAt: Date.now() });
    }
  }
  return resolved;
}
