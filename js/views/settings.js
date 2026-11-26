// 設定
import { h, mount, header, toast, shareFile } from '../ui.js';
import { state, saveSettings, saveItems } from '../store.js';
import { MODES, dailyTargets } from '../logic/nutrition.js';
import { EXCLUSIONS } from '../logic/prefs.js';
import { entriesToCSV, parseFoodsCSV, FOOD_TEMPLATE } from '../logic/csv.js';
import { itemFromImport } from '../logic/model.js';
import { toKey } from '../logic/dates.js';
import { sync, mensaStatus } from '../sync.js';
import { APP_VERSION } from '../version.js';

export async function render(root) {
  const s = state.settings;
  const t = dailyTargets(s);
  const status = await mensaStatus();

  const num = (key, label, unit, step = 1) => {
    const el = h('input', {
      type: 'number', inputmode: 'decimal', step, value: s[key],
      onchange: async () => { const v = Number(el.value); if (v > 0) { await saveSettings({ [key]: v }); toast('保存しました'); render(root); } },
    });
    return h('label', { class: 'field inline' }, h('span', null, label), el, h('span', { class: 'muted' }, unit));
  };

  const fileInput = h('input', {
    type: 'file', accept: '.csv,text/csv', hidden: true,
    onchange: async () => {
      const f = fileInput.files[0];
      if (!f) return;
      const { items, errors } = parseFoodsCSV(await f.text());
      const converted = items.map((r) => itemFromImport(r, state.dishes));
      if (converted.length) await saveItems(converted);
      toast(`${converted.length} 件を取り込みました${errors.length ? `（${errors.length} 件エラー）` : ''}`);
      if (errors.length) importLog.textContent = errors.join('\n');
      fileInput.value = '';
    },
  });
  const importLog = h('pre', { class: 'small muted' });

  mount(root, 
    header('設定'),
    h('section', { class: 'card' },
      h('h2', null, '栄養バランスのモード'),
      h('div', { class: 'list' }, Object.entries(MODES).map(([id, m]) => h('button', {
        class: `row-toggle radio${s.mode === id ? ' on' : ''}`,
        onclick: async () => { await saveSettings({ mode: id }); toast(`${m.label}にしました`); render(root); },
      }, h('span', { class: 'check' }), h('span', { class: 'grow' }, m.label)))),
      h('p', { class: 'small muted' }, 'テスト期間モード: 朝食 €3 以内（調理は週 2 回・10 分以内まで）、昼食・夕食は €5 以内・30 分以内の簡素な組み合わせを優先します。')),
    h('section', { class: 'card' },
      h('h2', null, '1 日の目標'),
      num('kcal', 'エネルギー', 'kcal', 10),
      num('weight', '体重', 'kg', 0.1),
      h('p', { class: 'small muted' },
        `現在のモードでの目標: ${t.kcal} kcal、たんぱく質 ${t.protein[0]}〜${t.protein[1]} g、脂質 ${t.fat[0]}〜${t.fat[1]} g、炭水化物 ${t.carbs[0]}〜${t.carbs[1]} g、食物繊維 ${t.fiber[0]} g 以上、野菜 ${t.veg[0]} g 以上、塩分 ${t.salt[1]} g 未満`)),
    h('section', { class: 'card' },
      h('h2', null, '入力候補'),
      num('suggestDays', '候補の集計期間（直前 n 日）', '日'),
      num('listSize', '履歴・よく食べる の行数', '行')),
    h('section', { class: 'card' },
      h('h2', null, 'おすすめから除外する食材'),
      h('div', { class: 'chips' }, EXCLUSIONS.map((x) => h('button', {
        class: `chip${s.excluded.includes(x.id) ? ' on' : ''}`,
        onclick: async () => {
          const set = new Set(s.excluded);
          if (set.has(x.id)) set.delete(x.id); else set.add(x.id);
          await saveSettings({ excluded: [...set] });
          render(root);
        },
      }, x.label)))),
    h('section', { class: 'card' },
      h('h2', null, 'Mensa のメニュー'),
      h('p', { class: 'small muted' }, status
        ? `サーバー側の最終取得: ${status.lastChecked ? new Date(status.lastChecked).toLocaleString('ja-JP') : '—'}／この端末での最終同期: ${new Date(status.syncedAt).toLocaleString('ja-JP')}`
        : 'まだ同期していません'),
      h('button', {
        class: 'btn',
        onclick: async () => {
          if (!navigator.onLine) return toast('オフラインです');
          const r = await sync();
          toast(`同期しました（${r.fetched} 週分を更新、${r.resolved} 件を自動照合）`);
          render(root);
        },
      }, '今すぐ同期')),
    h('section', { class: 'card' },
      h('h2', null, 'データ'),
      h('div', { class: 'stack' },
        h('button', { class: 'btn', onclick: () => shareFile(`meals-${toKey(new Date())}.csv`, entriesToCSV(state.entries)) }, `記録を CSV で書き出す（${state.entries.length} 件）`),
        h('button', { class: 'btn', onclick: () => fileInput.click() }, '普段よく食べるものを CSV から取り込む'),
        h('button', { class: 'btn ghost', onclick: () => shareFile('foods-template.csv', FOOD_TEMPLATE) }, '取り込み用テンプレート CSV'),
        fileInput, importLog)),
    h('section', { class: 'card' },
      h('h2', null, `アプリのバージョン ${APP_VERSION}`),
      h('p', { class: 'small muted' }, '新しい機能が表示されないときに押してください。記録は消えません（オンライン時のみ）。'),
      h('button', {
        class: 'btn',
        onclick: async () => {
          if (!navigator.onLine) return toast('オフラインです');
          for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) await r.unregister();
          for (const k of await caches.keys()) await caches.delete(k);
          location.reload();
        },
      }, '最新版に更新')),
    h('p', { class: 'pad small muted' },
      window.matchMedia('(display-mode: standalone)').matches || navigator.standalone ? '' : 'Safari の共有ボタン →「ホーム画面に追加」でアプリとして使えます'),
  );
}
