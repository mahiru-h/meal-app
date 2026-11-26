// in TU cafe（food fakultät のピザ・パスタ）の並び（純粋関数のみ）

export const CAFE_PIZZA = 121;
export const CAFE_PASTA = 120;

const pizzaRank = (m) => (/caprese/i.test(m.name) ? 0 : /margherita/i.test(m.name) ? 1 : 2);

/** "Pizza Caprese: Tomato | Mozzarella" → { title: 'Pizza Caprese', detail: 'Tomato | Mozzarella' } */
export function splitName(m) {
  const full = [m.name, ...(m.with || [])].join(' | ');
  const i = full.indexOf(':');
  const j = full.indexOf('|');
  const cut = i > 0 ? i : j > 0 ? j : -1;
  if (cut < 0) return { title: full.trim(), detail: '' };
  return { title: full.slice(0, cut).trim(), detail: full.slice(cut + 1).replace(/^\s*[|:]\s*/, '').trim() };
}

/** 上にピザ（Caprese → Margherita → その他は価格順）、下にパスタ（価格順） */
export function cafeSections(day) {
  const mains = (day?.mains || []).filter((m) => m.price > 0);
  const byPrice = (a, b) => a.price - b.price || a.name.localeCompare(b.name);
  return {
    pizza: mains.filter((m) => m.catNo === CAFE_PIZZA).sort((a, b) => pizzaRank(a) - pizzaRank(b) || byPrice(a, b)),
    pasta: mains.filter((m) => m.catNo === CAFE_PASTA).sort(byPrice),
  };
}
