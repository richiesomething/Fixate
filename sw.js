/* Fixate service worker.
   - The app shell is precached. Online, it is fetched fresh (so updates show up on the next open);
     if the network is slow (3 s) or offline, the cached copy is used.
   - Books and word lists are saved the first time they're fetched, so anything you've opened works
     offline. They never change for a given VERSION.
   - Google Fonts and pdf.js are cached on first use.
   Bump VERSION whenever books/ or data/ change; shell files update themselves. */
const VERSION = 'v5';
const SHELL = `fixate-shell-${VERSION}`;
const DATA = `fixate-data-${VERSION}`;
const EXTERNAL = 'fixate-external-v1';
const SHELL_FILES = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  const keep = new Set([SHELL, DATA, EXTERNAL]);
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('fixate-') && !keep.has(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, name, e) {
  const cache = await caches.open(name);
  const fresh = fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) e.waitUntil(cache.put(req, res.clone()));
    return res;
  });
  const slow = new Promise(r => setTimeout(r, 3000)).then(() => cache.match(req, { ignoreSearch: true }));
  try {
    const res = await Promise.race([fresh, slow]);
    if (res) return res;
    return await fresh;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw new Error('offline');
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith(networkFirst(new Request('index.html'), SHELL, e).catch(() => caches.match('index.html')));
    } else if (/\/(books|data)\//.test(url.pathname)) {
      e.respondWith(cacheFirst(req, DATA));
    } else {
      e.respondWith(networkFirst(req, SHELL, e));
    }
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(cacheFirst(req, EXTERNAL));
  }
});
