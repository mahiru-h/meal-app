// 日の画面: 食事タイミングの選択と、その日の記録・栄養
import { h, go, header, fmtDate, toast } from '../ui.js';
import { state, entriesOn, addEntries } from '../store.js';
import { addDays } from '../logic/dates.js';
import { TIMINGS } from '../logic/prefs.js';
import { NUTRIENTS, sumEntries, dailyTargets, status, targetMid } from '../logic/nutrition.js';
import { previousSame } from '../logic/suggest.js';
import { newId } from '../logic/model.js';
import { fmtPrice } from '../logic/mensa.js';

export function nutritionBars(total, targets) {
  return h('div', { class: 'bars' }, NUTRIENTS.map((n) => {
    const v = total[n.key] || 0;
    const mid = targetMid(n.key, targets);
    const st = status(n.key, v, targets);
    const pct = Math.min(100, (v / (mid || 1)) * 100);
    const t = targets[n.key];
    const tText = typeof t === 'number' ? `${t}` : t[1] === Infinity ? `${t[0]}以上` : t[0] === 0 ? `${t[1]}未満` : `${t[0]}〜${t[1]}`;
    return h('div', { class: 'bar-row' },
      h('span', { class: 'bar-label' }, n.label),
      h('span', { class: 'bar' }, h('span', { class: `bar-fill ${st}`, style: { width: `${pct}%` } })),
      h('span', { class: 'bar-val' }, `${v.toFixed(n.digits)}`, h('span', { class: 'muted' }, ` / ${tText}${n.unit}`)));
  }));
}

function entryRow(e) {
  const warn = e.type === 'pending' || e.status === 'nutrition-missing';
  const sub = [e.amountLabel, e.seller, e.dishType && e.menuName ? e.dishType : null, e.price != null ? fmtPrice(e.price) : null, e.status === 'auto' ? '自動照合' : null].filter(Boolean).join('・');
  return h('button', { class: `entry${warn ? ' warn' : ''}`, onclick: () => go(e.type === 'pending' ? `#/pending/${e.id}` : `#/edit/${e.id}`) },
    h('span', { class: 'entry-main' },
      h('span', { class: 'entry-name' }, e.name || e.menuName || e.product),
      h('span', { class: 'entry-sub' }, e.type === 'pending' ? `照合待ち（${e.candidates > 1 ? `候補 ${e.candidates} 件` : 'メニュー未取得'}）` : e.status === 'nutrition-missing' ? `${sub}・栄養未取得` : sub)),
    h('span', { class: 'entry-kcal' }, e.nut ? `${Math.round(e.nut.kcal)}` : '—', h('small', null, 'kcal')));
}

export function render(root, { date }) {
  const list = entriesOn(date);
  const targets = dailyTargets(state.settings);

  const sections = TIMINGS.map((t) => {
    const es = list.filter((e) => e.timing === t.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const prev = previousSame(state.entries, date, t.id);
    return h('section', { class: 'card timing' },
      h('div', { class: 'row between' },
        h('h2', null, t.label, es.length ? h('span', { class: 'muted small' }, ` ${Math.round(sumEntries(es).kcal)} kcal`) : null),
        h('div', { class: 'row gap' },
          prev.length && !es.length
            ? h('button', {
              class: 'btn small ghost',
              onclick: async () => {
                const copies = prev.map((e) => ({ ...e, id: newId(), date, createdAt: Date.now(), status: e.status === 'auto' ? 'ok' : e.status }));
                await addEntries(copies);
                toast(`${fmtDate(prev[0].date)} と同じ内容を記録しました`);
                go('#/');
              },
            }, '前回と同じ')
            : null,
          h('button', { class: 'btn small primary', onclick: () => go(`#/add/${date}/${t.id}`) }, '＋ 追加'))),
      es.length ? h('div', { class: 'entries' }, es.map(entryRow)) : null);
  });

  root.replaceChildren(
    header(fmtDate(date, true), {
      back: '#/',
      right: h('span', { class: 'row' },
        h('button', { class: 'back', onclick: () => go(`#/day/${addDays(date, -1)}`), 'aria-label': '前の日' }, '‹'),
        h('button', { class: 'back', onclick: () => go(`#/day/${addDays(date, 1)}`), 'aria-label': '次の日' }, '›')),
    }),
    sections,
    h('section', { class: 'card' }, h('h2', null, 'この日の栄養'), nutritionBars(sumEntries(list), targets)),
  );
}
