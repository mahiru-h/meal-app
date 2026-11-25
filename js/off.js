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

async function query(terms) {
  const params = new URLSearchParams({
    search_terms: terms,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '24',
    fields: 'code,product_name,product_name_de,product_name_en,brands,stores,nutriments,serving_quantity,product_quantity,quantity',
  });
  const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`);
  if (!res.ok) throw new Error(`Open Food Facts: ${res.status}`);
  const j = await res.json();
  return (j.products || []).filter((p) => p.nutriments && (p.nutriments['energy-kcal_100g'] != null || p.nutriments.energy_100g != null));
}

/** 商品名（大まか）と販売者名で検索し、近い順に返す */
export async function searchProducts(name, seller) {
  let products = await query(name);
  if (seller && !products.some((p) => sellerMatch(seller, p) > 0)) {
    try {
      products = [...(await query(`${name} ${seller}`)), ...products];
    } catch { /* 2 回目の失敗は無視 */ }
  }
  const seen = new Set();
  return products
    .filter((p) => (seen.has(p.code) ? false : seen.add(p.code)))
    .map((p) => {
      const title = p.product_name_de || p.product_name || p.product_name_en || '';
      const score = matchScore(name, title) * 0.6 + sellerMatch(seller, p) * 0.4 + (title ? 0 : -1);
      return { p, title, score };
    })
    .filter((x) => x.title)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
}
