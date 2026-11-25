// おすすめの食事
import { h, mount, go, header, toast } from '../ui.js';
import { state, entriesOn, addEntries, saveItem, getActivePrefs } from '../store.js';
import { toKey, addDays, isoWeek, isWeekend } from '../logic/dates.js';
import { TIMINGS, MOODS, CUISINES, AREAS, FOODS, timingLabel } from '../logic/prefs.js';
import { sumEntries, dailyTargets, scale, zero, MODES } from '../logic/nutrition.js';
import { recommend, nextTiming, mealIdeal, deficits } from '../logic/recommend.js';
import { dishKey, newId } from '../logic/model.js';
import { getMensaDay } from '../sync.js';
import { fmtPrice } from '../logic/mensa.js';

const NO_COOK_TYPES = new Set(['シリアル・ヨーグルト', 'パン', 'その他', 'サラダ']);
const session = { timing: null, shown: new Set(), moods: [], key: '' };

function context(timing) {
  const today = toKey(new Date());
  const todayEntries = entriesOn(today);
  const todayTotal = sumEntries(todayEntries);
  const eaten = new Set(todayEntries.map((e) => e.timing));
  // 直近 3 日（記録のある日だけで平均）
  let sum = zero();
  let daysWith = 0;
  const recentNames = new Set();
  for (let i = 1; i <= 3; i++) {
    const es = entriesOn(addDays(today, -i));
    if (es.length) { sum = sumEntries([{ nut: sum }, ...es]); daysWith++; }
    for (const e of es) recentNames.add(e.menuName || e.name);
  }
  for (const e of todayEntries) recentNames.add(e.menuName || e.name);
  const targets = dailyTargets(state.settings);
  const avg = daysWith ? scale(sum, 1 / daysWith) : null;
  const def = avg ? deficits(avg, targets) : { protein: 0, veg: 0, fiber: 0, salt: 0, fat: 0 };
  // 今週、朝食で調理した日数（テスト期間モード用）
  const week = isoWeek(today);
  const cookedDays = new Set(state.entries
    .filter((e) => e.timing === 'breakfast' && e.type === 'dish' && isoWeek(e.date) === week && !NO_COOK_TYPES.has(e.dishType))
    .map((e) => e.date));
  return { today, targets, todayTotal, eaten, avg, def, recentNames, cookedBreakfasts: cookedDays.size, ideal: mealIdeal(timing, targets, todayTotal, eaten) };
}

