/* ============================================================
   Use-By Hub — Service Worker
   Cache-first for static assets, network-first for API
   ============================================================ */

const CACHE_NAME = 'usebyhub-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Install — pre-cache static assets
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            console.log('[SW] Pre-caching static assets');
            return cache.addAll(STATIC_ASSETS);
        }).catch(function (err) {
            console.log('[SW] Pre-cache failed (non-critical):', err);
        })
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (cacheNames) {
            return Promise.all(
                cacheNames
                    .filter(function (name) { return name !== CACHE_NAME; })
                    .map(function (name) { return caches.delete(name); })
            );
        })
    );
    self.clients.claim();
});

// Fetch — cache-first for static, network-first for API
self.addEventListener('fetch', function (event) {
    var url = new URL(event.request.url);

    // Network-first for API calls
    if (url.hostname === 'world.openfoodfacts.org') {
        event.respondWith(
            fetch(event.request).catch(function () {
                return new Response(JSON.stringify({ status: 0, error: 'offline' }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // Network-first for CDN resources (Tailwind, html5-qrcode, Google Fonts)
    if (url.hostname !== self.location.hostname) {
        event.respondWith(
            fetch(event.request).then(function (response) {
                // Cache CDN resources for offline use
                var responseClone = response.clone();
                caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(event.request, responseClone);
                });
                return response;
            }).catch(function () {
                return caches.match(event.request);
            })
        );
        return;
    }

    // Cache-first for local static assets
    event.respondWith(
        caches.match(event.request).then(function (response) {
            if (response) return response;
            return fetch(event.request).then(function (fetchResponse) {
                var responseClone = fetchResponse.clone();
                caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(event.request, responseClone);
                });
                return fetchResponse;
            });
        }).catch(function () {
            // Fallback for navigation requests
            if (event.request.mode === 'navigate') {
                return caches.match('/index.html');
            }
        })
    );
});
