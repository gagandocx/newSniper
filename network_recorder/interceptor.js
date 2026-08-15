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
        
        var entry = { t: Date.now(), type: 'fetch', method: method, url: url, reqHeaders: headers, reqBody: body };
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
        
        if (url.includes('graphql') || url.includes('/api/') || url.includes('/application')) {
            try {
                var clone = response.clone();
                var text = await clone.text();
                entry.resBody = text;
                try { entry.resParsed = JSON.parse(text); } catch(_) {}
            } catch(_) {}
        }
        
        window.__recorderData.push(entry);
        
        // Write count to a hidden element
        var el = document.getElementById('__rec_count');
        if (!el) { el = document.createElement('span'); el.id = '__rec_count'; el.style.display = 'none'; document.documentElement.appendChild(el); }
        el.textContent = window.__recorderData.length;
        
        return response;
    };
    
    var _origOpen = XMLHttpRequest.prototype.open;
    var _origSend = XMLHttpRequest.prototype.send;
    var _origSetH = XMLHttpRequest.prototype.setRequestHeader;
    
    XMLHttpRequest.prototype.open = function(m, u) { this.__r = { method: m, url: u, h: {} }; return _origOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.setRequestHeader = function(n, v) { if (this.__r) this.__r.h[n] = v; return _origSetH.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function(body) {
        var self = this;
        if (this.__r) this.__r.body = (typeof body === 'string') ? body : null;
        this.addEventListener('load', function() {
            if (!self.__r) return;
            var entry = { t: Date.now(), type: 'xhr', method: self.__r.method, url: self.__r.url, reqHeaders: self.__r.h, reqBody: self.__r.body, status: self.status };
            if (self.__r.url && self.__r.url.includes('graphql')) { entry.resBody = self.responseText; try { entry.resParsed = JSON.parse(self.responseText); } catch(_) {} }
            window.__recorderData.push(entry);
        });
        return _origSend.apply(this, arguments);
    };
    
    // Expose a function for the popup to call via DOM event
    window.addEventListener('__pullRecorderData', function() {
        var el = document.getElementById('__rec_json');
        if (!el) { el = document.createElement('textarea'); el.id = '__rec_json'; el.style.display = 'none'; document.documentElement.appendChild(el); }
        el.value = JSON.stringify(window.__recorderData);
        el.setAttribute('data-ready', 'true');
    });
})();