export async function render(root) {
  const { prefs, fromTemplate } = await getActivePrefs();
  const key = JSON.stringify([toKey(new Date()), prefs, state.settings.mode]);
  if (session.key !== key) Object.assign(session, { key, shown: new Set(), moods: [], timing: null });
  session.timing ||= nextTiming();
  const timing = session.timing;
  const ctx = context(timing);
  const mensaDay = timing === 'lunch' && !isWeekend(ctx.today) ? await getMensaDay(ctx.today) : null;

  const results = recommend({
    recipes: state.recipes, timing, prefs, mode: state.settings.mode, excluded: state.settings.excluded,
    moods: session.moods, ideal: ctx.ideal, def: ctx.def, recentNames: ctx.recentNames,
    cookedBreakfasts: ctx.cookedBreakfasts, shown: session.shown, mensaDay,
  });

  const recordRecipe = async (r) => {
    if (r.recipe.mensa) return go(`#/mensa/${ctx.today}`);
    const nut = r.nut;
    const item = { key: dishKey(r.recipe.dishType, r.recipe.name), kind: 'dish', dishType: r.recipe.dishType, menuName: r.recipe.name, name: r.recipe.name, nut, options: state.dishes.optionSets.portion, base: '1人前', source: 'recipe', lastOption: '1人前' };
    await saveItem(item);
    await addEntries([{ id: newId(), date: ctx.today, timing, group: 'home', type: 'dish', product: '', seller: '', dishType: item.dishType, menuName: item.menuName, name: item.name, itemKey: item.key, amountLabel: '1人前', factor: 1, nut, status: 'ok', createdAt: Date.now() }]);
    toast(`今日の${timingLabel(timing)}に記録しました`);
    go('#/');
  };

  const area = prefs.area || 'de';
  const card = (r, i) => h('section', { class: 'card rec' },
    h('div', { class: 'row between' },
      h('h2', null, `${i + 1}. ${r.recipe.name}`)),
    r.recipe.sub ? h('div', { class: 'small muted' }, r.recipe.sub) : null,
    h('div', { class: 'rec-meta' },
      h('span', null, r.recipe.cuisine === 'mensa' ? 'Mensa' : `${r.recipe.time} 分`),
      h('span', null, area === 'jp' && r.recipe.cuisine !== 'mensa' ? `約 ${Math.round(r.cost)} 円` : `約 ${fmtPrice(r.cost)}`),
      h('span', null, `${Math.round(r.nut.kcal)} kcal`),
      h('span', null, `P ${Math.round(r.nut.protein)}g`),
      h('span', null, `野菜 ${Math.round(r.nut.veg)}g`),
      h('span', null, `塩 ${r.nut.salt.toFixed(1)}g`)),
    r.recipe.ingredients.length
      ? h('ul', { class: 'ingredients' }, r.recipe.ingredients.map((g) => h('li', null, g.n, area === 'de' && g.shop ? h('span', { class: 'shop' }, g.shop) : null)))
      : null,
    r.recipe.needsRice ? h('p', { class: 'small muted' }, '※ 前日までに電子レンジでご飯を炊いておく必要があります') : null,
    r.reasons.length ? h('p', { class: 'small reasons' }, r.reasons.join(' / ')) : null,
    h('button', { class: 'btn small', onclick: () => recordRecipe(r) }, r.recipe.mensa ? 'Mensa の記録へ' : 'これを食べたので記録'));

  const moodPanel = h('section', { class: 'card', hidden: true },
    h('h2', null, 'どんな気分ですか？（複数可）'),
    h('div', { class: 'chips' }, MOODS.map((m) => {
      const b = h('button', { class: `chip${session.moods.includes(m.id) ? ' on' : ''}`, onclick: () => b.classList.toggle('on') }, m.label);
      b.dataset.id = m.id;
      return b;
    })),
    h('button', {
      class: 'btn primary wide',
      onclick: () => {
        for (const r of results) session.shown.add(r.recipe.id);
        session.moods = [...moodPanel.querySelectorAll('.chip.on')].map((b) => b.dataset.id);
        render(root);
      },
    }, '別の候補を出す'));

  const label = (list, id) => list.find((x) => x.id === id)?.label || id;
  mount(root, 
    header('おすすめの食事'),
    h('section', { class: 'card' },
      h('div', { class: 'row between' },
        h('div', { class: 'small' },
          h('div', null, fromTemplate ? '好み: テンプレートのまま' : '好み: 今日だけ変更中'),
          h('div', { class: 'muted' }, `${label(AREAS, area)}・${(prefs.cuisines || []).map((c) => label(CUISINES, c)).join('/') || '味付け指定なし'}・食べたい物: ${(prefs.wants || []).map((c) => label(FOODS, c)).join('/') || 'なし'}`),
          h('div', { class: 'muted' }, MODES[state.settings.mode]?.label)),
        h('button', { class: 'btn small ghost', onclick: () => go('#/prefs') }, '好みを変える')),
      h('div', { class: 'chips' }, TIMINGS.map((t) => h('button', {
        class: `chip${t.id === timing ? ' on' : ''}`,
        onclick: () => { session.timing = t.id; session.shown = new Set(); session.moods = []; render(root); },
      }, t.label)))),
    session.moods.length ? h('p', { class: 'pad small muted' }, `気分: ${session.moods.map((m) => label(MOODS, m)).join('、')}`) : null,
    ctx.avg ? null : h('p', { class: 'pad small muted' }, '直近 3 日の記録がないため、栄養の不足は考慮していません。'),
    results.length
      ? results.map(card)
      : h('section', { class: 'card' }, h('p', null, '条件に合う候補がありません。'), h('button', { class: 'btn', onclick: () => { session.shown = new Set(); session.moods = []; render(root); } }, '条件をリセット')),
    h('div', { class: 'pad' }, h('button', { class: 'btn wide', onclick: () => { moodPanel.hidden = !moodPanel.hidden; moodPanel.scrollIntoView({ behavior: 'smooth' }); } }, '気分じゃない')),
    moodPanel,
  );
}
