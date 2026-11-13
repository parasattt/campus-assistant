/* Cache the bundled Campus Assistant page, without intercepting other sites. */
'use strict';

const scriptURL = new URL(self.location.href);
const scopeURL = new URL(self.registration.scope);
const appURL = new URL(scriptURL.searchParams.get('app') || 'SDU_Navigator.html', scopeURL);
appURL.search = '';
appURL.hash = '';
if (appURL.origin !== scopeURL.origin || !appURL.pathname.startsWith(scopeURL.pathname)) {
  throw new Error('The app must be inside the service worker scope.');
}

const cachePrefix = 'sdunav-shell:' + encodeURIComponent(appURL.pathname) + ':';
const cacheName = cachePrefix + 'v1';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(new Request(appURL.href, {cache: 'reload'}));
    if (!response.ok) throw new Error('Unable to cache the app page.');
    const cache = await caches.open(cacheName);
    await cache.put(appURL.href, response);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(cachePrefix) && name !== cacheName).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function appNavigation(request) {
  let cache = null;
  try { cache = await caches.open(cacheName); } catch (_) { /* Online navigation can still work. */ }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(request, {signal: controller.signal});
    if (response.ok) {
      try { if (cache) await cache.put(appURL.href, response.clone()); } catch (_) { /* Keep the previous copy if storage is full. */ }
      return response;
    }
    try { if (cache) return await cache.match(appURL.href) || response; } catch (_) { /* Return the network response. */ }
    return response;
  } catch (error) {
    try { if (cache) { const saved = await cache.match(appURL.href); if (saved) return saved; } } catch (_) { /* Rethrow the network error. */ }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method === 'GET' && event.request.mode === 'navigate' && url.origin === appURL.origin && url.pathname === appURL.pathname) {
    event.respondWith(appNavigation(event.request));
  }
});
