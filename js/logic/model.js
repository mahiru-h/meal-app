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

export const stripParen = (s) => String(s || '').replace(/[（(][^）)]*[）)]/g, '').trim();

/** 料理名（カテゴリ）を探す。名前の一致 → 別名を含むか → 「その他」 */
export function findCategory(dishes, text) {
  const q = normalize(text);
  if (q) {
    const exact = dishes.categories.find((c) => normalize(c.name) === q);
    if (exact) return exact;
    const byAlt = dishes.categories.find((c) => c.name !== 'その他' && [c.name, ...(c.alt || [])].some((a) => q.includes(normalize(a))));
    if (byAlt) return byAlt;
  }
  return dishes.categories.find((c) => c.name === 'その他');
}

export const isCategoryName = (dishes, text) => dishes.categories.some((c) => normalize(c.name) === normalize(text));

/**
 * 料理名・献立名の入力から品目を決める（自炊・others の料理）。
 * 1. 既知の献立（概算ではないもの）に一致すればそれ
 * 2. 料理名の欄に献立名（例「ゆで卵」）が入っていれば、その献立
 * 3. それ以外は料理名（別名でも判定）の既定値で新しい献立を作る
 *    料理名の欄がカテゴリ名でない場合（例「目玉焼き」）は、それを献立名として扱う
 */
export function resolveDish(dishes, dishItems, dishType, menuName) {
  const dt = String(dishType || '').trim();
  const mn = String(menuName || '').trim();
  const nm = (x) => normalize(stripParen(x));
  const known = dishItems.filter((d) => !d.estimated && d.menuName);
  if (mn) {
    const same = known.filter((d) => nm(d.menuName) === nm(mn));
    const hit = same.find((d) => !dt || nm(d.dishType) === nm(dt)) || (!dt || !isCategoryName(dishes, dt) ? same[0] : null);
    if (hit) return hit;
    return newDishItem(dishes, isCategoryName(dishes, dt) ? dt : findCategory(dishes, dt || mn).name, mn);
  }
  if (isCategoryName(dishes, dt)) return categoryItem(dishes, dt);
  const asMenu = known.find((d) => nm(d.menuName) === nm(dt));
  if (asMenu) return asMenu;
  return newDishItem(dishes, findCategory(dishes, dt).name, dt);
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
    map.set(key, { key, kind: 'product', name: f.name, seller: f.seller || '', alt: f.alt || [], nut: fromArray(f.per100), options: f.options || GRAM_OPTIONS, base: f.perLabel || '100g', source: 'seed' });
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
  const hasEnergy = n['energy-kcal_100g'] != null || n.energy_100g != null;
  const nut = hasEnergy ? round(fromArray([kcal, num(n.proteins_100g), num(n.fat_100g), num(n.carbohydrates_100g), num(n.fiber_100g), 0, num(n.salt_100g)])) : null;
  const options = [...GRAM_OPTIONS];
  const serving = Number(p.serving_quantity);
  if (serving > 0) options.unshift({ label: `1食分（${serving}g）`, f: serving / 100 });
  const pack = Number(p.product_quantity);
  if (pack > 0 && pack !== serving && pack <= 1000) options.push({ label: `1パック（${pack}g）`, f: pack / 100 });
  const name = (p.product_name_de || p.product_name || p.product_name_en || p.product_name_ja || '').trim();
  const seller = (sellerInput || (p.brands || '').split(',')[0] || '').trim();
  return {
    key: productKey(name, seller), kind: 'product', name, seller, nut, options, base: '100g', source: 'off', offCode: p.code, brands: p.brands || '',
    categories: (p.categories_tags || []).join(' '),
    packG: parsePackGrams(p.quantity, p.product_quantity),
  };
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

/* ---------- 麺類（袋麺・カップ麺・うどん）は個数で選ぶ ---------- */

const NOODLE_RE = /ramen|ラーメン|らーめん|ramyun|ramyeon|instant|yakisoba|焼きそば|udon|うどん|soba|そば|pho|\bmie\b|cup ?noodle|カップ|袋麺|nissin|indomie|nongshim|samyang|buldak|yum ?yum|mama|nudelsuppe|noodle|asia ?nudel|instant-noodles/i;
const PASTA_RE = /spaghetti|penne|fusilli|farfalle|lasagne|tagliatelle|linguine|maccheroni|makkaroni|bandnudeln|spätzle|pasta|パスタ|スパゲッティ/i;

/** 麺類の形: 'bag'（袋）| 'cup'（カップ）| 'tama'（玉）| null（麺類ではない） */
export function noodleKind(item) {
  const text = [item.name, item.brands, item.categories].filter(Boolean).join(' ');
  if (PASTA_RE.test(text) && !/instant|ramen|asia|cup/i.test(text)) return null;
  if (!NOODLE_RE.test(text)) return null;
  if (/udon|うどん/i.test(text) && !/instant|cup|カップ/i.test(text)) return 'tama';
  if (/\bcup\b|becher|bowl|カップ|cup-noodles|\btopf\b/i.test(text)) return 'cup';
  return 'bag';
}

/**
 * 1 個（1 袋）あたりのグラム数。不明なら null。
 * "5 x 120 g" → 120、"120 g" → 120、product_quantity のみ → その値（250 g 超は複数入りとみなして不明）
 */
export function parsePackGrams(quantity, productQuantity) {
  const q = String(quantity || '').replace(',', '.');
  let m = q.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*g\b/i);
  if (m) return Math.round(Number(m[2]));
  m = q.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  const g = m ? Number(m[1]) : Number(productQuantity);
  return g > 0 && g <= 250 ? Math.round(g) : null;
}

// 内容量がわからないときの目安（栄養は 100 g あたりなので f = グラム / 100）
export const NOODLE_DEFAULTS = {
  bag: [
    { label: '袋麺 1袋（約100g）', f: 1 },
    { label: '袋麺 2袋（約200g）', f: 2 },
    { label: 'カップ ミニ（約40g）', f: 0.4 },
    { label: 'カップ 普通（約75g）', f: 0.75 },
    { label: 'カップ ビッグ（約100g）', f: 1 },
  ],
  cup: [
    { label: 'カップ ミニ（約40g）', f: 0.4 },
    { label: 'カップ 普通（約75g）', f: 0.75 },
    { label: 'カップ ビッグ（約100g）', f: 1 },
    { label: '袋麺 1袋（約100g）', f: 1 },
  ],
  tama: [
    { label: '1玉（約200g）', f: 2 },
    { label: '2玉（約400g）', f: 4 },
  ],
};

const fmtCount = (n) => (n === 0.5 ? '1/2' : String(n));

/**
 * 量の選択肢。main を大きなボタンで、more は「グラムで選ぶ」に表示する。
 * シードや CSV 取り込みの品目は、そこで決めた選択肢をそのまま使う。
 */
export function optionsFor(item) {
  const own = item.options && item.options.length ? item.options : GRAM_OPTIONS;
  if (item.kind !== 'product' || item.source === 'seed' || item.source === 'import') return { main: own, more: [] };
  const kind = noodleKind(item);
  if (!kind) return { main: own, more: [] };
  const g = item.packG;
  const unit = { bag: '袋', cup: '個', tama: '玉' }[kind];
  const main = g
    ? (kind === 'bag' ? [0.5, 1, 2] : [1, 2]).map((n) => ({ label: `${fmtCount(n)}${unit}（${Math.round(g * n)}g）`, f: Math.round(g * n) / 100 }))
    : NOODLE_DEFAULTS[kind];
  return { main, more: GRAM_OPTIONS };
}
