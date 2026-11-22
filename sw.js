/* Kuro Reader Cloudflare Worker v28: HTML, CSS, JS, EPUB engine offline cache. */
const CACHE_NAME = 'drive-novel-reader-v37-cloudflare-sync-20261122';
const EPUB_RUNTIME_URL = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';
const APP_SHELL = [
  './', './index.html', './style.css', './worker_client.js', './app.js',
  './manifest.webmanifest', './manifest-android.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    try { await cache.add(EPUB_RUNTIME_URL); }
    catch (error) { console.warn('EPUB 오프라인 엔진 캐싱 대기', error); }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k =>
      k.startsWith('drive-novel-reader-') && k !== CACHE_NAME
    ).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.href.split('?')[0] === EPUB_RUNTIME_URL) {
    event.respondWith((async () => {
      const cached = await caches.match(EPUB_RUNTIME_URL);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(EPUB_RUNTIME_URL, response.clone());
      }
      return response;
    })());
    return;
  }
  if (url.origin !== self.location.origin) return;
  const shellPaths = APP_SHELL.map(file => new URL(file, self.registration.scope).pathname);
  const isShell = request.mode === 'navigate' || shellPaths.includes(url.pathname);
  event.respondWith((async () => {
    // Application code is network-first. This prevents old PWA caches from
    // serving last week's settings logic to a freshly opened private window.
    const networkFirst = isShell && (request.mode === 'navigate' ||
      /\.(?:js|html)$/i.test(url.pathname));
    if (isShell && !networkFirst) {
      const cached = await caches.match(request, {ignoreSearch:true});
      if (cached) return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request, {ignoreSearch:true});
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const home = await caches.match('./index.html');
        if (home) return home;
      }
      throw error;
    }
  })());
});
