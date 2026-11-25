// 栄養計算（純粋関数のみ）

export const NUTRIENTS = [
  { key: 'kcal', label: 'エネルギー', unit: 'kcal', digits: 0 },
  { key: 'protein', label: 'たんぱく質', unit: 'g', digits: 0 },
  { key: 'fat', label: '脂質', unit: 'g', digits: 0 },
  { key: 'carbs', label: '炭水化物', unit: 'g', digits: 0 },
  { key: 'fiber', label: '食物繊維', unit: 'g', digits: 1 },
  { key: 'veg', label: '野菜', unit: 'g', digits: 0 },
  { key: 'salt', label: '塩分', unit: 'g', digits: 1 },
];
const KEYS = NUTRIENTS.map((n) => n.key);

export const zero = () => Object.fromEntries(KEYS.map((k) => [k, 0]));

/** [kcal, P, F, C, 食物繊維, 野菜g, 塩分] の配列 → オブジェクト */
export function fromArray(a) {
  return Object.fromEntries(KEYS.map((k, i) => [k, Number(a?.[i]) || 0]));
}

export function add(a, b) {
  const r = zero();
  for (const k of KEYS) r[k] = (a?.[k] || 0) + (b?.[k] || 0);
  return r;
}

export function scale(n, f) {
  const r = zero();
  for (const k of KEYS) r[k] = (n?.[k] || 0) * f;
  return r;
}

export function sumEntries(entries) {
  return entries.reduce((acc, e) => (e.nut ? add(acc, e.nut) : acc), zero());
}

/** 端数をそろえる（保存・表示用） */
export function round(n) {
  const r = {};
  for (const { key, digits } of NUTRIENTS) {
    const p = 10 ** digits;
    r[key] = Math.round((n?.[key] || 0) * p) / p;
  }
  return r;
}

export const MODES = {
  healthy: { label: '健康モード（野菜多め）' },
  test: { label: 'テスト期間モード（時短・節約）' },
  muscle: { label: '体型目標: 筋肉増量（準備中）', body: true },
  fatloss: { label: '体型目標: 体重減少・脂質制限（準備中）', body: true },
  lowcarb: { label: '体型目標: 糖質制限（準備中）', body: true },
};

/**
 * 1 日の目標値。範囲のあるものは [下限, 上限]。
 * 既定は日本人の食事摂取基準（2025 年版）の目標量の割合を使用。
 */
export function dailyTargets(settings) {
  const kcalBase = Number(settings?.kcal) || 1950;
  const weight = Number(settings?.weight) || 50;
  const mode = settings?.mode || 'healthy';
  let kcal = kcalBase;
  let p = [0.13, 0.2];
  let f = [0.2, 0.3];
  let c = [0.5, 0.65];
  if (mode === 'muscle') {
    kcal = kcalBase + 200;
    p = [Math.max(0.16, (1.6 * weight * 4) / kcal), 0.25];
  } else if (mode === 'fatloss') {
    kcal = kcalBase - 300;
    f = [0.15, 0.22];
    p = [0.18, 0.25];
  } else if (mode === 'lowcarb') {
    c = [0.4, 0.5];
    p = [0.18, 0.25];
    f = [0.25, 0.35];
  }
  return {
    kcal,
    protein: [Math.round((kcal * p[0]) / 4), Math.round((kcal * p[1]) / 4)],
    fat: [Math.round((kcal * f[0]) / 9), Math.round((kcal * f[1]) / 9)],
    carbs: [Math.round((kcal * c[0]) / 4), Math.round((kcal * c[1]) / 4)],
    fiber: [18, Infinity],
    veg: [350, Infinity],
    salt: [0, 6.5],
  };
}

/** 目標値に対する状態: 'low' | 'ok' | 'high' */
export function status(key, value, targets) {
  const t = targets[key];
  if (key === 'kcal') {
    if (value < t * 0.85) return 'low';
    if (value > t * 1.1) return 'high';
    return 'ok';
  }
  const [lo, hi] = t;
  if (value < lo) return 'low';
  if (value > hi) return 'high';
  return 'ok';
}

