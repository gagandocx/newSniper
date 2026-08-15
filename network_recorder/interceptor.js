/**
 * Content script injected into Amazon pages to capture request/response BODIES.
 * webRequest API in MV3 can't capture response bodies, so this intercepts
 * fetch() and XMLHttpRequest at the page level.
 */
(function() {
    'use strict';
    
    if (window.__csRecorderInjected) return;
    window.__csRecorderInjected = true;
    
    console.log('[recorder] Interceptor injected on:', window.location.href);
    
    // ── Intercept fetch() ────────────────────────────────────────────────────
    var _origFetch = window.fetch;
    window.fetch = async function() {
        var args = arguments;
        var url = (typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url) || '';
        var options = args[1] || {};
        var method = options.method || 'GET';
        var body = options.body || null;
        
        // Capture request body
        var bodyStr = null;
        if (body) {
            if (typeof body === 'string') bodyStr = body;
            else if (body instanceof FormData) bodyStr = '[FormData]';
            else { try { bodyStr = JSON.stringify(body); } catch(_) { bodyStr = '[Binary]'; } }
        }
        
        // Send to background
        try {
            chrome.runtime.sendMessage({
                action: 'requestBodyCaptured',
                url: url,
                method: method,
                body: bodyStr,
                timestamp: Date.now()
            });
        } catch(_) {}
        
        // Call original fetch
        var response = await _origFetch.apply(this, args);
        
        // Clone and capture response body for GraphQL/API calls
        if (url.includes('graphql') || url.includes('/api/') || url.includes('appsync')) {
            try {
                var clone = response.clone();
                var responseText = await clone.text();
                chrome.runtime.sendMessage({
                    action: 'requestBodyCaptured',
                    url: url + '__RESPONSE__',
                    method: 'RESPONSE',
                    body: responseText,
                    status: response.status,
                    timestamp: Date.now()
                });
            } catch(_) {}
        }
        
        return response;
    };
    
    // ── Intercept XMLHttpRequest ──────────────────────────────────────────────
    var _origOpen = XMLHttpRequest.prototype.open;
    var _origSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url) {
        this.__recUrl = url;
        this.__recMethod = method;
        return _origOpen.apply(this, arguments);
    };
    
    XMLHttpRequest.prototype.send = function(body) {
        var self = this;
        var bodyStr = null;
        if (body) {
            if (typeof body === 'string') bodyStr = body;
            else { try { bodyStr = JSON.stringify(body); } catch(_) { bodyStr = '[Binary]'; } }
        }
        
        try {
            chrome.runtime.sendMessage({
                action: 'requestBodyCaptured',
                url: self.__recUrl || '',
                method: self.__recMethod || 'GET',
                body: bodyStr,
                timestamp: Date.now()
            });
        } catch(_) {}
        
        // Capture response
        this.addEventListener('load', function() {
            if (self.__recUrl && (self.__recUrl.includes('graphql') || self.__recUrl.includes('/api/'))) {
                try {
                    chrome.runtime.sendMessage({
                        action: 'requestBodyCaptured',
                        url: self.__recUrl + '__RESPONSE__',
                        method: 'RESPONSE',
                        body: self.responseText,
                        status: self.status,
                        timestamp: Date.now()
                    });
                } catch(_) {}
            }
        });
        
        return _origSend.apply(this, arguments);
    };
})();
