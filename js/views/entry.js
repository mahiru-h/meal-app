// in Home / others の入力画面
import { h, go, header, fmtDate, nav, toast } from '../ui.js';
import { state } from '../store.js';
import { timingLabel } from '../logic/prefs.js';
import { toKey } from '../logic/dates.js';
import { normalize, matchScore, countBy, entryKey, rankCandidates, recentUnique, timingRanking } from '../logic/suggest.js';
import { productKey, dishKey, newDishItem, categoryItem, findCategory, GRAM_OPTIONS } from '../logic/model.js';

const DEFAULT_SELLERS = ['Rewe', 'GoAsia', 'Lidl', 'Aldi', 'Edeka', 'Netto', 'Penny', 'Kaufland', 'dm', 'Rossmann'];

/** 記録 → 品目（カタログになければ記録の内容から復元） */
export function itemForEntry(e) {
  const key = entryKey(e);
  const found = state.catalog.get(key);
  if (found) return found;
  if (e.type === 'dish') {
    const base = newDishItem(state.dishes, e.dishType, e.menuName);
    return e.nut && e.factor ? { ...base, nut: Object.fromEntries(Object.entries(e.nut).map(([k, v]) => [k, v / e.factor])) } : base;
  }
  return {
    key, kind: 'product', name: e.product, seller: e.seller || '', source: 'user',
    nut: e.nut && e.factor ? Object.fromEntries(Object.entries(e.nut).map(([k, v]) => [k, v / e.factor])) : null,
    options: GRAM_OPTIONS, base: '100g',
  };
}

