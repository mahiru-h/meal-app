// in Mensa（昼食のみ）
import { h, go, header, fmtDate, toast, nav } from '../ui.js';
import { addEntries, deleteEntries, state } from '../store.js';
import { getMensaDay, sync } from '../sync.js';
import { mainsForDay, shouldOfferSides, matchPrice, describeCombo, fmtPrice } from '../logic/mensa.js';
import { JUICE } from '../logic/nutrition.js';
import { mensaEntries, pendingMensaEntry } from '../logic/model.js';

const TAG_LABEL = { N: 'vegan', V: 'veg', G: 'chicken', R: 'beef', S: 'pork', F: 'fish', A: 'lamb', W: 'game', B: '' };

export async function render(root, { date }) {
  const replaceId = nav.state.replacePendingId || null; // 照合待ちを置き換える場合
  nav.state.replacePendingId = null;
  let day = await getMensaDay(date);
  if (!day && navigator.onLine) {
    root.replaceChildren(header(`${fmtDate(date)} in Mensa`, { back: `#/add/${date}/lunch` }), h('p', { class: 'muted pad' }, 'メニューを確認しています…'));
    await sync();
    day = await getMensaDay(date);
  }

  const sel = { juice: false, mains: new Set(), sides: new Set() };
  const mains = mainsForDay(day);

  const finish = async (list, msg) => {
    await addEntries(list);
    if (replaceId) await deleteEntries([replaceId]);
    toast(msg);
    go('#/');
  };

  const priceBox = () => {
    const input = h('input', { type: 'number', inputmode: 'decimal', step: '0.05', min: '0', placeholder: '例 3.80', class: 'price-input' });
    const btn = h('button', {
      class: 'btn',
      onclick: async () => {
        const p = Number(String(input.value).replace(',', '.'));
        if (!(p > 0)) return toast('価格を入力してください');
        if (day) {
          const combos = matchPrice(day, p);
          if (combos.length === 1) {
            const c = combos[0];
            const sides = Array.from({ length: c.sides }, () => ({ name: 'side dish', price: day.sides?.[0]?.price ?? 0.8 }));
            return finish(mensaEntries({ date, mains: c.main ? [c.main] : [], sides, juice: c.juice }), `${describeCombo(c)} を記録しました`);
          }
        }
        const pending = pendingMensaEntry(date, p);
        await addEntries([pending]);
        if (day) return go(`#/pending/${pending.id}`);
        toast('価格を記録しました。メニュー取得後に自動で照合します');
        go('#/');
      },
    }, '価格だけ記録');
    return h('section', { class: 'card' },
      h('h2', null, '価格だけで記録'),
      h('p', { class: 'muted small' }, '支払った合計額（学生価格）を入力します。主菜・ジュース・付け合わせの組み合わせで照合し、1 通りに決まればそのまま記録、複数あれば候補を表示します。'),
      h('div', { class: 'row gap' }, h('span', null, '€'), input, btn));
  };

  if (!day) {
    root.replaceChildren(
      header(`${fmtDate(date)} in Mensa`, { back: `#/add/${date}/lunch` }),
      h('p', { class: 'card muted' }, navigator.onLine ? 'この日のメニューはありません（休業日・未公開の可能性があります）。' : 'オフラインのため、この日のメニューがまだ端末にありません。'),
      juiceOnly(),
      priceBox(),
    );
    return;
  }

  function juiceOnly() {
    return h('button', { class: 'btn wide', onclick: () => finish(mensaEntries({ date, juice: true }), `${JUICE.name} を記録しました`) }, `${JUICE.name} だけ記録（${fmtPrice(JUICE.price)}）`);
  }

  const totalEl = h('span', { class: 'big' });
  const sidesWrap = h('div');
  const saveBtn = h('button', { class: 'btn primary', disabled: true }, '記録する');

  const refresh = () => {
    const selectedMains = mains.filter((m) => sel.mains.has(m.id));
    const offer = shouldOfferSides(selectedMains);
    if (!offer) sel.sides.clear();
    const sides = day.sides || [];
    sidesWrap.replaceChildren(offer && sides.length
      ? h('section', { class: 'card' },
        h('h2', null, `付け合わせ（${fmtPrice(sides[0].price)}）`),
        h('div', { class: 'list' }, sides.map((s) => toggleRow(s.id, s.name, s.nameDe !== s.name ? s.nameDe : '', s.price, sel.sides, refresh))))
      : null);
    const total = (sel.juice ? JUICE.price : 0) + selectedMains.reduce((a, m) => a + m.price, 0) + sides.filter((s) => sel.sides.has(s.id)).reduce((a, s) => a + s.price, 0);
    totalEl.textContent = fmtPrice(total);
    saveBtn.disabled = !(sel.juice || sel.mains.size);
  };

  saveBtn.onclick = () => {
    const selectedMains = mains.filter((m) => sel.mains.has(m.id));
    const sides = (day.sides || []).filter((s) => sel.sides.has(s.id));
    finish(mensaEntries({ date, mains: selectedMains, sides, juice: sel.juice }), '記録しました');
  };

  const juiceRow = h('button', { class: 'row-toggle', onclick: () => { sel.juice = !sel.juice; juiceRow.classList.toggle('on', sel.juice); refresh(); } },
    h('span', { class: 'check' }),
    h('span', { class: 'grow' }, h('span', { class: 'entry-name' }, JUICE.name), h('span', { class: 'entry-sub' }, JUICE.note)),
    h('span', { class: 'price' }, fmtPrice(JUICE.price)));

  root.replaceChildren(
    header(`${fmtDate(date)} in Mensa`, { back: `#/add/${date}/lunch` }),
    h('section', { class: 'card' }, h('div', { class: 'list' }, juiceRow)),
    h('section', { class: 'card' },
      h('h2', null, '主菜（価格の安い順）'),
      mains.length
        ? h('div', { class: 'list' }, mains.map((m) => toggleRow(m.id, m.name, [...(m.with || [])].join(', '), m.price, sel.mains, refresh, m.tags)))
        : h('p', { class: 'muted' }, '€1.90 以上の料理がありません')),
    sidesWrap,
    priceBox(),
    h('div', { class: 'sticky-foot' }, h('span', null, '合計 ', totalEl), saveBtn),
  );
  refresh();
}

