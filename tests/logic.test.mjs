import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { isoWeek, germanToKey, addDays, monthGrid } from '../js/logic/dates.js';
import { cleanLine, groupByDate, mergeDays } from '../scripts/mensa-lib.mjs';
import { mainsForDay, matchPrice, shouldOfferSides } from '../js/logic/mensa.js';
import { normalize, matchScore, rankCandidates, countBy, entryKey, timingRanking, previousSame, recentUnique } from '../js/logic/suggest.js';
import { dailyTargets, estimateMensaMain, sumEntries } from '../js/logic/nutrition.js';
import { recommend, deficits, mealIdeal } from '../js/logic/recommend.js';
import { parseCSV, parseFoodsCSV, parseOptions, FOOD_TEMPLATE, entriesToCSV } from '../js/logic/csv.js';
import { buildCatalog, entryFromItem, newDishItem, itemFromImport, mensaEntries } from '../js/logic/model.js';

const raw = JSON.parse(await readFile(new URL('./fixtures/mensa-raw.json', import.meta.url)));
const dishes = JSON.parse(await readFile(new URL('../data/dishes.json', import.meta.url)));
const foods = JSON.parse(await readFile(new URL('../data/foods.json', import.meta.url)));
const { recipes } = JSON.parse(await readFile(new URL('../data/recipes.json', import.meta.url)));

test('dates', () => {
  assert.equal(isoWeek('2026-11-25'), '2026-W48');
  assert.equal(isoWeek('2027-01-01'), '2026-W53');
  assert.equal(isoWeek('2026-01-01'), '2026-W01');
  assert.equal(germanToKey('01.12.2026'), '2026-12-01');
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  const g = monthGrid(2026, 10); // 2026 年 11 月: 1 日は日曜 → 月曜始まりで 6 マス空く
  assert.equal(g.indexOf('2026-11-01'), 6);
  assert.equal(g.length % 7, 0);
});

test('Mensa 正規化', () => {
  assert.equal(cleanLine('spätzle pan (20a,22,26)'), 'spätzle pan');
  const days = groupByDate(raw);
  const d = days['2026-11-25'];
  assert.equal(d.sides.length, 5); // 付け合わせ 1 レコード → 5 品に展開
  assert.equal(d.sides[0].price, 0.8);
  const gyros = d.mains.find((m) => m.name === 'vegan gyros');
  assert.ok(gyros.salad);
  assert.deepEqual(gyros.tags, ['N']);
  const stew = d.mains.find((m) => m.id === '2908479');
  assert.equal(stew.salad, false);
  assert.equal(stew.price, 1.9);
});

test('Mensa 週ファイルの統合で過去データを保持', () => {
  const files = { '2026-W47': { week: '2026-W47', days: { '2026-11-20': { mains: [{ id: 'x' }], sides: [] } } } };
  const changed = mergeDays(files, groupByDate(raw));
  assert.deepEqual(changed, ['2026-W48', '2026-W49']);
  assert.ok(files['2026-W47'].days['2026-11-20']);
  assert.deepEqual(Object.keys(files['2026-W48'].days), ['2026-11-25', '2026-11-26']);
  assert.deepEqual(mergeDays(files, groupByDate(raw)), []); // 同じ内容なら変更なし
});

test('Mensa 表示と価格照合', () => {
  const days = groupByDate(raw);
  const d = days['2026-11-25'];
  const mains = mainsForDay(d);
  assert.ok(mains.every((m) => m.price >= 1.9));
  assert.deepEqual(mains.map((m) => m.price), [...mains.map((m) => m.price)].sort((a, b) => a - b));
  assert.equal(mainsForDay(days['2026-11-30']).length, 0); // €0 の Tipp は除外

  assert.equal(matchPrice(d, 3.8).length, 2); // 同価格の主菜 2 品
  assert.equal(matchPrice(d, 5.55).length, 2); // 3.80 + ジュース 1.75
  const stewSide = matchPrice(d, 2.7);
  assert.equal(stewSide.length, 1);
  assert.equal(stewSide[0].sides, 1);
  assert.equal(matchPrice(d, 1.75)[0].juice, true);
  assert.equal(matchPrice(d, 99).length, 0);

  const salad = mains.filter((m) => m.salad);
  const noSalad = mains.filter((m) => !m.salad);
  assert.equal(shouldOfferSides([]), false);
  assert.equal(shouldOfferSides(salad.slice(0, 1)), false);
  assert.equal(shouldOfferSides(noSalad.slice(0, 1)), true);
});

const E = (date, timing, extra) => ({ id: Math.random().toString(), date, timing, group: 'home', type: 'dish', dishType: 'パスタ', menuName: '和風ツナパスタ', createdAt: 1, ...extra });

