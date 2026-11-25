// おすすめの採点（純粋関数のみ）
import { fromArray, MEAL_SHARE, targetMid, estimateMensaMain } from './nutrition.js';
import { mainsForDay } from './mensa.js';

const MAIN_TIMINGS = ['breakfast', 'lunch', 'dinner'];

export function recipeCost(r, area) {
  const k = area === 'jp' ? 'jp' : 'de';
  if (typeof r.cost === 'number') return r.cost;
  return (r.ingredients || []).reduce((s, i) => s + (Number(i[k]) || 0), 0);
}

/** Mensa の主菜をレシピと同じ形に変換 */
export function mensaAsRecipes(day) {
  return mainsForDay(day).map((m) => {
    const text = [m.name, ...(m.with || [])].join(' ').toLowerCase();
    const tags = ['warm', 'mensa'];
    if (/noodle|pasta|spaghetti|spätzle|ramen/.test(text)) tags.push('noodle', 'pasta');
    if (/rice/.test(text)) tags.push('rice');
    if (/soup|stew/.test(text)) tags.push('soup');
    if (/chicken|beef|pork|turkey|meat|sausage|rissole|schnitzel/.test(text)) tags.push('meat');
    if (/fish|salmon|pollock|cod/.test(text)) tags.push('fish');
    if (m.salad) tags.push('light');
    return {
      id: `mensa-${m.id}`,
      name: `Mensa: ${m.name}`,
      sub: (m.with || []).join(', '),
      cuisine: 'mensa',
      timings: ['lunch'],
      time: 0,
      cook: 'none',
      tags,
      cost: m.price,
      nutObj: estimateMensaMain(m),
      mensa: m,
      ingredients: [],
    };
  });
}

const nutOf = (r) => r.nutObj || fromArray(r.nut);

/**
 * 気分（理由）の条件
 * filter: 満たさないものを除外、bonus: 加点
 */
const MOOD_RULES = {
  heavy: { filter: (r, n) => n.kcal <= 600 && n.fat <= 22 },
  light: { bonus: (r) => (r.tags.includes('light') ? 2 : -0.5) },
  noodle: { filter: (r) => r.tags.includes('noodle') },
  rice: { filter: (r) => r.tags.includes('rice') },
  bread: { filter: (r) => r.tags.includes('bread') },
  warm: { filter: (r) => !r.tags.includes('cold') },
  cold: { filter: (r) => r.tags.includes('cold') },
  quick: { filter: (r) => r.time <= 10 },
  nocook: { filter: (r) => r.cook === 'none' || r.cook === 'microwave' },
  cheap: { filter: (r, n, cost) => cost <= 2.5 },
  meat: { filter: (r) => r.tags.includes('meat') },
  fish: { filter: (r) => r.tags.includes('fish') },
  veggie: { filter: (r, n) => n.veg >= 150 },
  norice: { filter: (r) => !r.needsRice },
};

/** 次の食事タイミング（時刻から推定） */
export function nextTiming(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 10) return 'breakfast';
  if (h < 14.5) return 'lunch';
  if (h < 21.5) return 'dinner';
  return 'snack';
}

/**
 * その食事で目安とする量
 * 当日の残り（目標 − 摂取済み）を、まだ食べていない食事で按分する
 */
export function mealIdeal(timing, targets, todayTotal, eatenTimings) {
  if (timing === 'snack') {
    return { kcal: targets.kcal * MEAL_SHARE.snack, protein: 8, veg: 0 };
  }
  const idx = MAIN_TIMINGS.indexOf(timing);
  const remaining = MAIN_TIMINGS.filter((t, i) => i >= idx && (t === timing || !eatenTimings.has(t)));
  const shareSum = remaining.reduce((s, t) => s + MEAL_SHARE[t], 0) || 1;
  const w = MEAL_SHARE[timing] / shareSum;
  const ideal = {};
  for (const k of ['kcal', 'protein', 'veg', 'fiber']) {
    const t = targetMid(k, targets);
    const left = Math.max(t * MEAL_SHARE[timing] * 0.6, t - (todayTotal[k] || 0));
    ideal[k] = left * w;
  }
  ideal.kcal = Math.min(Math.max(ideal.kcal, 300), 1100);
  return ideal;
}

/**
 * 不足・過剰の度合い（直近 3 日の 1 日平均 vs 目標）
 * 正の値 = 不足、負の値 = 過剰
 */
export function deficits(avg3d, targets) {
  const d = {};
  for (const k of ['protein', 'veg', 'fiber']) {
    const t = targetMid(k, targets);
    d[k] = Math.max(-1, Math.min(1, (t - (avg3d[k] || 0)) / t));
  }
  d.salt = Math.max(0, ((avg3d.salt || 0) - targets.salt[1]) / targets.salt[1]);
  d.fat = Math.max(0, ((avg3d.fat || 0) - targets.fat[1]) / targets.fat[1]);
  return d;
}

/**
 * 1 件を採点する。除外の場合は null。
 * @param {object} r レシピ
 * @param {object} ctx recommend() と同じ
 */
