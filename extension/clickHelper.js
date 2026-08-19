// clickHelper.js — Runs in MAIN world, clicks buttons on behalf of Createapp.js
// Createapp.js (ISOLATED world) sets data-cs-click attribute → this picks it up and clicks
(function() {
    'use strict';
    
    var observer = new MutationObserver(function() {
        var cmd = document.documentElement.getAttribute('data-cs-click');
        if (!cmd) return;
        document.documentElement.removeAttribute('data-cs-click');
        
        try {
            var btn = null;
            // If it's a CSS selector (starts with button[ or .)
            if (cmd.startsWith('button[') || cmd.startsWith('.') || cmd.startsWith('#')) {
                btn = document.querySelector(cmd);
            } else {
                // It's a JS expression — evaluate it
                btn = eval(cmd);
            }
            if (btn) {
                btn.click();
                console.log('[clickHelper] Clicked:', cmd);
            } else {
                console.log('[clickHelper] Button not found:', cmd);
            }
        } catch(e) {
            console.log('[clickHelper] Error:', e.message, 'cmd:', cmd);
        }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-cs-click'] });
})();
