// Mensa・TU cafe メニューの取得・端末内キャッシュ・照合待ち記録の自動照合
import { db } from './db.js';
import { state, addEntries, deleteEntries, updateEntry } from './store.js';
import { isoWeek, toKey, addDays } from './logic/dates.js';
import { matchPrice } from './logic/mensa.js';
import { mensaEntries } from './logic/model.js';

// 店舗ごとの置き場所。IndexedDB のキーは Mensa が週（従来どおり）、cafe は 'cafe:週'
const PLACES = {
  mensa: { base: 'data/mensa/', key: (w) => w, indexKey: 'mensaIndex' },
  cafe: { base: 'data/cafe/', key: (w) => `cafe:${w}`, indexKey: 'cafeIndex' },
};
const memo = new Map(); // DB キー → file

async function fetchJson(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export async function getWeek(week, place = 'mensa') {
  const k = PLACES[place].key(week);
  if (memo.has(k)) return memo.get(k);
  const row = await db.get('mensa', k);
  if (row) memo.set(k, row.data);
  return row ? row.data : null;
}

/** 端末に保存済みのその日のメニュー（なければ null） */
export async function getMensaDay(date) {
  const w = await getWeek(isoWeek(date));
  return w?.days?.[date] || null;
}

/**
 * TU cafe のメニュー。ピザ・パスタはほぼ固定なので、その日の分がなければ（土日・未取得・オフライン）
 * 端末にある直近の日のメニューを使う。
 * @returns {{ day: object, date: string } | null}
 */
export async function getCafeMenu(date) {
  const weeks = [isoWeek(date), isoWeek(addDays(date, -7)), isoWeek(addDays(date, 7)), isoWeek(addDays(date, -14))];
  const days = [];
  for (const w of weeks) {
    const f = await getWeek(w, 'cafe');
    for (const [d, v] of Object.entries(f?.days || {})) if (v.mains?.length) days.push([d, v]);
  }
  if (!days.length) {
    // それ以外の保存済みの週から最新のもの
    const rows = (await db.all('mensa')).filter((r) => String(r.week).startsWith('cafe:')).sort((a, b) => b.week.localeCompare(a.week));
    for (const [d, v] of Object.entries(rows[0]?.data?.days || {})) if (v.mains?.length) days.push([d, v]);
  }
  if (!days.length) return null;
  const exact = days.find(([d]) => d === date);
  if (exact) return { day: exact[1], date };
  const before = days.filter(([d]) => d < date).sort((a, b) => b[0].localeCompare(a[0]))[0];
  const after = days.filter(([d]) => d > date).sort((a, b) => a[0].localeCompare(b[0]))[0];
  const [d, v] = before || after;
  return { day: v, date: d };
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
    for (const place of Object.keys(PLACES)) {
      try {
        if (navigator.onLine) fetched += await fetchWeeks(place);
      } catch (e) {
        console.warn(`${place} sync failed`, e);
      }
    }
    const resolved = await resolvePending();
    return { fetched, resolved };
  })().finally(() => (running = null)));
}

async function fetchWeeks(place) {
  const P = PLACES[place];
  const index = await fetchJson(`${P.base}index.json`);
  await db.kvSet(P.indexKey, { ...index, syncedAt: new Date().toISOString() });
  const available = new Set(index.weeks || []);
  const today = toKey(new Date());
  const wanted = new Set([isoWeek(today), isoWeek(addDays(today, 7))]);
  if (place === 'mensa') for (const e of state.entries) if (e.type === 'pending') wanted.add(isoWeek(e.date));
  if (place === 'cafe' && index.weeks?.length) wanted.add(index.weeks[index.weeks.length - 1]); // 直近の週を必ず 1 つ持つ
  let n = 0;
  for (const w of wanted) {
    if (!available.has(w)) continue;
    const cached = await getWeek(w, place);
    const isPast = w < isoWeek(today);
    if (cached && isPast) continue; // 過去の週は変わらない
    const data = await fetchJson(`${P.base}${w}.json`);
    await db.put('mensa', { week: P.key(w), data });
    memo.set(P.key(w), data);
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
