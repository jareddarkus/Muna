// Offline support. Code is fetched network-first (so updates always win), icons and vendor files cache-first.
const CACHE = 'muna-v2.15.1';
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'vendor/supabase.js', 'assets/icon.svg',
  'js/main.js', 'js/config.js', 'js/util.js', 'js/colors.js', 'js/icons.js', 'js/ui-icons.js', 'js/ui.js', 'js/store.js', 'js/rates.js', 'js/cards.js',
  'js/backend-remote.js', 'js/backend-demo.js', 'js/timer.js', 'js/home.js', 'js/habit.js', 'js/editor.js', 'js/reports.js', 'js/social.js', 'js/group.js',
  'js/profile.js', 'js/hold.js', 'js/calendar.js', 'js/together-panel.js', 'js/invite.js', 'js/together.js', 'js/google-signin.js', 'js/theme.js', 'js/ring-actions.js', 'js/tasks.js', 'js/task-sheet.js', 'js/task-editor.js', 'js/task-actions.js', 'js/habit-actions.js', 'js/account.js', 'js/cropper.js', 'js/version.js', 'js/push.js', 'js/updates.js',
  'fonts/lexend-latin-400.woff2', 'fonts/lexend-latin-700.woff2'];

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
  const cacheFirst = /\/(icons|vendor|assets|fonts)\//.test(url.pathname);
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

// ───────────── push notifications ─────────────
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: 'Muna', body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Muna', {
    body: data.body || 'Time to check in.',
    icon: 'assets/icon-192.png',
    badge: 'assets/icon-192.png',
    tag: data.tag || 'muna',
    data: { url: data.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
    return self.clients.openWindow(target);
  }));
});
