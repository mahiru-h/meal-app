// Open Food Facts（無料・キー不要）での商品検索
import { matchScore, normalize } from './logic/suggest.js';

// 店名 → その店のプライベートブランド（販売者名から絞り込むため）
const STORE_BRANDS = {
  rewe: ['rewe', 'ja!', 'rewe bio', 'rewe beste wahl', 'rewe feine welt'],
  lidl: ['lidl', 'milbona', 'combino', 'pilos', 'chef select', 'deluxe', 'vitasia', 'crownfield', 'freeway', 'snack day', 'solevita', 'trattoria alfredo', 'vemondo', 'grünländer', 'kania', 'w5', 'dulano', 'nixe', 'sondey', 'belbake', 'bellarom', 'fin carré', 'favorina', 'alesto', 'golden seafood', 'cien', 'gut bio', 'ocean sea', 'lord nelson', 'eridanous', 'baresa', 'chef select & you'],
  aldi: ['aldi', 'milsani', 'gut & günstig', 'moser roth', 'choceur', 'golden bridge', 'cucina nobile', 'lyttos', 'bio', 'meine metzgerei', 'asia green garden', 'sweet valley', 'rio d\'oro', 'kokett', 'ombra', 'gut bio', 'goldähren'],
  edeka: ['edeka', 'gut & günstig', 'edeka bio'],
  netto: ['netto', 'gut bio', 'mühlenhof'],
  penny: ['penny', 'naturgut', 'penny ready'],
  kaufland: ['kaufland', 'k-classic', 'k-bio', 'k-free'],
  dm: ['dm', 'dmbio'],
  rossmann: ['rossmann', 'enerbio'],
};

function sellerMatch(seller, product) {
  if (!seller) return 0;
  const s = normalize(seller);
  const brands = (product.brands || '').toLowerCase();
  const stores = (product.stores || '').toLowerCase();
  if (normalize(brands).includes(s) || normalize(stores).includes(s)) return 1;
  const list = STORE_BRANDS[s] || [];
  return list.some((b) => brands.split(',').map((x) => x.trim()).includes(b)) ? 0.8 : 0;
}

const toKata = (s) => s.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
const toHira = (s) => s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

/**
 * 日本語はひらがな・カタカナの表記ゆれを補って検索する（最大 3 通り）。
 * 例: 「さとうのごはん」→「サトウのごはん」（「の」より前をカタカナに）も検索する
 */
export function queryVariants(name) {
  const v = [name];
  const i = name.indexOf('の');
  if (i > 0) {
    v.push(toKata(name.slice(0, i)) + name.slice(i));
    v.push(toHira(name.slice(0, i)) + name.slice(i));
  }
  if (/[\u3041-\u3096]/.test(name)) v.push(toKata(name));
  if (/[\u30a1-\u30f6]/.test(name)) v.push(toHira(name));
  return [...new Set(v)].slice(0, 3);
}

export class BusyError extends Error {}

const FIELDS = 'code,product_name,product_name_de,product_name_en,product_name_ja,brands,stores,countries_tags,categories_tags,nutriments,serving_quantity,product_quantity,quantity';
const hasCJK = (s) => /[぀-ヿ一-鿿]/.test(s);

/** タイムアウト付きで JSON を取得。失敗（通信エラー・混雑時の 503・HTML）は null */
async function fetchJson(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return JSON.parse(await res.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Open Food Facts の検索 API（search.openfoodfacts.org）
// ※ 従来の cgi/search.pl は github.io 上のアプリからの通信を受け付けない（すぐに Load failed になる）ため使わない
async function searchNew(q) {
  const j = await fetchJson(`https://search.openfoodfacts.org/search?${new URLSearchParams({ q, page_size: '30', fields: FIELDS })}`);
  return j ? (j.hits || []).map(normalizeHit) : null;
}

/** 新しい API では brands などが配列（"xx:knorr" のような接頭辞つき）で返るため、文字列にそろえる */
export function normalizeHit(p) {
  const str = (v) => (Array.isArray(v) ? v.join(', ') : String(v || '')).replace(/(^|,\s*)[a-z]{2}:/g, '$1');
  return { ...p, brands: str(p.brands), stores: str(p.stores) };
}

/** 日本語: 商品名とブランド名の両方を、表記ゆれも含めて 1 回で検索する */
export function japaneseQuery(name) {
  const parts = [];
  for (const v of queryVariants(name)) parts.push(`"${v}"`, `brands:"${v}"`);
  const i = name.indexOf('の');
  if (i > 0) {
    const maker = name.slice(0, i);
    for (const m of new Set([toKata(maker), maker])) parts.push(`brands:"${m}食品"`, `brands:"${m}"`);
  }
  return [...new Set(parts)].join(' OR ');
}

/** 1 商品の詳細（検索結果に栄養が入っていない場合に使う） */
export async function fetchProduct(code) {
  const j = await fetchJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  return j && j.product ? { code, ...j.product } : null;
}

export const kcalOf = (p) => {
  const n = p.nutriments || {};
  if (n['energy-kcal_100g'] != null) return Number(n['energy-kcal_100g']);
  if (n.energy_100g != null) return Number(n.energy_100g) / 4.184;
  return null;
};

/** 商品名（大まか）と販売者名で検索し、近い順に返す */
export async function searchProducts(name, seller) {
  const found = [];
  let anyOk = false;
  const add = (list) => { if (list) { anyOk = true; found.push(...list); } };

  const cjk = hasCJK(name);
  if (cjk) {
    add(await searchNew(japaneseQuery(name)));
  } else {
    if (seller) add(await searchNew(`${name} ${seller}`));
    if (found.length < 5) add(await searchNew(name));
  }
  if (!anyOk) throw new BusyError('検索サーバーにつながりませんでした。電波の良い場所で「再検索」を押してください。');

  const seen = new Set();
  const variants = queryVariants(name);
  const home = cjk ? 'en:japan' : 'en:germany';
  return found
    .filter((p) => p.code && (seen.has(p.code) ? false : seen.add(p.code)))
    .map((p) => {
      const title = p.product_name_de || p.product_name || p.product_name_en || p.product_name_ja || '';
      const kcal = kcalOf(p);
      const score = Math.max(...variants.map((v) => matchScore(v, `${title} ${p.brands || ''}`))) * 0.6
        + sellerMatch(seller, p) * 0.4
        + ((p.countries_tags || []).includes(home) ? 0.1 : 0)
        + (kcal != null ? 0.05 : 0);
      return { p, title, kcal, score };
    })
    .filter((x) => x.title)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}
