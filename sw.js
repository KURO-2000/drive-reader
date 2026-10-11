/* v10: PWA 앱 화면과 EPUB 엔진을 오프라인에서 실행하도록 보관합니다. */
const CACHE_NAME = 'drive-novel-reader-v11-flip-brightness-20261012';
const EPUB_RUNTIME_URL = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';
const APP_SHELL = [
  './', './index.html', './style.css', './app.js',
  './manifest.webmanifest', './manifest-android.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    // 사이트가 기존에 CDN에서 EPUB 라이브러리를 사용하기 때문에 함께 저장합니다.
    // 일시적인 CDN 오류만으로 앱 설치까지 실패시키지는 않습니다.
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
  event.respondWith((async () => {
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
      // 오프라인에서 앱 URL의 쿼리가 달라도 진입 가능하게 합니다.
      if (request.mode === 'navigate') {
        const home = await caches.match('./index.html');
        if (home) return home;
      }
      throw error;
    }
  })());
});