function toggleRow(id, name, sub, price, set, onChange, tags = []) {
  const el = h('button', {
    class: `row-toggle${set.has(id) ? ' on' : ''}`,
    onclick: () => {
      if (set.has(id)) set.delete(id); else set.add(id);
      el.classList.toggle('on', set.has(id));
      onChange();
    },
  },
  h('span', { class: 'check' }),
  h('span', { class: 'grow' },
    h('span', { class: 'entry-name' }, name, ...tags.filter((t) => TAG_LABEL[t]).map((t) => h('span', { class: `tag tag-${t}` }, TAG_LABEL[t]))),
    sub ? h('span', { class: 'entry-sub' }, sub) : null),
  h('span', { class: 'price' }, fmtPrice(price)));
  return el;
}

/** 照合待ちの記録: 候補から選ぶ */
export async function renderPending(root, { id }) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return go('#/');
  const day = await getMensaDay(e.date);
  const combos = day ? matchPrice(day, e.price) : [];
  root.replaceChildren(
    header(`照合待ち ${fmtPrice(e.price)}`, { back: `#/day/${e.date}` }),
    h('p', { class: 'pad muted' }, `${fmtDate(e.date)} の昼食（in Mensa）`),
    day
      ? h('section', { class: 'card' },
        h('h2', null, combos.length ? 'この金額になる組み合わせ' : 'この金額になる組み合わせが見つかりません'),
        h('div', { class: 'list' }, combos.map((c) => h('button', {
          class: 'row-toggle',
          onclick: async () => {
            const sides = Array.from({ length: c.sides }, () => ({ name: 'side dish', price: day.sides?.[0]?.price ?? 0.8 }));
            await addEntries(mensaEntries({ date: e.date, mains: c.main ? [c.main] : [], sides, juice: c.juice }));
            await deleteEntries([e.id]);
            toast('記録しました');
            go(`#/day/${e.date}`);
          },
        }, h('span', { class: 'grow' }, describeCombo(c)), h('span', { class: 'price' }, fmtPrice(c.total))))),
        h('button', { class: 'btn wide', onclick: () => { nav.state.replacePendingId = e.id; go(`#/mensa/${e.date}`); } }, 'メニューから選び直す'))
      : h('p', { class: 'card muted' }, 'この日のメニューがまだ端末にありません。オンラインでアプリを開くと自動で照合します。'),
    h('div', { class: 'pad' }, h('button', {
      class: 'btn danger wide',
      onclick: async () => { await deleteEntries([e.id]); toast('削除しました'); go(`#/day/${e.date}`); },
    }, 'この記録を削除')),
  );
}
