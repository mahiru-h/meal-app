// 好み設定（テンプレート）
import { h, go, header, toast } from '../ui.js';
import { getActivePrefs, setTodayPrefs, saveTemplate } from '../store.js';
import { AREAS, CUISINES, FOODS } from '../logic/prefs.js';

export async function render(root) {
  const { prefs, template } = await getActivePrefs();
  const cur = structuredClone(prefs);

  const changed = () => JSON.stringify(cur) !== JSON.stringify(template);
  const apply = async () => { await setTodayPrefs(cur); };

  const actions = () => h('div', { class: 'row gap pad' },
    h('button', {
      class: 'btn primary grow',
      onclick: async () => { await saveTemplate(structuredClone(cur)); await setTodayPrefs(cur); toast('テンプレートを保存しました'); render(root); },
    }, 'テンプレートを保存'),
    h('button', {
      class: 'btn grow',
      onclick: async () => { await setTodayPrefs(structuredClone(template)); toast('テンプレートに戻しました'); render(root); },
    }, 'リセット'));

  const statusEl = h('p', { class: 'pad small muted' });
  const updateStatus = () => { statusEl.textContent = changed() ? '今日の好みはテンプレートから変更されています（おすすめに反映済み）' : '今日の好みはテンプレートのままです'; };

  const single = (title, options, key) => h('section', { class: 'card' },
    h('h2', null, title),
    h('div', { class: 'chips' }, options.map((o) => {
      const b = h('button', {
        class: `chip${cur[key] === o.id ? ' on' : ''}`,
        onclick: async () => {
          cur[key] = o.id;
          b.parentElement.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
          await apply(); updateStatus();
        },
      }, o.label);
      return b;
    })),
    h('p', { class: 'small muted' }, `テンプレート: ${options.find((o) => o.id === template[key])?.label || '—'}`));

  const multi = (title, options, key) => h('section', { class: 'card' },
    h('h2', null, title),
    h('div', { class: 'chips' }, options.map((o) => {
      const b = h('button', {
        class: `chip${(cur[key] || []).includes(o.id) ? ' on' : ''}`,
        onclick: async () => {
          const set = new Set(cur[key] || []);
          if (set.has(o.id)) set.delete(o.id); else set.add(o.id);
          cur[key] = options.map((x) => x.id).filter((id) => set.has(id));
          b.classList.toggle('on', set.has(o.id));
          await apply(); updateStatus();
        },
      }, o.label);
      return b;
    })),
    h('p', { class: 'small muted' }, `テンプレート: ${(template[key] || []).map((id) => options.find((o) => o.id === id)?.label).filter(Boolean).join('、') || 'なし'}`));

  root.replaceChildren(
    header('好み設定'),
    h('div', { class: 'pad' }, h('button', {
      class: 'btn huge primary',
      onclick: async () => { await setTodayPrefs(structuredClone(template)); go('#/rec'); },
    }, 'テンプレートのまま')),
    actions(),
    statusEl,
    single('どのエリア（国）で食事をとるか', AREAS, 'area'),
    multi('お勧めに出しやすくする味付け', CUISINES, 'cuisines'),
    multi('好きな食べ物', FOODS, 'likes'),
    multi('その日食べたい物', FOODS, 'wants'),
    h('div', { class: 'pad' }, h('button', { class: 'btn wide', onclick: () => go('#/rec') }, 'この内容でおすすめを見る')),
    actions(),
  );
  updateStatus();
}
