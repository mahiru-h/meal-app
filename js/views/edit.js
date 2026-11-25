// 記録の編集・削除
import { h, mount, go, header, fmtDate, nav, toast, confirmButton } from '../ui.js';
import { state, updateEntry, deleteEntries } from '../store.js';
import { TIMINGS, timingLabel } from '../logic/prefs.js';
import { NUTRIENTS } from '../logic/nutrition.js';
import { fmtPrice } from '../logic/mensa.js';
import { itemForEntry } from './entry.js';

export function render(root, { id }) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return go('#/');
  const editable = e.type === 'product' || e.type === 'dish';

  const timingSel = h('div', { class: 'chips' }, TIMINGS.map((t) => h('button', {
    class: `chip${t.id === e.timing ? ' on' : ''}`,
    disabled: e.group === 'mensa' && t.id !== 'lunch',
    onclick: async () => {
      if (t.id === e.timing) return;
      await updateEntry({ ...e, timing: t.id });
      toast(`${t.label}に移動しました`);
      render(root, { id });
    },
  }, t.label)));

  mount(root, 
    header('記録の編集', { back: `#/day/${e.date}` }),
    h('section', { class: 'card' },
      h('div', { class: 'entry-name big' }, e.name),
      h('div', { class: 'muted' }, [fmtDate(e.date), timingLabel(e.timing), e.amountLabel, e.seller, e.type === 'dish' ? e.dishType : '', e.price != null ? fmtPrice(e.price) : ''].filter(Boolean).join('・')),
      e.detail ? h('div', { class: 'small muted' }, e.detail) : null,
      e.nut
        ? h('div', { class: 'nut-grid' }, NUTRIENTS.map((n) => h('div', null, h('span', { class: 'muted small' }, n.label), h('span', null, `${e.nut[n.key].toFixed(n.digits)}${n.unit}`))))
        : h('p', { class: 'muted' }, '栄養が未取得です')),
    h('section', { class: 'card' }, h('h2', null, '食事タイミング'), timingSel),
    h('div', { class: 'stack pad' },
      editable ? h('button', {
        class: 'btn wide',
        onclick: () => {
          nav.state.item = itemForEntry(e);
          nav.state.editEntry = e;
          go(`#/amount/${e.date}/${e.timing}/${e.group}`);
        },
      }, '量を変更') : null,
      e.status === 'nutrition-missing' ? h('button', {
        class: 'btn primary wide',
        disabled: !navigator.onLine,
        onclick: () => {
          nav.state.offQuery = { name: e.product, seller: e.seller };
          nav.state.offReplace = e;
          go(`#/off/${e.date}/${e.timing}/${e.group}`);
        },
      }, navigator.onLine ? '商品を検索して栄養を設定' : '栄養の設定はオンライン時に行えます') : null,
      confirmButton('この記録を削除', 'もう一度押すと削除', async () => {
        await deleteEntries([e.id]);
        toast('削除しました');
        go(`#/day/${e.date}`);
      })),
  );
}
