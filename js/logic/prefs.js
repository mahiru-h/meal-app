// 好み設定の選択肢（純粋データ）

export const AREAS = [
  { id: 'de', label: 'ドイツ' },
  { id: 'jp', label: '日本' },
  { id: 'other', label: 'その他' },
];

export const CUISINES = [
  { id: 'jp', label: '日本' },
  { id: 'it', label: 'イタリア' },
  { id: 'cn', label: '中国（ガチ中華）' },
  { id: 'cnjp', label: '中国（日本流）' },
  { id: 'de', label: 'ドイツ' },
  { id: 'other', label: 'その他' },
];

// 好きな食べ物・その日食べたい物の共通選択肢（id はレシピの tags と対応）
export const FOODS = [
  { id: 'ramen', label: '具なしラーメン（袋麺）' },
  { id: 'wafu_pasta', label: '和風パスタ' },
  { id: 'pasta', label: 'パスタ' },
  { id: 'nabe', label: '鍋' },
  { id: 'udon', label: 'うどん・そば' },
  { id: 'rice_bowl', label: '丼もの' },
  { id: 'curry', label: 'カレー' },
  { id: 'fried_rice', label: '炒飯' },
  { id: 'gyoza', label: '餃子' },
  { id: 'stirfry', label: '炒め物' },
  { id: 'tofu', label: '豆腐料理' },
  { id: 'soup', label: 'スープ' },
  { id: 'bread', label: 'パン' },
  { id: 'meat', label: '肉料理' },
  { id: 'fish', label: '魚料理（加熱）' },
  { id: 'light', label: 'さっぱりしたもの' },
];

export const DEFAULT_TEMPLATE = {
  area: 'de',
  cuisines: ['jp'],
  likes: ['ramen', 'wafu_pasta'],
  wants: ['pasta', 'nabe'],
};

export const TIMINGS = [
  { id: 'breakfast', label: '朝食', short: '朝' },
  { id: 'lunch', label: '昼食', short: '昼' },
  { id: 'dinner', label: '夕食', short: '夕' },
  { id: 'snack', label: '間食', short: '間' },
];
export const timingLabel = (id) => TIMINGS.find((t) => t.id === id)?.label || id;

export const GROUPS = [
  { id: 'mensa', label: 'in Mensa', only: 'lunch' },
  { id: 'home', label: 'in Home' },
  { id: 'others', label: 'others（外食・パン屋・コンビニ・友人宅など）' },
];

// 除外する食材（レシピの contains と対応）。既定はすべてオン
export const EXCLUSIONS = [
  { id: 'onion', label: '玉ねぎ' },
  { id: 'negi', label: 'ねぎ' },
  { id: 'eggplant', label: '茄子' },
  { id: 'mushroom', label: 'きのこ' },
  { id: 'raw_fish', label: '生魚' },
  { id: 'soft_egg', label: '半熟卵・温泉卵・生卵' },
  { id: 'bone_meat', label: '骨付き肉' },
  { id: 'fatty_meat', label: '脂の多い肉' },
];

// 「気分じゃない」理由
export const MOODS = [
  { id: 'heavy', label: '重い（軽めがいい）' },
  { id: 'light', label: 'さっぱり系がいい' },
  { id: 'noodle', label: '麺の気分' },
  { id: 'rice', label: 'ご飯の気分' },
  { id: 'bread', label: 'パンの気分' },
  { id: 'warm', label: '温かいもの' },
  { id: 'cold', label: '冷たいもの' },
  { id: 'quick', label: '時間がない' },
  { id: 'nocook', label: '料理したくない' },
  { id: 'cheap', label: 'お金をかけたくない' },
  { id: 'meat', label: '肉の気分' },
  { id: 'fish', label: '魚の気分' },
  { id: 'veggie', label: '野菜たっぷり' },
  { id: 'norice', label: 'ご飯を炊いていない' },
];
