// Service Worker for Nintendo News Network PWA
// Provides efficient caching for better performance and offline functionality

const CACHE_NAME = 'nintendo-news-v4'; // Updated version for minified assets
const STATIC_CACHE = 'nintendo-news-static-v4';
const IMAGES_CACHE = 'nintendo-news-images-v4';
const RSS_CACHE = 'nintendo-news-rss-v4';

// Cache lifetimes (in milliseconds)
const CACHE_LIFETIMES = {
    STATIC: 30 * 24 * 60 * 60 * 1000,  // 30 days
    IMAGES: 7 * 24 * 60 * 60 * 1000,   // 7 days
    RSS: 5 * 60 * 1000                 // 5 minutes
};
const STATIC_ASSETS = [
    './',
    './index.html',
    './index.prod.html',
    './styles/main.css?v=2.1',
    './styles/critical.css',
    './scripts/main.js?v=2.1',
    './scripts/main.min.js?v=2.1',
    './scripts/app-init.js',
    './scripts/app-init.min.js',
    './scripts/service-worker.min.js',
    './manifest.json',
    './browserconfig.xml',
    './images/favicon.ico',
    './images/favicon-16x16.png',
    './images/favicon-32x32.png',
    './images/icon-72x72.png',
    './images/icon-96x96.png',
    './images/icon-128x128.png',
    './images/icon-144x144.png',
    './images/icon-152x152.png',
    './images/icon-180x180.png',
    './images/icon-192x192.png',
    './images/icon-384x384.png',
    './images/icon-512x512.png',
    './images/icon-1024x1024.png'
];

// Install event - cache static assets with efficient caching
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(function(cache) {
                return cache.addAll(STATIC_ASSETS);
            })
            .catch(function(error) {
                // Cache installation failed
            })
    );
    self.skipWaiting(); // Activate immediately
});

// Activate event - clean up old caches
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    // Delete any cache that doesn't match current version
                    if (!cacheName.includes('v3')) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim(); // Take control of existing clients
});

// Utility function to check if cached item is still fresh
function isCacheFresh(response, maxAge) {
    if (!response) return false;
    const cachedTime = response.headers.get('sw-cache-time');
    if (!cachedTime) return false;
    return (Date.now() - parseInt(cachedTime)) < maxAge;
}

// Add cache timestamp to response
async function addCacheTimestamp(response) {
    const blob = await response.blob();
    const newHeaders = new Headers(response.headers);
    newHeaders.set('sw-cache-time', Date.now().toString());
    return new Response(blob, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
    });
}

// Fetch event - efficient caching strategies
self.addEventListener('fetch', function(event) {
    const request = event.request;
    const url = new URL(request.url);

    // Static assets - Cache-first with long TTL (30 days)
    // Handle both versioned and non-versioned static assets, including minified files
    const isStaticAsset = STATIC_ASSETS.some(asset => request.url.endsWith(asset)) ||
                         request.url.match(/\/(styles\/.*\.css|scripts\/.*\.m?i?n?\.?js)(\?v=[\d.]+)?$/);

    if (isStaticAsset) {
        event.respondWith(
            caches.open(STATIC_CACHE).then(async function(cache) {
                return cache.match(request).then(async function(cachedResponse) {
                    if (cachedResponse && isCacheFresh(cachedResponse, CACHE_LIFETIMES.STATIC)) {
                        return cachedResponse;
                    }

                    return fetch(request).then(async function(networkResponse) {
                        if (networkResponse.status === 200) {
                            const clonedResponse = networkResponse.clone();
                            cache.put(request, await addCacheTimestamp(clonedResponse));
                        }
                        return networkResponse;
                    }).catch(function() {
                        return cachedResponse; // Return stale cache if network fails
                    });
                });
            })
        );
        return;
    }

    // External images - Cache with 7-day TTL
    if (request.destination === 'image' ||
        url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {

        event.respondWith(
            caches.open(IMAGES_CACHE).then(async function(cache) {
                return cache.match(request).then(async function(cachedResponse) {
                    if (cachedResponse && isCacheFresh(cachedResponse, CACHE_LIFETIMES.IMAGES)) {
                        return cachedResponse;
                    }

                    return fetch(request).then(async function(networkResponse) {
                        if (networkResponse.status === 200) {
                            const clonedResponse = networkResponse.clone();
                            cache.put(request, await addCacheTimestamp(clonedResponse));
                        }
                        return networkResponse;
                    }).catch(function() {
                        return cachedResponse; // Return cached version if network fails
                    });
                });
            })
        );
        return;
    }

    // RSS feeds and API calls - Network-first with short cache (5 minutes)
    if (request.url.includes('corsproxy.io') ||
        request.url.includes('codetabs.com') ||
        request.url.includes('thingproxy.freeboard.io') ||
        request.url.includes('allorigins.win')) {

        event.respondWith(
            fetch(request)
                .then(async function(response) {
                    if (response.status === 200) {
                        caches.open(RSS_CACHE).then(async function(cache) {
                            const clonedResponse = response.clone();
                            cache.put(request, await addCacheTimestamp(clonedResponse));
                        });
                    }
                    return response;
                })
                .catch(function() {
                    // Fallback to cache when network fails
                    return caches.open(RSS_CACHE).then(function(cache) {
                        return cache.match(request);
                    });
                })
        );
        return;
    }

    // Default strategy for other requests
    event.respondWith(
        caches.match(request).then(function(response) {
            return response || fetch(request);
        })
    );
});

// Periodic cache cleanup - run every hour
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'CLEAN_CACHE') {
        cleanupExpiredCache();
    }
});

// Clean up expired cache entries
async function cleanupExpiredCache() {
    const cacheNames = [
        { name: STATIC_CACHE, maxAge: CACHE_LIFETIMES.STATIC },
        { name: IMAGES_CACHE, maxAge: CACHE_LIFETIMES.IMAGES },
        { name: RSS_CACHE, maxAge: CACHE_LIFETIMES.RSS }
    ];

    for (const { name, maxAge } of cacheNames) {
        try {
            const cache = await caches.open(name);
            const requests = await cache.keys();

            for (const request of requests) {
                const response = await cache.match(request);
                if (response && !isCacheFresh(response, maxAge)) {
                    await cache.delete(request);
                }
            }
        } catch (error) {
            // Cache cleanup error
        }
    }
}

// Schedule cache cleanup every hour
setInterval(() => {
    cleanupExpiredCache();
}, 60 * 60 * 1000);