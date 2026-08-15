/**
 * CoderSnap Network Recorder — Background Service Worker
 * 
 * Records ALL network requests to/from Amazon hiring during the apply flow.
 * Captures: URL, method, headers, request body, response status, response headers.
 * 
 * How to use:
 * 1. Load this extension in Chrome (Load unpacked)
 * 2. Click the extension icon → Click "Start Recording"
 * 3. Go to hiring.amazon.ca and manually apply for a shift
 * 4. Click the extension icon → Click "Stop & Download"
 * 5. Share the downloaded JSON file
 */

let _recording = false;
let _requests = [];
let _startTime = 0;

// Track request bodies (webRequest doesn't capture POST bodies in MV3,
// so we inject a content script that intercepts fetch/XHR)
let _requestBodies = {}; // requestId → body

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.action === 'startRecording') {
        _recording = true;
        _requests = [];
        _startTime = Date.now();
        console.log('[recorder] Started recording');
        
        // Inject body interceptor into all Amazon tabs
        chrome.tabs.query({ url: '*://hiring.amazon.ca/*' }, function(tabs) {
            tabs.forEach(function(tab) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['interceptor.js']
                }).catch(function() {});
            });
        });
        chrome.tabs.query({ url: '*://hiring.amazon.com/*' }, function(tabs) {
            tabs.forEach(function(tab) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['interceptor.js']
                }).catch(function() {});
            });
        });
        
        sendResponse({ status: 'recording' });
        return true;
    }
    
    if (msg.action === 'stopRecording') {
        _recording = false;
        console.log('[recorder] Stopped recording —', _requests.length, 'requests captured');
        sendResponse({ status: 'stopped', count: _requests.length });
        return true;
    }
    
    if (msg.action === 'getStatus') {
        sendResponse({ recording: _recording, count: _requests.length });
        return true;
    }
    
    if (msg.action === 'downloadData') {
        var data = {
            meta: {
                recordedAt: new Date().toISOString(),
                duration: Date.now() - _startTime,
                totalRequests: _requests.length,
                note: 'This file contains all network requests made during a manual Amazon shift application. Use this to reverse-engineer the API flow.'
            },
            requests: _requests
        };
        
        var json = JSON.stringify(data, null, 2);
        
        chrome.downloads.download({
            url: 'data:application/json;charset=utf-8,' + encodeURIComponent(json),
            filename: 'amazon_apply_flow_' + Date.now() + '.json',
            saveAs: true
        });
        
        sendResponse({ status: 'downloading' });
        return true;
    }
    
    // Receive intercepted request body from content script
    if (msg.action === 'requestBodyCaptured') {
        if (_recording) {
            _requestBodies[msg.url] = msg.body;
        }
        return;
    }
});

// ── Capture all requests to Amazon domains ───────────────────────────────────
chrome.webRequest.onBeforeRequest.addListener(
    function(details) {
        if (!_recording) return;
        
        var entry = {
            id: details.requestId,
            timestamp: Date.now() - _startTime,
            url: details.url,
            method: details.method,
            type: details.type,
            tabId: details.tabId,
            requestBody: null
        };
        
        // Capture request body for POST requests
        if (details.requestBody) {
            if (details.requestBody.raw && details.requestBody.raw.length > 0) {
                try {
                    var decoder = new TextDecoder();
                    var bytes = details.requestBody.raw[0].bytes;
                    if (bytes) {
                        entry.requestBody = decoder.decode(bytes);
                        try { entry.requestBodyParsed = JSON.parse(entry.requestBody); } catch(_) {}
                    }
                } catch(_) {}
            }
            if (details.requestBody.formData) {
                entry.requestBody = details.requestBody.formData;
            }
        }
        
        _requests.push(entry);
    },
    { urls: [
        'https://hiring.amazon.ca/*',
        'https://hiring.amazon.com/*',
        '*://*.amazonaws.com/*',
        '*://*.amazon.ca/*',
        '*://*.amazon.com/*'
    ]},
    ['requestBody']
);

// ── Capture request headers ──────────────────────────────────────────────────
chrome.webRequest.onSendHeaders.addListener(
    function(details) {
        if (!_recording) return;
        
        // Find the matching request and add headers
        for (var i = _requests.length - 1; i >= 0; i--) {
            if (_requests[i].id === details.requestId) {
                _requests[i].requestHeaders = details.requestHeaders;
                break;
            }
        }
    },
    { urls: [
        'https://hiring.amazon.ca/*',
        'https://hiring.amazon.com/*',
        '*://*.amazonaws.com/*'
    ]},
    ['requestHeaders']
);

// ── Capture response headers + status ────────────────────────────────────────
chrome.webRequest.onHeadersReceived.addListener(
    function(details) {
        if (!_recording) return;
        
        for (var i = _requests.length - 1; i >= 0; i--) {
            if (_requests[i].id === details.requestId) {
                _requests[i].responseStatus = details.statusCode;
                _requests[i].responseHeaders = details.responseHeaders;
                break;
            }
        }
    },
    { urls: [
        'https://hiring.amazon.ca/*',
        'https://hiring.amazon.com/*',
        '*://*.amazonaws.com/*'
    ]},
    ['responseHeaders']
);

// ── Capture response completion ──────────────────────────────────────────────
chrome.webRequest.onCompleted.addListener(
    function(details) {
        if (!_recording) return;
        
        for (var i = _requests.length - 1; i >= 0; i--) {
            if (_requests[i].id === details.requestId) {
                _requests[i].completed = true;
                _requests[i].completedAt = Date.now() - _startTime;
                
                // Attach body from interceptor if available
                if (_requestBodies[details.url]) {
                    _requests[i].interceptedBody = _requestBodies[details.url];
                    delete _requestBodies[details.url];
                }
                break;
            }
        }
    },
    { urls: [
        'https://hiring.amazon.ca/*',
        'https://hiring.amazon.com/*',
        '*://*.amazonaws.com/*'
    ]}
);

// Also inject interceptor on page navigation
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (!_recording) return;
    if (changeInfo.status !== 'complete') return;
    if (!tab.url || (!tab.url.includes('hiring.amazon.ca') && !tab.url.includes('hiring.amazon.com'))) return;
    
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['interceptor.js']
    }).catch(function() {});
});
