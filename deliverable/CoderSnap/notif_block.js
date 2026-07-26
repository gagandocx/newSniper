// ── Notification Permission Blocker ──────────────────────────────
// Runs in MAIN world at document_start — before Amazon's page code
// Silently overrides requestPermission so the prompt NEVER appears
// User never misses a shift due to a permission popup
(function() {
    if (typeof Notification === 'undefined') return;
    var _orig = Notification.requestPermission.bind(Notification);
    Notification.requestPermission = function() {
        return Promise.resolve('default');
    };
    var _OrigNotif = Notification;
    try {
        Object.defineProperty(window, 'Notification', {
            get: function() { return _OrigNotif; },
            configurable: true
        });
    } catch(e) {}
})();

// ── Amazon Auth Token Interceptor ─────────────────────────────────
// Runs in MAIN world — captures the Bearer JWT that Amazon's own SPA
// sends to hiring.amazon.ca/graphql and saves it to localStorage so
// our content script (fetch.js) can include it in extension requests.
// Without this token the graphql endpoint returns 401 Unauthorized.
(function() {
    'use strict';
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    var _origFetch = window.fetch;
    window.fetch = function(url, opts) {
        try {
            if (opts && opts.headers) {
                var h = opts.headers;
                var auth = '';
                // Handle both Headers object and plain object
                if (h && typeof h.get === 'function') {
                    auth = h.get('authorization') || h.get('Authorization') || '';
                } else if (h && typeof h === 'object') {
                    auth = h['authorization'] || h['Authorization'] || '';
                }
                // Only save real Bearer tokens (Amazon's format: "Bearer Status|logged-in|Session|eyJ...")
                if (auth && auth.length > 80 && auth.toLowerCase().startsWith('bearer')) {
                    try {
                        localStorage.setItem('__ss_auth', auth);
                        // Also save timestamp so fetch.js knows when it was captured
                        localStorage.setItem('__ss_auth_ts', String(Date.now()));
                    } catch(_) {}
                }
            }
        } catch(_) {}
        return _origFetch.apply(this, arguments);
    };
})();
