// in TU cafe（food fakultät のピザ・パスタ）。昼食・夕食
import { h, mount, go, header, fmtDate, toast } from '../ui.js';
import { addEntries } from '../store.js';
import { getCafeMenu, sync } from '../sync.js';
import { cafeSections, splitName } from '../logic/cafe.js';
import { cafeEntries } from '../logic/model.js';
import { fmtPrice } from '../logic/mensa.js';
import { timingLabel } from '../logic/prefs.js';

const TAG_LABEL = { N: 'vegan', V: 'veg', G: 'chicken', R: 'beef', S: 'pork', F: 'fish', A: '' };

export async function render(root, { date, timing }) {
  const title = `${fmtDate(date)} ${timingLabel(timing)}・in TU cafe`;
  const back = `#/add/${date}/${timing}`;
  let menu = await getCafeMenu(date);
  if (!menu && navigator.onLine) {
    mount(root, header(title, { back }), h('p', { class: 'muted pad' }, 'メニューを確認しています…'));
    await sync();
    menu = await getCafeMenu(date);
  }
  if (!menu) {
    mount(root, header(title, { back }), h('p', { class: 'card muted' },
      navigator.onLine ? 'TU cafe のメニューがまだ取得されていません。' : 'オフラインのため、TU cafe のメニューがまだ端末にありません。'));
    return;
  }

  const { pizza, pasta } = cafeSections(menu.day);
  const selected = new Set();
  const all = [...pizza, ...pasta];
  const totalEl = h('span', { class: 'big' });
  const saveBtn = h('button', {
    class: 'btn primary',
    disabled: true,
    onclick: async () => {
      const items = all.filter((m) => selected.has(m.id)).map((m) => ({ ...m, ...splitName(m) }));
      await addEntries(cafeEntries({ date, timing, items }));
      toast(`${items.map((m) => m.title).join('、')} を記録しました`);
      go('#/');
    },
  }, '記録する');

  const refresh = () => {
    const total = all.filter((m) => selected.has(m.id)).reduce((a, m) => a + m.price, 0);
    totalEl.textContent = fmtPrice(total);
    saveBtn.disabled = selected.size === 0;
  };

  const row = (m) => {
    const { title: t, detail } = splitName(m);
    const el = h('button', {
      class: 'row-toggle',
      onclick: () => {
        if (selected.has(m.id)) selected.delete(m.id); else selected.add(m.id);
        el.classList.toggle('on', selected.has(m.id));
        refresh();
      },
    },
    h('span', { class: 'check' }),
    h('span', { class: 'grow' },
      h('span', { class: 'entry-name' }, t, ...(m.tags || []).filter((x) => TAG_LABEL[x]).map((x) => h('span', { class: `tag tag-${x}` }, TAG_LABEL[x]))),
      detail ? h('span', { class: 'entry-sub' }, detail) : null),
    h('span', { class: 'price' }, fmtPrice(m.price)));
    return el;
  };

  mount(root,
    header(title, { back }),
    menu.date !== date ? h('p', { class: 'pad small muted' }, `この日のメニューがないため、${fmtDate(menu.date)} のメニューを表示しています。`) : null,
    h('section', { class: 'card' }, h('h2', null, 'ピザ'), pizza.length ? h('div', { class: 'list' }, pizza.map(row)) : h('p', { class: 'muted' }, 'ありません')),
    h('section', { class: 'card' }, h('h2', null, 'パスタ'), pasta.length ? h('div', { class: 'list' }, pasta.map(row)) : h('p', { class: 'muted' }, 'ありません')),
    h('div', { class: 'sticky-foot' }, h('span', null, '合計 ', totalEl), saveBtn),
  );
  refresh();
}