test('候補の順位付け', () => {
  assert.equal(normalize('ラーメン'), normalize('らーめん'));
  assert.equal(normalize('ＡＢＣ'), 'abc');
  assert.ok(matchScore('ツナ', '和風ツナパスタ') > 0.5);
  assert.ok(matchScore('wfu', 'wafu') > 0);
  assert.equal(matchScore('xyz', 'パスタ'), 0);

  const entries = [
    E('2026-11-24', 'dinner'),
    E('2026-11-23', 'dinner'),
    E('2026-11-22', 'dinner', { menuName: 'ミートソース' }),
    E('2026-10-01', 'dinner', { menuName: '古い献立' }),
    E('2026-11-24', 'lunch', { menuName: 'ペペロンチーノ' }),
  ];
  const freq = countBy(entries, entryKey, { today: '2026-11-25', days: 14 });
  assert.equal(freq.total, 4);
  const cands = ['和風ツナパスタ', 'ミートソース', 'ペペロンチーノ', '古い献立'].map((n) => ({ key: entryKey({ type: 'dish', dishType: 'パスタ', menuName: n }), text: n }));
  const empty = rankCandidates('', cands, freq);
  assert.equal(empty[0].text, '和風ツナパスタ');
  const typed = rankCandidates('ミート', cands, freq);
  assert.equal(typed[0].text, 'ミートソース');

  const rank = timingRanking(entries, { today: '2026-11-25', timing: 'dinner' });
  assert.equal(rank[0].entry.menuName, '和風ツナパスタ');
  assert.ok(Math.abs(rank[0].share - 2 / 3) < 1e-9);
  assert.equal(rank.length, 2); // 30 日より前は除外

  assert.equal(recentUnique(entries, { limit: 10 }).length, 4);
  const prev = previousSame(entries, '2026-11-25', 'dinner');
  assert.equal(prev.length, 1);
  assert.equal(prev[0].date, '2026-11-24');
});

test('目標値（1,950 kcal）', () => {
  const t = dailyTargets({ kcal: 1950, weight: 50, mode: 'healthy' });
  assert.equal(t.kcal, 1950);
  assert.deepEqual(t.protein, [63, 98]);
  assert.deepEqual(t.fat, [43, 65]);
  assert.deepEqual(t.carbs, [244, 317]);
  assert.deepEqual(t.salt, [0, 6.5]);
});

test('Mensa 概算と記録', () => {
  const d = groupByDate(raw)['2026-11-25'];
  for (const m of d.mains) {
    const n = estimateMensaMain(m);
    assert.ok(n.kcal > 200 && Object.values(n).every((v) => v >= 0));
  }
  const es = mensaEntries({ date: '2026-11-25', mains: [d.mains[0]], sides: [d.sides[0]], juice: true });
  assert.equal(es.length, 3);
  assert.ok(sumEntries(es).kcal > 0);
});

test('おすすめ', () => {
  const targets = dailyTargets({ kcal: 1950 });
  const avg = { kcal: 1800, protein: 50, fat: 70, carbs: 230, fiber: 10, veg: 100, salt: 8 };
  const def = deficits(avg, targets);
  assert.ok(def.veg > 0 && def.salt > 0);
  const base = {
    recipes, prefs: { area: 'de', cuisines: ['jp'], likes: ['ramen', 'wafu_pasta'], wants: ['pasta', 'nabe'] },
    mode: 'healthy', excluded: ['onion'], moods: [], def, recentNames: new Set(), cookedBreakfasts: 0,
  };
  const dinner = recommend({ ...base, timing: 'dinner', ideal: mealIdeal('dinner', targets, { kcal: 900 }, new Set(['breakfast', 'lunch'])) });
  assert.equal(dinner.length, 3);
  assert.equal(new Set(dinner.map((r) => r.recipe.id)).size, 3);

  const noodle = recommend({ ...base, timing: 'dinner', moods: ['noodle'], ideal: { kcal: 650, protein: 25, veg: 120, fiber: 6 } });
  assert.ok(noodle.every((r) => r.recipe.tags.includes('noodle')));

  // テスト期間: 朝食の調理は週 2 回まで
  const bf = recommend({ ...base, mode: 'test', timing: 'breakfast', cookedBreakfasts: 2, ideal: { kcal: 450, protein: 15, veg: 50, fiber: 4 } });
  assert.ok(bf.length > 0 && bf.every((r) => r.recipe.cook === 'none' || r.recipe.time <= 3));
  assert.ok(bf.every((r) => r.cost <= 3));

  // 昼食は Mensa も候補になる
  const d = groupByDate(raw)['2026-11-25'];
  const lunch = recommend({ ...base, timing: 'lunch', mensaDay: d, ideal: { kcal: 700, protein: 25, veg: 120, fiber: 6 } }, 20);
  assert.ok(lunch.some((r) => r.recipe.cuisine === 'mensa'));

  // 一度出した候補は除外
  const again = recommend({ ...base, timing: 'dinner', shown: new Set(dinner.map((r) => r.recipe.id)), ideal: { kcal: 650, protein: 25, veg: 120, fiber: 6 } });
  assert.ok(again.every((r) => !dinner.some((x) => x.recipe.id === r.recipe.id)));
});

