// 品目（カタログ）と記録の生成（純粋関数のみ）
import { normalize } from './suggest.js';
import { fromArray, scale, round, JUICE, estimateMensaMain, estimateMensaSide } from './nutrition.js';

export const productKey = (name, seller) => `p:${normalize(name)}|${normalize(seller)}`;
export const dishKey = (dishType, menuName) => `d:${normalize(dishType)}|${normalize(menuName)}`;

export const GRAM_OPTIONS = [
  { label: '50g', f: 0.5 },
  { label: '100g', f: 1 },
  { label: '150g', f: 1.5 },
  { label: '200g', f: 2 },
];

/** 料理名（カテゴリ）を探す。なければ「その他」 */
export function findCategory(dishes, dishType) {
  const q = normalize(dishType);
  return (
    dishes.categories.find((c) => normalize(c.name) === q) ||
    dishes.categories.find((c) => q && normalize(c.name).includes(q)) ||
    dishes.categories.find((c) => c.name === 'その他')
  );
}

/** シードデータ + 端末に保存した品目 → key → item の Map */
export function buildCatalog(dishes, foods, saved = []) {
  const map = new Map();
  for (const c of dishes.categories) {
    const options = dishes.optionSets[c.options] || dishes.optionSets.portion;
    for (const m of c.menus) {
      const key = dishKey(c.name, m.name);
      map.set(key, { key, kind: 'dish', dishType: c.name, menuName: m.name, name: m.name, nut: fromArray(m.nut), options, base: options.find((o) => o.f === 1)?.label || '1人前', source: 'seed' });
    }
  }
  for (const f of foods.items) {
    const key = productKey(f.name, f.seller);
    map.set(key, { key, kind: 'product', name: f.name, seller: f.seller || '', nut: fromArray(f.per100), options: f.options || GRAM_OPTIONS, base: f.perLabel || '100g', source: 'seed' });
  }
  for (const it of saved) map.set(it.key, it);
  return map;
}

/** 新しい献立（表にないもの）を料理名の既定値で作る */
export function newDishItem(dishes, dishType, menuName) {
  const c = findCategory(dishes, dishType);
  const options = dishes.optionSets[c.options] || dishes.optionSets.portion;
  const type = dishType || c.name;
  return {
    key: dishKey(type, menuName),
    kind: 'dish',
    dishType: type,
    menuName,
    name: menuName || type,
    nut: fromArray(c.nut),
    options,
    base: options.find((o) => o.f === 1)?.label || '1人前',
    source: 'user',
    estimated: true,
  };
}

/** 料理名だけで献立名がない場合 */
export function categoryItem(dishes, dishType) {
  return newDishItem(dishes, dishType, '');
}

/** CSV から読み込んだ行 → 品目 */
export function itemFromImport(row, dishes) {
  if (row.kind === 'dish') {
    const base = newDishItem(dishes, row.dishType, row.menuName);
    return {
      ...base,
      nut: row.nutArray ? fromArray(row.nutArray) : base.nut,
      options: row.options.length ? row.options : base.options,
      base: row.base || base.base,
      source: 'import',
      estimated: !row.nutArray,
    };
  }
  return {
    key: productKey(row.name, row.seller),
    kind: 'product',
    name: row.name,
    seller: row.seller || '',
    nut: row.nutArray ? fromArray(row.nutArray) : null,
    options: row.options.length ? row.options : GRAM_OPTIONS,
    base: row.base || '100g',
    source: 'import',
  };
}

/** Open Food Facts の商品 → 品目（栄養は 100 g あたり） */
export function itemFromOFF(p, sellerInput) {
  const n = p.nutriments || {};
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const kcal = n['energy-kcal_100g'] != null ? num(n['energy-kcal_100g']) : num(n.energy_100g) / 4.184;
  const nut = round(fromArray([kcal, num(n.proteins_100g), num(n.fat_100g), num(n.carbohydrates_100g), num(n.fiber_100g), 0, num(n.salt_100g)]));
  const options = [...GRAM_OPTIONS];
  const serving = Number(p.serving_quantity);
  if (serving > 0) options.unshift({ label: `1食分（${serving}g）`, f: serving / 100 });
  const pack = Number(p.product_quantity);
  if (pack > 0 && pack !== serving && pack <= 1000) options.push({ label: `1パック（${pack}g）`, f: pack / 100 });
  const name = (p.product_name_de || p.product_name || p.product_name_en || '').trim();
  const seller = (sellerInput || (p.brands || '').split(',')[0] || '').trim();
  return { key: productKey(name, seller), kind: 'product', name, seller, nut, options, base: '100g', source: 'off', offCode: p.code, brands: p.brands || '' };
}

let counter = 0;
export const newId = () => `${Date.now().toString(36)}${(counter++ % 1296).toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;

/** 品目と量の選択から記録を作る */
export function entryFromItem({ date, timing, group, item, option }) {
  const f = option?.f ?? 1;
  const isDish = item.kind === 'dish';
  return {
    id: newId(),
    date,
    timing,
    group,
    type: isDish ? 'dish' : 'product',
    product: isDish ? '' : item.name,
    seller: isDish ? '' : item.seller || '',
    dishType: isDish ? item.dishType : '',
    menuName: isDish ? item.menuName : '',
    name: isDish ? item.menuName || item.dishType : item.name,
    itemKey: item.key,
    amountLabel: option?.label || item.base || '',
    factor: f,
    nut: item.nut ? round(scale(item.nut, f)) : null,
    status: item.nut ? 'ok' : 'nutrition-missing',
    createdAt: Date.now(),
  };
}

/** Mensa の選択 → 記録 */
export function mensaEntries({ date, mains = [], sides = [], juice = false, auto = false }) {
  const base = { date, timing: 'lunch', group: 'mensa', createdAt: Date.now(), status: auto ? 'auto' : 'ok' };
  const out = [];
  if (juice) out.push({ ...base, id: newId(), type: 'juice', name: JUICE.name, itemKey: JUICE.key, amountLabel: '0.5 L', price: JUICE.price, nut: JUICE.nut });
  for (const m of mains) {
    out.push({ ...base, id: newId(), type: 'mensa', name: m.name, detail: (m.with || []).join(', '), itemKey: `mensa:${normalize(m.name)}`, amountLabel: '1皿', price: m.price, nut: estimateMensaMain(m), mensaId: m.id });
  }
  for (const s of sides) {
    const name = typeof s === 'string' ? s : s.name;
    out.push({ ...base, id: newId(), type: 'side', name: name || '付け合わせ', itemKey: `mensa-side:${normalize(name)}`, amountLabel: '1皿', price: s.price ?? 0.8, nut: estimateMensaSide(name || '') });
  }
  return out;
}

export function pendingMensaEntry(date, price) {
  return { id: newId(), date, timing: 'lunch', group: 'mensa', type: 'pending', name: `Mensa（€${Number(price).toFixed(2)}・照合待ち）`, price: Number(price), nut: null, status: 'pending', createdAt: Date.now() };
}
