// CSV の読み書き（純粋関数のみ）

export function toCSV(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','));
  return [head, ...body].join('\r\n');
}

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

/* ---------- 記録のエクスポート ---------- */

import { NUTRIENTS } from './nutrition.js';
import { timingLabel } from './prefs.js';

const GROUP_LABEL = { mensa: 'in Mensa', cafe: 'in TU cafe', home: 'in Home', others: 'others' };

export function entriesToCSV(entries) {
  const cols = [
    { label: '日付', key: 'date' },
    { label: '食事タイミング', get: (e) => timingLabel(e.timing) },
    { label: 'グループ', get: (e) => GROUP_LABEL[e.group] || e.group },
    { label: '種類', key: 'type' },
    { label: '商品名', key: 'product' },
    { label: '販売者名', key: 'seller' },
    { label: '料理名', key: 'dishType' },
    { label: '献立名', key: 'menuName' },
    { label: '表示名', key: 'name' },
    { label: '量', key: 'amountLabel' },
    { label: '価格(€)', key: 'price' },
    ...NUTRIENTS.map((n) => ({ label: `${n.label}(${n.unit})`, get: (e) => (e.nut ? e.nut[n.key] : '') })),
    { label: '状態', key: 'status' },
  ];
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  return toCSV(sorted, cols);
}

/* ---------- 「普段よく食べるもの」の取り込み ---------- */

// テンプレートの列（この順で書けば読み込める。列名で判定するので順番は入れ替え可）
export const FOOD_COLUMNS = [
  '種別', '商品名', '販売者名', '料理名', '献立名', '量の選択肢', '栄養の基準',
  'エネルギー(kcal)', 'たんぱく質(g)', '脂質(g)', '炭水化物(g)', '食物繊維(g)', '野菜(g)', '塩分(g)', 'メモ',
];

export const FOOD_TEMPLATE = [
  FOOD_COLUMNS.join(','),
  '市販品,Spaghetti,Rewe,,,100g|150g|200g,100g,356,13,2,72,3,0,0,栄養は100gあたり',
  '市販品,Shin Ramyun,GoAsia,,,1袋|2袋,1袋,500,10,16,79,3,0,4.1,',
  '自作料理,,,パスタ,和風ツナパスタ,100g|150g|200g,100g,,,,,,,,栄養を空欄にすると料理名の既定値を使用',
  '自作料理,,,鍋,鶏団子鍋,0.5人前|1人前|1.5人前,1人前,450,30,16,30,6,250,4.0,',
].join('\r\n');

/**
 * 量の選択肢を倍率つきで解釈する。
 * 基準と同じ単位の数値は比で、'人前' '袋' '個' などの数は数で割る。
 * 例: 基準 100g → '150g' は 1.5。基準 1袋 → '2袋' は 2。
 */
export function parseOptions(spec, base) {
  const baseNum = parseFloat(String(base || '1').replace(/[^0-9.]/g, '')) || 1;
  const baseUnit = String(base || '').replace(/[0-9.\s]/g, '');
  return String(spec || '')
    .split(/[|｜/]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => {
      const num = parseFloat(label.replace(/[^0-9.]/g, ''));
      const unit = label.replace(/[0-9.\s]/g, '');
      const f = Number.isFinite(num) && (!baseUnit || unit === baseUnit) ? num / baseNum : 1;
      return { label, f: Math.round(f * 1000) / 1000 };
    });
}

/** CSV → 品目の配列（不正な行は errors に入れる） */
export function parseFoodsCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { items: [], errors: ['空のファイルです'] };
  const head = rows[0].map((h) => h.trim());
  const idx = (name) => head.indexOf(name);
  const get = (r, name) => (idx(name) >= 0 ? (r[idx(name)] || '').trim() : '');
  const num = (r, name) => {
    const v = get(r, name);
    return v === '' ? null : Number(v.replace(',', '.'));
  };
  const items = [];
  const errors = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const kindText = get(r, '種別');
    const product = get(r, '商品名');
    const menu = get(r, '献立名');
    const kind = /自作|料理|dish/i.test(kindText) || (!product && menu) ? 'dish' : 'product';
    if (kind === 'product' && !product) return errors.push(`${line} 行目: 商品名がありません`);
    if (kind === 'dish' && !menu) return errors.push(`${line} 行目: 献立名がありません`);
    const vals = ['エネルギー(kcal)', 'たんぱく質(g)', '脂質(g)', '炭水化物(g)', '食物繊維(g)', '野菜(g)', '塩分(g)'].map((c) => num(r, c));
    const hasNut = vals.some((v) => v != null);
    if (vals.some((v) => v != null && !Number.isFinite(v))) return errors.push(`${line} 行目: 栄養の数値が読めません`);
    const base = get(r, '栄養の基準') || (kind === 'dish' ? '1人前' : '100g');
    items.push({
      kind,
      name: kind === 'product' ? product : menu,
      seller: get(r, '販売者名'),
      dishType: get(r, '料理名'),
      menuName: menu,
      nutArray: hasNut ? vals.map((v) => v || 0) : null,
      base,
      options: parseOptions(get(r, '量の選択肢'), base),
      note: get(r, 'メモ'),
    });
  });
  return { items, errors };
}
