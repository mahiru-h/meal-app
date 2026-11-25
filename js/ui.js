// 画面部品の小さなヘルパー
import { fromKey } from './logic/dates.js';

/** h('div', {class: 'x', onclick}, child, ...) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** 子要素を入れ替える（配列は展開し、null / false は無視する） */
export function mount(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
}

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

export function header(title, { back, right } = {}) {
  return h('header', { class: 'top' },
    back ? h('button', { class: 'back', onclick: () => (typeof back === 'function' ? back() : go(back)), 'aria-label': '戻る' }, '‹') : h('span', { class: 'back-space' }),
    h('h1', null, title),
    right || h('span', { class: 'back-space' }));
}

let toastTimer;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];
export function fmtDate(key, withYear = false) {
  const d = fromKey(key);
  return `${withYear ? `${d.getFullYear()}/` : ''}${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`;
}

export const fmtNum = (v, digits = 0) => (v == null ? '—' : Number(v).toFixed(digits));

/** 2 回押すと実行されるボタン（誤操作防止） */
export function confirmButton(label, confirmLabel, onConfirm, cls = 'danger') {
  let armed = false;
  let timer;
  const btn = h('button', {
    class: `btn ${cls}`,
    onclick: () => {
      if (armed) { clearTimeout(timer); onConfirm(); return; }
      armed = true;
      btn.textContent = confirmLabel;
      timer = setTimeout(() => { armed = false; btn.textContent = label; }, 3000);
    },
  }, label);
  return btn;
}

/** ファイルを共有シート（iPhone）またはダウンロードで渡す */
export async function shareFile(name, text, type = 'text/csv') {
  const blob = new Blob(['﻿' + text], { type: `${type};charset=utf-8` });
  const file = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** 画面間で一時的に受け渡す値 */
export const nav = { state: {} };