export function render(root, { date, timing, group }) {
  const draft = (nav.state.draft && nav.state.draft.date === date && nav.state.draft.timing === timing && nav.state.draft.group === group)
    ? nav.state.draft
    : { date, timing, group, product: '', seller: '', dishType: '', menuName: '' };
  nav.state.draft = draft;
  nav.state.editEntry = null;
  nav.state.offReplace = null;

  const today = toKey(new Date());
  const days = state.settings.suggestDays || 14;
  const n = state.settings.listSize || 10;
  const entries = state.entries;
  const ctxBase = `${date}/${timing}/${group}`;

  const openAmount = (item) => {
    nav.state.item = item;
    go(`#/amount/${ctxBase}`);
  };

  /* ---------- 候補の元データ ---------- */
  const catalogItems = [...state.catalog.values()];
  const products = catalogItems.filter((i) => i.kind === 'product');
  const dishItems = catalogItems.filter((i) => i.kind === 'dish' && i.menuName);
  for (const e of entries) {
    const k = entryKey(e);
    if (!k || state.catalog.has(k)) continue;
    if (e.type === 'product' && !products.some((p) => p.key === k)) products.push(itemForEntry(e));
    if (e.type === 'dish' && e.menuName && !dishItems.some((p) => p.key === k)) dishItems.push(itemForEntry(e));
  }
  const freqItem = countBy(entries, entryKey, { today, days });
  const freqSeller = countBy(entries, (e) => (e.seller ? normalize(e.seller) : null), { today, days });
  const freqType = countBy(entries, (e) => (e.dishType ? normalize(e.dishType) : null), { today, days });

  const sources = {
    product: () => {
      let list = products;
      if (draft.seller) {
        const filtered = list.filter((p) => matchScore(draft.seller, p.seller) > 0.3);
        if (filtered.length) list = filtered;
      }
      return rankCandidates(draft.product, list.map((p) => ({ key: p.key, text: p.name, alt: [p.seller], sub: p.seller, item: p, seed: p.source === 'seed' })), freqItem);
    },
    seller: () => {
      const names = new Map();
      for (const s of [...DEFAULT_SELLERS, ...products.map((p) => p.seller), ...entries.map((e) => e.seller)]) if (s) names.set(normalize(s), s);
      return rankCandidates(draft.seller, [...names].map(([key, text]) => ({ key, text })), freqSeller);
    },
    dishType: () => {
      const names = new Map();
      for (const s of [...state.dishes.categories.map((c) => c.name), ...dishItems.map((d) => d.dishType)]) if (s) names.set(normalize(s), s);
      return rankCandidates(draft.dishType, [...names].map(([key, text]) => ({ key, text })), freqType);
    },
    menuName: () => {
      let list = dishItems;
      if (draft.dishType) {
        const q = normalize(draft.dishType);
        const filtered = list.filter((d) => normalize(d.dishType) === q);
        if (filtered.length) list = filtered;
      }
      return rankCandidates(draft.menuName, list.map((d) => ({ key: d.key, text: d.menuName, alt: [d.dishType], sub: d.dishType, item: d, seed: d.source === 'seed' })), freqItem);
    },
  };

  /* ---------- 入力欄と候補 ---------- */
  const fields = {};
  const dropdown = h('div', { class: 'dropdown', hidden: true });
  let activeField = null;

  const showDropdown = (field) => {
    activeField = field;
    const list = sources[field]();
    if (!list.length) { dropdown.hidden = true; return; }
    dropdown.replaceChildren(...list.map((c) => h('button', {
      class: 'dd-item',
      onpointerdown: (ev) => ev.preventDefault(), // フォーカスを外さない
      onclick: () => choose(field, c),
    }, h('span', null, c.text), c.sub ? h('span', { class: 'muted small' }, c.sub) : null, c.share ? h('span', { class: 'share' }, `${Math.round(c.share * 100)}%`) : null)));
    const input = fields[field];
    const box = input.getBoundingClientRect();
    const parent = root.getBoundingClientRect();
    dropdown.style.top = `${box.bottom - parent.top + 2}px`;
    dropdown.style.left = `${Math.max(8, box.left - parent.left)}px`;
    dropdown.style.minWidth = `${box.width}px`;
    dropdown.hidden = false;
  };

  const choose = (field, c) => {
    if (field === 'product' && c.item) return openAmount(c.item);
    if (field === 'menuName' && c.item) return openAmount(c.item);
    draft[field] = c.text;
    fields[field].value = c.text;
    dropdown.hidden = true;
    const next = { seller: 'product', dishType: 'menuName' }[field];
    if (next) fields[next].focus();
  };

  const input = (field, label, placeholder) => {
    const el = h('input', {
      type: 'text', value: draft[field], placeholder, autocomplete: 'off', autocapitalize: 'off', enterkeyhint: 'next',
      oninput: () => { draft[field] = el.value; showDropdown(field); },
      onfocus: () => showDropdown(field),
      onblur: () => setTimeout(() => { if (activeField === field) dropdown.hidden = true; }, 150),
      onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); next(); } },
    });
    fields[field] = el;
    return h('label', { class: 'field' }, h('span', null, label), el);
  };

  /* ---------- 次へ ---------- */
  const next = () => {
    const product = draft.product.trim();
    const seller = draft.seller.trim();
    const dishType = draft.dishType.trim();
    const menuName = draft.menuName.trim();
    if (product) {
      const exact = state.catalog.get(productKey(product, seller)) || products.find((p) => p.key === productKey(product, seller));
      if (exact) return openAmount(exact);
      const sameName = products.filter((p) => normalize(p.name) === normalize(product));
      if (!seller && sameName.length === 1) return openAmount(sameName[0]);
      if (navigator.onLine) {
        nav.state.offQuery = { name: product, seller };
        return go(`#/off/${ctxBase}`);
      }
      // オフライン: 栄養なしで記録し、後で商品を選ぶ
      return openAmount({ key: productKey(product, seller), kind: 'product', name: product, seller, nut: null, options: GRAM_OPTIONS, base: '100g', source: 'user' });
    }
    if (menuName || dishType) {
      const key = dishKey(dishType || findCategory(state.dishes, dishType).name, menuName);
      const exact = state.catalog.get(key) || dishItems.find((d) => d.key === key);
      if (exact) return openAmount(exact);
      if (menuName && !dishType) {
        const sameName = dishItems.filter((d) => normalize(d.menuName) === normalize(menuName));
        if (sameName.length) return openAmount(sameName[0]);
      }
      return openAmount(menuName ? newDishItem(state.dishes, dishType, menuName) : categoryItem(state.dishes, dishType));
    }
    toast('商品名、または料理名・献立名を入力してください');
  };

  /* ---------- 下部の一覧（n 行 2 列） ---------- */
  const cell = (e, extra) => e
    ? h('button', { class: 'cell', onclick: () => openAmount(itemForEntry(e)) },
      h('span', { class: 'cell-name' }, e.type === 'dish' ? e.menuName || e.dishType : e.product),
      h('span', { class: 'cell-sub' }, [e.type === 'dish' ? (e.menuName ? e.dishType : '') : e.seller, extra].filter(Boolean).join('・')))
    : h('span', { class: 'cell empty' });

  const history = recentUnique(entries, { limit: n, group });
  let lists;
  if (group === 'others') {
    lists = h('section', { class: 'lists one' },
      h('div', { class: 'list-head' }, '履歴'),
      history.length ? history.map((e) => cell(e)) : h('p', { class: 'muted small' }, 'まだ記録がありません'));
  } else {
    const rank = timingRanking(entries, { today, timing, group, days: 30, limit: n });
    const rows = [];
    for (let i = 0; i < Math.max(history.length, rank.length); i++) {
      rows.push(cell(history[i]), cell(rank[i]?.entry, rank[i] ? `${Math.round(rank[i].share * 100)}%` : ''));
    }
    lists = h('section', { class: 'lists' },
      h('div', { class: 'list-head' }, '履歴'),
      h('div', { class: 'list-head' }, `${timingLabel(timing)}によく食べる`),
      rows.length ? rows : h('p', { class: 'muted small span2' }, '記録が増えると、ここに履歴と、このタイミングでよく食べるものが並びます'));
  }

  root.replaceChildren(
    header(`${fmtDate(date)} ${timingLabel(timing)}・${group === 'home' ? 'in Home' : 'others'}`, { back: `#/add/${date}/${timing}` }),
    h('section', { class: 'grid2 inputs' },
      input('product', '商品名', '例 Spaghetti'),
      input('seller', '販売者名', '例 Rewe'),
      input('dishType', '料理名', '例 パスタ'),
      input('menuName', '献立名', '例 和風ツナパスタ')),
    h('div', { class: 'pad row between' },
      h('button', { class: 'btn ghost small', onclick: () => { Object.assign(draft, { product: '', seller: '', dishType: '', menuName: '' }); render(root, { date, timing, group }); } }, 'クリア'),
      h('button', { class: 'btn primary', onclick: next }, '次へ（量の選択）')),
    lists,
    dropdown,
  );
}
