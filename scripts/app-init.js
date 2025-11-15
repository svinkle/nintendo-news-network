// App initialization and performance-critical code
// This file handles font loading, service worker registration, and performance monitoring

// Progressive font loading for better performance
function initializeFontLoading() {
    if ('fonts' in document) {
        Promise.all([
            document.fonts.load('400 1em "Noto Sans"'),
            document.fonts.load('700 1em "Noto Sans"'),
            document.fonts.load('1em "Press Start 2P"')
        ]).then(function() {
            document.documentElement.classList.add('fonts-loaded');
        }).catch(function() {
            // Fallback - add class anyway after timeout
            setTimeout(function() {
                document.documentElement.classList.add('fonts-loaded');
            }, 3000);
        });
    } else {
        // Fallback for browsers without Font Loading API
        setTimeout(function() {
            document.documentElement.classList.add('fonts-loaded');
        }, 1000);
    }
}

// Service Worker registration
function initializeServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('scripts/service-worker.js')
                .then(function(registration) {
                    // ServiceWorker registered successfully
                })
                .catch(function(registrationError) {
                    // ServiceWorker registration failed
                });
        });
    } else if (window.location.protocol === 'file:') {
        // ServiceWorker not available for file:// protocol
    }
}

// Performance monitoring
function initializePerformanceMonitoring() {
    window.addEventListener('load', function() {
        if ('performance' in window) {
            setTimeout(function() {
                // Performance metrics collected
                const perfData = performance.getEntriesByType('navigation')[0];
                const paintEntries = performance.getEntriesByType('paint');
                const fp = paintEntries.find(entry => entry.name === 'first-paint');
                const fcp = paintEntries.find(entry => entry.name === 'first-contentful-paint');
            }, 1000);
        }
    });
}

// Favicon refresh helper - forces browser to reload favicon
function refreshFavicon() {
    var link = document.querySelector("link[rel*='icon']");
    if (link) {
        var href = link.href;
        // Only add cache busting for non-file protocols
        if (window.location.protocol !== 'file:') {
            link.href = href + '?v=' + Date.now();
        }
    }
}

// Initialize favicon refresh
function initializeFaviconRefresh() {
    window.addEventListener('load', function() {
        setTimeout(refreshFavicon, 100);
    });
}

// Initialize all performance-critical features
function initializeApp() {
    initializeFontLoading();
    initializeServiceWorker();
    initializePerformanceMonitoring();
    initializeFaviconRefresh();
}

// Auto-initialize when script loads
initializeApp();