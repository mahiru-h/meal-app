// ルーティングと起動
import { h, toast } from './ui.js';
import { init, state } from './store.js';
import { sync } from './sync.js';
import * as calendar from './views/calendar.js';
import * as day from './views/day.js';
import * as group from './views/group.js';
import * as mensa from './views/mensa.js';
import * as cafe from './views/cafe.js';
import * as entry from './views/entry.js';
import * as amount from './views/amount.js';
import * as edit from './views/edit.js';
import * as rec from './views/recommend.js';
import * as prefs from './views/prefs.js';
import * as settings from './views/settings.js';

const DATE = '(\\d{4}-\\d{2}-\\d{2})';
const routes = [
  [/^$/, () => calendar.render, [], 'cal'],
  [new RegExp(`^day/${DATE}$`), () => day.render, ['date'], 'cal'],
  [new RegExp(`^add/${DATE}/(\\w+)$`), () => group.render, ['date', 'timing'], 'cal'],
  [new RegExp(`^mensa/${DATE}$`), () => mensa.render, ['date'], 'cal'],
  [new RegExp(`^cafe/${DATE}/(lunch|dinner)$`), () => cafe.render, ['date', 'timing'], 'cal'],
  [/^pending\/([\w-]+)$/, () => mensa.renderPending, ['id'], 'cal'],
  [new RegExp(`^entry/${DATE}/(\\w+)/(\\w+)$`), () => entry.render, ['date', 'timing', 'group'], 'cal'],
  [new RegExp(`^amount/${DATE}/(\\w+)/(\\w+)$`), () => amount.render, ['date', 'timing', 'group'], 'cal'],
  [new RegExp(`^off/${DATE}/(\\w+)/(\\w+)$`), () => amount.renderOFF, ['date', 'timing', 'group'], 'cal'],
  [/^edit\/([\w-]+)$/, () => edit.render, ['id'], 'cal'],
  [/^rec$/, () => rec.render, [], 'rec'],
  [/^prefs$/, () => prefs.render, [], 'prefs'],
  [/^settings$/, () => settings.render, [], 'settings'],
];

const view = document.getElementById('view');
const tabs = document.getElementById('tabs');

const TABS = [
  ['cal', '記録', '#/'],
  ['rec', 'おすすめ', '#/rec'],
  ['prefs', '好み', '#/prefs'],
  ['settings', '設定', '#/settings'],
];
tabs.replaceChildren(...TABS.map(([id, label, href]) => h('a', { href, 'data-tab': id }, label)));

async function route() {
  const path = location.hash.replace(/^#\/?/, '');
  for (const [re, getFn, keys, tab] of routes) {
    const m = path.match(re);
    if (!m) continue;
    const params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    for (const a of tabs.children) a.classList.toggle('on', a.dataset.tab === tab);
    try {
      await getFn()(view, params);
    } catch (e) {
      console.error(e);
      view.replaceChildren(h('p', { class: 'card' }, `エラー: ${e.message}`));
    }
    window.scrollTo(0, 0);
    return;
  }
  location.hash = '#/';
}

function setOnline() {
  state.online = navigator.onLine;
  document.body.classList.toggle('offline', !navigator.onLine);
}

async function backgroundSync() {
  if (!navigator.onLine) return;
  const r = await sync();
  if (r.resolved) {
    toast(`Mensa の照合待ち ${r.resolved} 件を自動で記録しました`);
    if (/^#\/(day\/|$)|^$/.test(location.hash)) route();
  }
}

async function start() {
  setOnline();
  await init();
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => { setOnline(); backgroundSync(); });
  window.addEventListener('offline', setOnline);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') backgroundSync(); });
  await route();
  backgroundSync();
  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !hadController) return; // 初回インストール時は再読み込みしない
      reloaded = true;
      location.reload();
    });
  }
}

start().catch((e) => {
  console.error(e);
  view.replaceChildren(h('p', { class: 'card' }, `起動できませんでした: ${e.message}`));
});
