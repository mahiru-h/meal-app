// アプリ全体の状態（記録はメモリに全件保持。1 年分でも数千件なので軽い）
import { db } from './db.js';
import { buildCatalog } from './logic/model.js';
import { DEFAULT_TEMPLATE, EXCLUSIONS } from './logic/prefs.js';
import { toKey } from './logic/dates.js';

export const DEFAULT_SETTINGS = {
  mode: 'healthy',
  kcal: 1950,
  weight: 50,
  height: 152,
  age: 26,
  suggestDays: 14,
  listSize: 10,
  excluded: EXCLUSIONS.map((e) => e.id),
};

export const state = {
  entries: [],
  catalog: new Map(),
  savedItems: [],
  settings: { ...DEFAULT_SETTINGS },
  dishes: null,
  foods: null,
  recipes: [],
  online: navigator.onLine,
};

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export async function init() {
  const [dishes, foods, recipes, entries, items, settings] = await Promise.all([
    loadJson('data/dishes.json'),
    loadJson('data/foods.json'),
    loadJson('data/recipes.json'),
    db.all('entries'),
    db.all('items'),
    db.kvGet('settings', null),
  ]);
  state.dishes = dishes;
  state.foods = foods;
  state.recipes = recipes.recipes;
  state.entries = entries;
  state.savedItems = items;
  state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  rebuildCatalog();
}

export function rebuildCatalog() {
  state.catalog = buildCatalog(state.dishes, state.foods, state.savedItems);
}

/* ---------- 記録 ---------- */

export const entriesOn = (date) => state.entries.filter((e) => e.date === date);

export async function addEntries(list) {
  await db.putMany('entries', list);
  state.entries.push(...list);
}

export async function updateEntry(e) {
  await db.put('entries', e);
  const i = state.entries.findIndex((x) => x.id === e.id);
  if (i >= 0) state.entries[i] = e;
  else state.entries.push(e);
}

export async function deleteEntries(ids) {
  await db.delMany('entries', ids);
  const set = new Set(ids);
  state.entries = state.entries.filter((e) => !set.has(e.id));
}

/* ---------- 品目 ---------- */

export async function saveItem(item) {
  const toSave = { ...item, updatedAt: Date.now() };
  await db.put('items', toSave);
  const i = state.savedItems.findIndex((x) => x.key === item.key);
  if (i >= 0) state.savedItems[i] = toSave;
  else state.savedItems.push(toSave);
  state.catalog.set(item.key, toSave);
}

export async function saveItems(items) {
  const list = items.map((it) => ({ ...it, updatedAt: Date.now() }));
  await db.putMany('items', list);
  const map = new Map(state.savedItems.map((x) => [x.key, x]));
  for (const it of list) map.set(it.key, it);
  state.savedItems = [...map.values()];
  rebuildCatalog();
}

/* ---------- 設定・好み ---------- */

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await db.kvSet('settings', state.settings);
}

export async function getTemplate() {
  return (await db.kvGet('template', null)) || structuredClone(DEFAULT_TEMPLATE);
}

export async function saveTemplate(t) {
  await db.kvSet('template', t);
}

/** 今日の好み（今日変更していなければテンプレート） */
export async function getActivePrefs() {
  const template = await getTemplate();
  const today = await db.kvGet('todayPrefs', null);
  if (today && today.date === toKey(new Date())) {
    return { prefs: today.prefs, fromTemplate: JSON.stringify(today.prefs) === JSON.stringify(template), template };
  }
  return { prefs: structuredClone(template), fromTemplate: true, template };
}

export async function setTodayPrefs(prefs) {
  await db.kvSet('todayPrefs', { date: toKey(new Date()), prefs });
}
