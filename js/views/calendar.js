// カレンダー（月）
import { h, go, nav, fmtDate } from '../ui.js';
import { state, entriesOn } from '../store.js';
import { monthGrid, toKey } from '../logic/dates.js';
import { TIMINGS } from '../logic/prefs.js';
import { sumEntries, dailyTargets } from '../logic/nutrition.js';

export function render(root) {
  const today = toKey(new Date());
  const cur = nav.state.calMonth || { y: new Date().getFullYear(), m: new Date().getMonth() };
  nav.state.calMonth = cur;

  const byDate = new Map();
  for (const e of state.entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }

  const shift = (d) => {
    const dt = new Date(cur.y, cur.m + d, 1);
    nav.state.calMonth = { y: dt.getFullYear(), m: dt.getMonth() };
    render(root);
  };

  const cells = monthGrid(cur.y, cur.m).map((key) => {
    if (!key) return h('div', { class: 'cal-cell empty' });
    const list = byDate.get(key) || [];
    const dots = TIMINGS.map((t) => {
      const es = list.filter((e) => e.timing === t.id);
      const cls = es.some((e) => e.type === 'pending' || e.status === 'nutrition-missing') ? 'warn' : es.length ? 'on' : '';
      return h('span', { class: `dot ${cls}`, title: t.label });
    });
    return h('button', {
      class: `cal-cell${key === today ? ' today' : ''}${key > today ? ' future' : ''}`,
      onclick: () => go(`#/day/${key}`),
    }, h('span', { class: 'cal-day' }, Number(key.slice(8))), h('span', { class: 'dots' }, dots));
  });

  const pending = state.entries.filter((e) => e.type === 'pending' || e.status === 'nutrition-missing');
  const todayTotal = sumEntries(entriesOn(today));
  const target = dailyTargets(state.settings).kcal;

  root.replaceChildren(
    h('header', { class: 'top' },
      h('button', { class: 'back', onclick: () => shift(-1), 'aria-label': '前の月' }, '‹'),
      h('h1', null, `${cur.y}年 ${cur.m + 1}月`),
      h('button', { class: 'back', onclick: () => shift(1), 'aria-label': '次の月' }, '›')),
    h('div', { class: 'cal' },
      ['月', '火', '水', '木', '金', '土', '日'].map((w) => h('div', { class: 'cal-wd' }, w)),
      cells),
    h('p', { class: 'legend' }, '点は左から 朝・昼・夕・間食。橙は照合待ち・栄養未取得。'),
    h('section', { class: 'card' },
      h('div', { class: 'row between' },
        h('div', null, h('div', { class: 'muted small' }, `今日 ${fmtDate(today)}`), h('div', { class: 'big' }, `${Math.round(todayTotal.kcal)} / ${target} kcal`)),
        h('button', { class: 'btn primary', onclick: () => go(`#/day/${today}`) }, '今日を記録'))),
    pending.length
      ? h('section', { class: 'card warn-card' },
        h('div', null, `確認が必要な記録が ${pending.length} 件あります`),
        h('div', { class: 'chips' }, [...new Set(pending.map((e) => e.date))].sort().map((d) => h('button', { class: 'chip', onclick: () => go(`#/day/${d}`) }, fmtDate(d)))))
      : null,
  );
}
