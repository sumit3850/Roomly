// Roomly service worker: makes the app installable and opens it offline (last loaded version).
const CACHE = 'roomly-v2'
const scope = self.registration.scope
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([scope, scope + 'manifest.webmanifest'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return // never cache Supabase/API traffic
  if (req.mode === 'navigate') {
    // pages: network first, fall back to the cached app shell
    e.respondWith(fetch(req).then((res) => { if (res.ok && url.pathname === new URL(scope).pathname) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(scope, copy)) } return res }).catch(() => caches.match(scope)))
    return
  }
  if (url.pathname.includes('/assets/') || url.pathname.includes('/icons/')) {
    // hashed build files: cache first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) } return res })))
  }
})
