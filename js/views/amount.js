// 量の選択 → 記録
import { h, mount, go, header, fmtDate, nav, toast } from '../ui.js';
import { state, addEntries, saveItem, updateEntry } from '../store.js';
import { timingLabel } from '../logic/prefs.js';
import { entryFromItem } from '../logic/model.js';
import { NUTRIENTS } from '../logic/nutrition.js';
import { searchProducts } from '../off.js';
import { itemFromOFF, productKey, GRAM_OPTIONS } from '../logic/model.js';

export function render(root, { date, timing, group }) {
  const item = nav.state.item;
  if (!item) return go(`#/entry/${date}/${timing}/${group}`);
  const editing = nav.state.editEntry || null; // 既存の記録の量を変更する場合

  const save = async (option) => {
    if (editing) {
      const fresh = entryFromItem({ date: editing.date, timing: editing.timing, group: editing.group, item, option });
      await updateEntry({ ...editing, ...fresh, id: editing.id, createdAt: editing.createdAt });
      if (item.source !== 'seed') await saveItem({ ...item, lastOption: option.label });
      nav.state.editEntry = null;
      nav.state.item = null;
      toast('更新しました');
      return go(`#/day/${editing.date}`);
    }
    const e = entryFromItem({ date, timing, group, item, option });
    await addEntries([e]);
    // 使った品目を保存（次回から候補に出る）。シードは量の記憶だけ
    await saveItem({ ...item, lastOption: option.label });
    nav.state.item = null;
    nav.state.draft = null;
    toast(`${e.name}（${option.label}）を記録しました`);
    go('#/');
  };

  const per = item.nut
    ? NUTRIENTS.filter((n) => ['kcal', 'protein', 'fat', 'carbs', 'salt'].includes(n.key)).map((n) => `${n.label} ${item.nut[n.key].toFixed(n.digits)}${n.unit}`).join(' / ')
    : '栄養はまだ取得していません（オンライン時に商品を選び直せます）';

  mount(root, 
    header(editing ? '量を変更' : `${fmtDate(date)} ${timingLabel(timing)}`, { back: editing ? `#/edit/${editing.id}` : `#/entry/${date}/${timing}/${group}` }),
    h('section', { class: 'card' },
      h('div', { class: 'entry-name big' }, item.kind === 'dish' ? item.menuName || item.dishType : item.name),
      h('div', { class: 'muted' }, item.kind === 'dish' ? `料理名: ${item.dishType}` : item.seller ? `販売者名: ${item.seller}` : ''),
      h('p', { class: 'small muted' }, `${item.base || ''} あたり: ${per}`),
      item.estimated ? h('p', { class: 'small muted' }, '栄養は料理名の既定値による概算です') : null),
    h('h2', { class: 'pad' }, '量を選ぶ'),
    h('div', { class: 'options' }, (item.options || []).map((o) => h('button', {
      class: `btn option${o.label === item.lastOption ? ' last' : ''}`,
      onclick: () => save(o),
    }, o.label, item.nut ? h('small', null, `${Math.round(item.nut.kcal * o.f)} kcal`) : null))),
  );
}

/** Open Food Facts で商品を探す */
export async function renderOFF(root, { date, timing, group }) {
  const q = nav.state.offQuery || { name: '', seller: '' };
  const replaceEntry = nav.state.offReplace || null; // 栄養未取得の記録を補完する場合
  const back = replaceEntry ? `#/edit/${replaceEntry.id}` : `#/entry/${date}/${timing}/${group}`;

  const nameInput = h('input', { type: 'text', value: q.name, placeholder: '商品名' });
  const sellerInput = h('input', { type: 'text', value: q.seller, placeholder: '販売者名（任意）' });
  const results = h('div', { class: 'list' }, h('p', { class: 'muted pad' }, '検索しています…'));

  const pick = async (item) => {
    if (replaceEntry) {
      const option = { label: replaceEntry.amountLabel, f: replaceEntry.factor || 1 };
      await saveItem(item);
      const fresh = entryFromItem({ date: replaceEntry.date, timing: replaceEntry.timing, group: replaceEntry.group, item, option });
      await updateEntry({ ...replaceEntry, ...fresh, id: replaceEntry.id, createdAt: replaceEntry.createdAt });
      nav.state.offReplace = null;
      toast('栄養を設定しました');
      return go(`#/day/${replaceEntry.date}`);
    }
    nav.state.item = item;
    go(`#/amount/${date}/${timing}/${group}`);
  };

  const run = async () => {
    q.name = nameInput.value.trim();
    q.seller = sellerInput.value.trim();
    if (!q.name) return;
    mount(results, h('p', { class: 'muted pad' }, '検索しています…'));
    try {
      const list = await searchProducts(q.name, q.seller);
      mount(results, ...(list.length
        ? list.map(({ p, title }) => {
          const kcal = p.nutriments['energy-kcal_100g'] ?? p.nutriments.energy_100g / 4.184;
          return h('button', { class: 'row-toggle', onclick: () => pick(itemFromOFF(p, q.seller)) },
            h('span', { class: 'grow' }, h('span', { class: 'entry-name' }, title), h('span', { class: 'entry-sub' }, [p.brands, p.quantity].filter(Boolean).join('・'))),
            h('span', { class: 'price' }, `${Math.round(kcal)} kcal/100g`));
        })
        : [h('p', { class: 'muted pad' }, '見つかりませんでした。商品名をドイツ語の表記に近づけるか、販売者名を入れて再検索してください。')]));
    } catch (e) {
      mount(results, h('p', { class: 'muted pad' }, `検索できませんでした（${e.message}）。`));
    }
  };

  const fallback = replaceEntry ? null : h('button', {
    class: 'btn ghost wide',
    onclick: () => pick({ key: productKey(nameInput.value.trim(), sellerInput.value.trim()), kind: 'product', name: nameInput.value.trim(), seller: sellerInput.value.trim(), nut: null, options: GRAM_OPTIONS, base: '100g', source: 'user' }),
  }, '見つからないので栄養なしで記録（後で設定）');

  mount(root, 
    header('商品を探す', { back }),
    h('section', { class: 'card' },
      h('p', { class: 'small muted' }, 'Open Food Facts（無料の食品データベース）で検索します。大まかな商品名で構いません。'),
      h('div', { class: 'grid2' }, nameInput, sellerInput),
      h('button', { class: 'btn primary wide', onclick: run }, '再検索')),
    results,
    fallback,
  );
  run();
}