export function scoreRecipe(r, ctx) {
  const { timing, prefs, mode, excluded = [], moods = [], ideal, def, recentNames = new Set(), cookedBreakfasts = 0 } = ctx;
  const area = prefs.area || 'de';
  const n = nutOf(r);
  const cost = recipeCost(r, area);
  const reasons = [];

  if (!r.timings.includes(timing)) return null;
  if (r.areas && !r.areas.includes(area)) return null;
  if ((r.contains || []).some((c) => excluded.includes(c))) return null;
  for (const m of moods) {
    const rule = MOOD_RULES[m];
    if (rule?.filter && !rule.filter(r, n, cost)) return null;
  }

  // モードの制約
  if (mode === 'test') {
    if (timing === 'breakfast') {
      if (cost > 3) return null;
      const cooking = !(r.cook === 'none' || (r.cook === 'microwave' && r.time <= 3));
      if (cooking && (cookedBreakfasts >= 2 || r.time > 10)) return null;
    } else if (timing !== 'snack') {
      if (r.time > 30 || cost > 5) return null;
    }
  }

  let score = 0;

  // エネルギーが目安に近いほど高い
  const kcalGap = Math.abs(n.kcal - ideal.kcal) / ideal.kcal;
  score += 3 * (1 - Math.min(kcalGap, 1.5));
  if (kcalGap < 0.2 && timing !== 'snack') reasons.push(`エネルギーが目安（約 ${Math.round(ideal.kcal)} kcal）に近い`);

  // 不足しがちな栄養素を補う
  const vegW = mode === 'healthy' ? 3 : 2;
  if (def.veg > 0.1 && timing !== 'snack') {
    const s = def.veg * Math.min(n.veg / 150, 1.6) * vegW;
    score += s;
    if (n.veg >= 150) reasons.push('直近 3 日で不足気味の野菜を補える');
  }
  if (def.protein > 0.1) {
    const s = def.protein * Math.min(n.protein / Math.max(ideal.protein, 10), 1.5) * 2;
    score += s;
    if (n.protein >= ideal.protein) reasons.push('たんぱく質を補える');
  }
  if (def.fiber > 0.1) score += def.fiber * Math.min(n.fiber / 6, 1.5);
  if (def.salt > 0) {
    score -= def.salt * (n.salt / 2) * 2;
    if (n.salt <= 2) reasons.push('塩分控えめ（直近 3 日で塩分多め）');
  }
  if (def.fat > 0) score -= def.fat * (n.fat / 20) * 2;

  // 好み
  if ((prefs.cuisines || []).includes(r.cuisine)) score += 1.5;
  const likeHit = (prefs.likes || []).filter((t) => r.tags.includes(t));
  const wantHit = (prefs.wants || []).filter((t) => r.tags.includes(t));
  score += likeHit.length * 1.0 + wantHit.length * 2.0;
  if (wantHit.length) reasons.unshift('今日食べたい物に合う');
  else if (likeHit.length) reasons.unshift('好きな食べ物');

  // モードの加点
  if (mode === 'test') {
    if (r.tags.includes('simple')) score += 1.5;
    score -= cost * 0.3 + r.time * 0.03;
  }
  if (r.cuisine === 'mensa') score += 0.5; // 昼に Mensa がある日は手間がかからない

  // 気分の加点
  for (const m of moods) score += MOOD_RULES[m]?.bonus?.(r, n, cost) || 0;

  // 直近 3 日に食べたものは下げる
  if (recentNames.has(r.name)) score -= 2.5;

  return { recipe: r, score, cost, nut: n, reasons: reasons.slice(0, 3) };
}

/**
 * 上位 k 件を返す（似たものが並ばないよう、同じ主食・同じ料理名は減点しながら選ぶ）
 * @param {object} ctx { recipes, timing, prefs, mode, excluded, moods, ideal, def, recentNames, cookedBreakfasts, shown: Set, mensaDay }
 */
export function recommend(ctx, k = 3) {
  let pool = ctx.recipes;
  if (ctx.timing === 'lunch' && ctx.mensaDay && (ctx.prefs.area || 'de') === 'de') pool = [...pool, ...mensaAsRecipes(ctx.mensaDay)];
  const shown = ctx.shown || new Set();
  const scored = pool
    .filter((r) => !shown.has(r.id))
    .map((r) => scoreRecipe(r, ctx))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const picked = [];
  const staple = (r) => (r.tags.includes('noodle') ? 'noodle' : r.tags.includes('rice') ? 'rice' : r.tags.includes('bread') ? 'bread' : 'other');
  while (picked.length < k && scored.length) {
    for (const s of scored) {
      s.adj = s.score;
      for (const p of picked) {
        if (staple(p.recipe) === staple(s.recipe)) s.adj -= 0.8;
        if (p.recipe.dishType && p.recipe.dishType === s.recipe.dishType) s.adj -= 1.5;
        if (p.recipe.cuisine === 'mensa' && s.recipe.cuisine === 'mensa') s.adj -= 1.5;
      }
    }
    scored.sort((a, b) => b.adj - a.adj);
    picked.push(scored.shift());
  }
  return picked;
}
