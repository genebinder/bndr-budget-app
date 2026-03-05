// BNDR Budget — Service Worker for offline caching
var CACHE_NAME = 'bndr-budget-v9';
var ASSETS = ['./', './index.html', './manifest.json'];

// Install: cache core assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean ALL old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: NETWORK FIRST, fall back to cache (ensures latest version)
self.addEventListener('fetch', function(event) {
  event.respondWith(
    fetch(event.request).then(function(networkResponse) {
      if (networkResponse && networkResponse.status === 200) {
        var responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseClone);
        });
      }
      return networkResponse;
    }).catch(function() {
      return caches.match(event.request);
    })
  );
});
