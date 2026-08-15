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


// ── API FLOW RECORDER ─────────────────────────────────────────────────────
// Captures all fetch/XHR requests to Amazon during the apply flow.
// Data stored in window.__recorderData — accessible from console.
// Only records requests to hiring.amazon.ca/graphql and /application/ URLs.
// To retrieve: open console → JSON.stringify(window.__recorderData)
(function() {
    'use strict';
    if (window.__recorderInjected) return;
    window.__recorderInjected = true;
    window.__recorderData = [];

    var _origFetch = window.fetch;
    window.fetch = async function() {
        var url = (typeof arguments[0] === 'string') ? arguments[0] : (arguments[0] && arguments[0].url) || '';
        var options = arguments[1] || {};
        var method = options.method || 'GET';

        // Only record Amazon API calls (not analytics, fonts, etc)
        var isRelevant = url.includes('graphql') || url.includes('/application') || url.includes('/api/');
        if (!isRelevant) return _origFetch.apply(this, arguments);

        var body = null;
        if (options.body) {
            if (typeof options.body === 'string') body = options.body;
            else { try { body = JSON.stringify(options.body); } catch(_) {} }
        }

        var headers = {};
        if (options.headers) {
            if (options.headers instanceof Headers) {
                options.headers.forEach(function(v, k) { headers[k] = v; });
            } else {
                headers = options.headers;
            }
        }

        var entry = {
            t: Date.now(),
            method: method,
            url: url,
            reqHeaders: headers,
            reqBody: body
        };
        try { if (body) entry.reqParsed = JSON.parse(body); } catch(_) {}

        var response;
        try {
            response = await _origFetch.apply(this, arguments);
        } catch(err) {
            entry.error = err.message;
            window.__recorderData.push(entry);
            throw err;
        }

        entry.status = response.status;

        // Capture response body
        try {
            var clone = response.clone();
            var text = await clone.text();
            entry.resBody = text;
            try { entry.resParsed = JSON.parse(text); } catch(_) {}
        } catch(_) {}

        window.__recorderData.push(entry);
        return response;
    };

    // Also intercept XHR
    var _origOpen = XMLHttpRequest.prototype.open;
    var _origSend = XMLHttpRequest.prototype.send;
    var _origSetH = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function(m, u) {
        this.__r = { method: m, url: u, h: {} };
        return _origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(n, v) {
        if (this.__r) this.__r.h[n] = v;
        return _origSetH.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(body) {
        var self = this;
        var isRelevant = self.__r && self.__r.url && (self.__r.url.includes('graphql') || self.__r.url.includes('/application'));
        if (!isRelevant) return _origSend.apply(this, arguments);

        if (this.__r) this.__r.body = (typeof body === 'string') ? body : null;
        this.addEventListener('load', function() {
            if (!self.__r) return;
            var entry = {
                t: Date.now(),
                method: self.__r.method,
                url: self.__r.url,
                reqHeaders: self.__r.h,
                reqBody: self.__r.body,
                status: self.status,
                resBody: self.responseText
            };
            try { entry.resParsed = JSON.parse(self.responseText); } catch(_) {}
            window.__recorderData.push(entry);
        });
        return _origSend.apply(this, arguments);
    };

    console.log('[recorder] API flow recorder active — window.__recorderData');
})();