/** 目標の代表値（バー表示・比較用） */
export function targetMid(key, targets) {
  const t = targets[key];
  if (typeof t === 'number') return t;
  if (t[1] === Infinity) return t[0];
  if (t[0] === 0) return t[1];
  return (t[0] + t[1]) / 2;
}

// 1 日の中での配分の目安
export const MEAL_SHARE = { breakfast: 0.25, lunch: 0.35, dinner: 0.32, snack: 0.08 };

/* ---------- Mensa の概算 ---------- */

export const JUICE = {
  key: 'mensa:juice:miomio-orange',
  name: 'MIO MIO ORANGE',
  price: 1.75,
  note: '€1.60 + Pfand €0.15・0.5 L',
  // 0.5 L: 30 kcal / 100 ml、炭水化物 6.9 g / 100 ml
  nut: fromArray([150, 0, 0, 34.5, 0, 0, 0]),
};

const MENSA_BASE = {
  101: [700, 26, 22, 90, 6, 100, 3.0], // Menü 1
  102: [720, 30, 22, 88, 5, 100, 3.0], // Menü 2
  103: [520, 15, 14, 80, 6, 80, 2.6], // Tagesgericht
  104: [650, 20, 20, 88, 7, 120, 2.8], // vegetarisches Menü
  108: [850, 30, 35, 95, 7, 100, 3.5], // Spezialwerk
};

export function estimateMensaMain(item) {
  const n = fromArray(MENSA_BASE[item.catNo] || [700, 25, 22, 90, 6, 100, 3.0]);
  const text = [item.name, ...(item.with || [])].join(' ').toLowerCase();
  const tags = item.tags || [];
  if (item.salad) {
    n.kcal += 60; n.fat += 5; n.veg += 80; n.fiber += 1.5;
  }
  if (/fries|chips/.test(text)) { n.kcal += 150; n.fat += 9; }
  if (/stew|soup/.test(text)) { n.kcal -= 80; n.veg += 40; }
  if (/salad bowl|bowl/.test(text)) { n.veg += 60; }
  if (tags.includes('N')) { n.protein -= 6; n.fat -= 4; n.fiber += 2; }
  if (tags.includes('G')) { n.protein += 4; n.fat -= 3; }
  if (tags.includes('R') || tags.includes('S')) { n.kcal += 60; n.fat += 6; n.protein += 3; }
  if (tags.includes('F')) { n.protein += 4; }
  for (const k of Object.keys(n)) n[k] = Math.max(0, n[k]);
  return round(n);
}

const SIDE_TABLE = [
  [/fries|wedges/, [300, 4, 15, 38, 3, 0, 0.8]],
  [/rice|ebly|couscous|bulgur/, [200, 4, 2, 42, 1, 10, 0.5]],
  [/noodle|pasta|spaghetti|spätzle/, [220, 7, 2, 43, 2, 0, 0.4]],
  [/soup/, [90, 2, 4, 10, 2, 80, 1.2]],
  [/salad|coleslaw/, [90, 1, 6, 7, 2, 100, 0.6]],
  [/fruit|apple|banana|orange/, [70, 1, 0, 16, 2, 0, 0]],
  [/potato|dumpling/, [150, 3, 1, 30, 3, 0, 0.3]],
  [/vegetable|ratatouille|beans|carrot|broccoli|cabbage|spinach|peas/, [80, 2, 4, 8, 3, 120, 0.6]],
  [/dessert|pudding|yoghurt|yogurt|quark|cake/, [150, 4, 4, 24, 0, 0, 0.1]],
];

export function estimateMensaSide(name) {
  const t = String(name).toLowerCase();
  for (const [re, a] of SIDE_TABLE) if (re.test(t)) return fromArray(a);
  return fromArray([150, 3, 5, 20, 2, 50, 0.6]);
}
