// Service Worker: アプリ本体は端末にキャッシュしてオフラインでも起動できるようにする
// アプリを更新したら VERSION を変える（js/version.js も合わせる）
const VERSION = 'v1.0.6';
const CACHE = `meal-app-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/store.js',
  'js/sync.js',
  'js/off.js',
  'js/ui.js',
  'js/version.js',
  'js/logic/dates.js',
  'js/logic/nutrition.js',
  'js/logic/mensa.js',
  'js/logic/suggest.js',
  'js/logic/recommend.js',
  'js/logic/prefs.js',
  'js/logic/csv.js',
  'js/logic/model.js',
  'js/views/calendar.js',
  'js/views/day.js',
  'js/views/group.js',
  'js/views/mensa.js',
  'js/views/entry.js',
  'js/views/amount.js',
  'js/views/edit.js',
  'js/views/recommend.js',
  'js/views/prefs.js',
  'js/views/settings.js',
  'data/dishes.json',
  'data/foods.json',
  'data/recipes.json',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // Open Food Facts などはそのまま

  // Mensa のメニューはアプリ側で IndexedDB に保存するので、ここではネットワークのみ
  if (url.pathname.includes('/data/mensa/')) return;

  // 画面遷移は index.html を返す
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }

  // それ以外はキャッシュ優先
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
