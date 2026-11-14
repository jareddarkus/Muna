// Offline support. Code is fetched network-first (so updates always win), icons and vendor files cache-first.
const CACHE = 'muna-v1';
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'vendor/supabase.js', 'assets/icon.svg',
  'js/main.js', 'js/config.js', 'js/util.js', 'js/colors.js', 'js/icons.js', 'js/ui-icons.js', 'js/ui.js', 'js/store.js',
  'js/backend-remote.js', 'js/backend-demo.js', 'js/timer.js', 'js/home.js', 'js/focus.js', 'js/editor.js', 'js/stats.js',
  'js/settings.js', 'js/image.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const nav = req.mode === 'navigate';
  const key = nav ? new Request(new URL('./', self.registration.scope).href) : req;
  const cacheFirst = /\/(icons|vendor|assets)\//.test(url.pathname);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(key);
    if (cacheFirst && hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(key, res.clone());
      return res;
    } catch (err) {
      if (hit) return hit;
      throw err;
    }
  })());
});