test('CSV', () => {
  assert.deepEqual(parseCSV('a,"b,c","d""e"\r\n1,2,3'), [['a', 'b,c', 'd"e'], ['1', '2', '3']]);
  assert.deepEqual(parseOptions('100g|150g|200g', '100g').map((o) => o.f), [1, 1.5, 2]);
  assert.deepEqual(parseOptions('1袋|2袋', '1袋').map((o) => o.f), [1, 2]);
  const { items, errors } = parseFoodsCSV(FOOD_TEMPLATE);
  assert.deepEqual(errors, []);
  assert.equal(items.length, 4);
  assert.equal(items[2].kind, 'dish');
  assert.equal(items[2].nutArray, null);
  const imported = itemFromImport(items[2], dishes);
  assert.equal(imported.dishType, 'パスタ');
  assert.ok(imported.nut.kcal > 0);
  const csv = entriesToCSV([E('2026-11-24', 'dinner', { nut: { kcal: 600 } })]);
  assert.ok(csv.split('\r\n')[1].startsWith('2026-11-24,夕食,in Home'));
});

test('カタログと記録', () => {
  const cat = buildCatalog(dishes, foods, []);
  const item = [...cat.values()].find((i) => i.menuName === '和風ツナパスタ');
  const e = entryFromItem({ date: '2026-11-25', timing: 'dinner', group: 'home', item, option: item.options[1] });
  assert.equal(e.amountLabel, '150g');
  assert.equal(e.nut.kcal, Math.round(620 * 1.45));
  assert.equal(entryKey(e), item.key);
  const nd = newDishItem(dishes, 'ラーメン', '味噌ラーメン');
  assert.ok(nd.options.some((o) => o.label === '1袋'));
  const other = newDishItem(dishes, '', '謎の料理');
  assert.equal(other.dishType, 'その他');
});

import { noodleKind, parsePackGrams, optionsFor, itemFromOFF, GRAM_OPTIONS } from '../js/logic/model.js';

test('麺類は個数で量を選ぶ', () => {
  assert.equal(parsePackGrams('5 x 120 g'), 120);
  assert.equal(parsePackGrams('65g'), 65);
  assert.equal(parsePackGrams('', 600), null); // 複数入りの総量は使わない
  assert.equal(noodleKind({ name: 'Shin Ramyun', brands: 'Nongshim' }), 'bag');
  assert.equal(noodleKind({ name: 'Cup Noodles Chicken', brands: 'Nissin' }), 'cup');
  assert.equal(noodleKind({ name: 'Spaghetti', brands: 'Barilla' }), null);
  assert.equal(noodleKind({ name: 'ラーメン' }), 'bag');

  const off = itemFromOFF({ code: '1', product_name: 'Shin Ramyun', brands: 'Nongshim', quantity: '5 x 120 g', product_quantity: 600, nutriments: { 'energy-kcal_100g': 420 } }, 'GoAsia');
  const o = optionsFor(off);
  assert.deepEqual(o.main.map((x) => x.label), ['1/2袋（60g）', '1袋（120g）', '2袋（240g）']);
  assert.equal(o.main[1].f, 1.2);
  assert.ok(o.more.length > 0);

  // 内容量が不明（以前に保存した品目や手入力）なら袋・カップの大きさから選ぶ
  const unknown = optionsFor({ kind: 'product', name: 'ラーメン', options: GRAM_OPTIONS, source: 'user' });
  assert.equal(unknown.main[0].label, '袋麺 1袋（約100g）');
  // 麺類以外・シードはそのまま
  assert.equal(optionsFor({ kind: 'product', name: 'Skyr', options: GRAM_OPTIONS, source: 'off' }).main, GRAM_OPTIONS);
  const cat = buildCatalog(dishes, foods, []);
  const bag = [...cat.values()].find((i) => i.name.startsWith('袋麺'));
  assert.deepEqual(optionsFor(bag).main.map((x) => x.label), ['1/2袋', '1袋', '2袋']);
  assert.ok(bag.alt.includes('ラーメン'));
});

import { queryVariants } from '../js/off.js';

test('日本語の商品検索', () => {
  assert.deepEqual(queryVariants('さとうのごはん'), ['さとうのごはん', 'サトウのごはん', 'サトウノゴハン']);
  assert.deepEqual(queryVariants('サトウのごはん'), ['サトウのごはん', 'さとうのごはん', 'サトウノゴハン']);
  assert.deepEqual(queryVariants('Shin Ramyun'), ['Shin Ramyun']);
  // ローマ字でも内蔵の「サトウのごはん」が候補に出る
  const cat = buildCatalog(dishes, foods, []);
  const cands = [...cat.values()].filter((i) => i.kind === 'product').map((p) => ({ key: p.key, text: p.name, alt: [p.seller, ...(p.alt || [])], item: p }));
  const empty = { counts: new Map(), total: 0 };
  assert.equal(rankCandidates('sato no gohan', cands, empty)[0].text, 'サトウのごはん');
  assert.equal(rankCandidates('さとうのごはん', cands, empty)[0].text, 'サトウのごはん');
});

import { japaneseQuery } from '../js/off.js';

test('日本語の検索式', () => {
  const q = japaneseQuery('さとうのごはん');
  assert.ok(q.includes('"サトウのごはん"') && q.includes('brands:"サトウ食品"'));
});
