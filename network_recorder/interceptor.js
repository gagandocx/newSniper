/**
 * Intercepts ALL fetch/XHR requests on Amazon hiring pages.
 * Runs in MAIN world so it can override fetch() and XMLHttpRequest.
 * Stores captured data in window.__recorder array for the popup to read.
 */
(function() {
    'use strict';
    if (window.__recorderInjected) return;
    window.__recorderInjected = true;
    window.__recorderData = [];
    
    console.log('[recorder] Interceptor active on:', window.location.href);
    
    // ── Intercept fetch() ────────────────────────────────────────────────────
    var _origFetch = window.fetch;
    window.fetch = async function() {
        var url = (typeof arguments[0] === 'string') ? arguments[0] : (arguments[0] && arguments[0].url) || '';
        var options = arguments[1] || {};
        var method = options.method || 'GET';
        var body = null;
        
        if (options.body) {
            if (typeof options.body === 'string') body = options.body;
            else { try { body = JSON.stringify(options.body); } catch(_) { body = '[non-string body]'; } }
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
            timestamp: Date.now(),
            type: 'fetch',
            method: method,
            url: url,
            requestHeaders: headers,
            requestBody: body,
            requestBodyParsed: null
        };
        try { if (body) entry.requestBodyParsed = JSON.parse(body); } catch(_) {}
        
        // Call original
        var response;
        try {
            response = await _origFetch.apply(this, arguments);
        } catch(err) {
            entry.error = err.message;
            window.__recorderData.push(entry);
            throw err;
        }
        
        entry.responseStatus = response.status;
        entry.responseUrl = response.url;
        
        // Capture response body for API calls
        if (url.includes('graphql') || url.includes('/api/') || url.includes('appsync') || url.includes('/application')) {
            try {
                var clone = response.clone();
                var text = await clone.text();
                entry.responseBody = text;
                try { entry.responseBodyParsed = JSON.parse(text); } catch(_) {}
            } catch(_) {}
        }
        
        window.__recorderData.push(entry);
        return response;
    };
    
    // ── Intercept XMLHttpRequest ──────────────────────────────────────────────
    var _origOpen = XMLHttpRequest.prototype.open;
    var _origSend = XMLHttpRequest.prototype.send;
    var _origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    
    XMLHttpRequest.prototype.open = function(method, url) {
        this.__rec = { method: method, url: url, headers: {} };
        return _origOpen.apply(this, arguments);
    };
    
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        if (this.__rec) this.__rec.headers[name] = value;
        return _origSetHeader.apply(this, arguments);
    };
    
    XMLHttpRequest.prototype.send = function(body) {
        var self = this;
        if (this.__rec) {
            this.__rec.requestBody = (typeof body === 'string') ? body : null;
            try { if (body) this.__rec.requestBodyParsed = JSON.parse(body); } catch(_) {}
        }
        
        this.addEventListener('load', function() {
            if (!self.__rec) return;
            var entry = {
                timestamp: Date.now(),
                type: 'xhr',
                method: self.__rec.method,
                url: self.__rec.url,
                requestHeaders: self.__rec.headers,
                requestBody: self.__rec.requestBody,
                requestBodyParsed: self.__rec.requestBodyParsed,
                responseStatus: self.status,
                responseBody: null
            };
            if (self.__rec.url && (self.__rec.url.includes('graphql') || self.__rec.url.includes('/api/'))) {
                entry.responseBody = self.responseText;
                try { entry.responseBodyParsed = JSON.parse(self.responseText); } catch(_) {}
            }
            window.__recorderData.push(entry);
        });
        
        return _origSend.apply(this, arguments);
    };
    // At the end, also store data in a DOM element for easy retrieval
    setInterval(function() {
        try {
            var el = document.getElementById('__recorder_data');
            if (!el) {
                el = document.createElement('div');
                el.id = '__recorder_data';
                el.style.display = 'none';
                document.body.appendChild(el);
            }
            el.setAttribute('data-count', window.__recorderData.length);
            el.textContent = JSON.stringify(window.__recorderData);
        } catch(_) {}
    }, 2000);
})();
