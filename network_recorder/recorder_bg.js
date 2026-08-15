/**
 * CoderSnap Network Recorder — Background Service Worker
 * Simplified for MV3 compatibility.
 */

let _recording = false;
let _requests = [];
let _startTime = 0;

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.action === 'startRecording') {
        _recording = true;
        _requests = [];
        _startTime = Date.now();
        console.log('[recorder] Started recording');
        sendResponse({ status: 'recording', recording: true, count: 0 });
        return true;
    }
    
    if (msg.action === 'stopRecording') {
        _recording = false;
        console.log('[recorder] Stopped —', _requests.length, 'requests captured');
        sendResponse({ status: 'stopped', recording: false, count: _requests.length });
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
                note: 'Network requests captured during Amazon shift application'
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
    
    if (msg.action === 'capturedRequest') {
        if (_recording) {
            _requests.push(msg.data);
        }
        return;
    }
});

// Inject interceptor on Amazon pages when recording
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (!_recording) return;
    if (changeInfo.status !== 'complete') return;
    if (!tab.url) return;
    if (!tab.url.includes('hiring.amazon.ca') && !tab.url.includes('hiring.amazon.com') && !tab.url.includes('amazonaws.com')) return;
    
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['interceptor.js']
    }).catch(function(e) { console.log('[recorder] inject error:', e); });
});
