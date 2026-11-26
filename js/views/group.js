// 食事内容グループの選択
import { h, mount, go, header, fmtDate } from '../ui.js';
import { GROUPS, timingLabel } from '../logic/prefs.js';

export function render(root, { date, timing }) {
  const groups = GROUPS.filter((g) => !g.only || g.only.includes(timing));
  mount(root, 
    header(`${fmtDate(date)} ${timingLabel(timing)}`, { back: `#/day/${date}` }),
    h('div', { class: 'stack' },
      groups.map((g) => h('button', {
        class: 'btn huge',
        onclick: () => go(g.id === 'mensa' ? `#/mensa/${date}` : g.id === 'cafe' ? `#/cafe/${date}/${timing}` : `#/entry/${date}/${timing}/${g.id}`),
      }, g.label))),
  );
}
