// clickHelper.js — Runs in MAIN world. Clicks Create Application + I Agree buttons.
// MAIN world = same context as React = clicks ALWAYS work. CSP cannot block this.
(function() {
    'use strict';
    
    // Only run on /application/ pages
    if (!window.location.href.includes('/application/')) return;
    
    var _clicked = false;
    
    function tryClick() {
        if (_clicked) return;
        
        // Priority 1: I Agree button (integrity notice)
        var agreeBtn = document.querySelector('button[data-test-id="integrity-notice-agree-button"]');
        if (agreeBtn) {
            _clicked = true;
            agreeBtn.click();
            console.log('[clickHelper] Clicked I Agree');
            return;
        }
        
        // Priority 2: Create Application button (no img, exact text match)
        var buttons = document.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
            if (buttons[i].querySelector('img')) continue; // skip logo
            if (buttons[i].textContent.trim() === 'Create Application') {
                _clicked = true;
                buttons[i].click();
                console.log('[clickHelper] Clicked Create Application');
                return;
            }
        }
    }
    
    // Try immediately
    tryClick();
    
    // Poll every 300ms until clicked or 30s passes
    var _attempts = 0;
    var _poll = setInterval(function() {
        _attempts++;
        if (_clicked || _attempts > 100) { clearInterval(_poll); return; }
        tryClick();
    }, 300);
    
    // Also watch for DOM changes
    var _obs = new MutationObserver(function() { tryClick(); });
    if (document.body) _obs.observe(document.body, { childList: true, subtree: true });
    else document.addEventListener('DOMContentLoaded', function() {
        _obs.observe(document.body, { childList: true, subtree: true });
    });
})();
