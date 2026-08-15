/**
 * brain.js — CoderSnap Minimal Watchdog v3.0
 * 
 * Only handles pages that get STUCK and need intervention:
 * 1. Login redirect stuck (redirectUrl page that never loads)
 * 2. "Welcome back" / "Search all jobs" homepage → clicks through to jobSearch
 * 3. Homepage without app# → navigates to jobSearch
 * 4. "Problem loading page" → hard refresh
 * 5. Stuck on job detail/application without progress → back to jobSearch
 *
 * Does NOT: health scores, AI analysis, auto-expand, timing, recovery memory
 */
(function() {
    'use strict';

    // Only run on hiring.amazon.ca/com pages
    if (!window.location.href.includes('hiring.amazon')) return;
    // Never run on auth pages — auth.js handles those
    if (window.location.href.includes('auth.hiring.amazon')) return;

    var _checkInterval = 10000; // Check every 10 seconds
    var _lastFix = 0;
    var _cooldown = 15000; // Don't act more than once per 15 seconds

    function _log(msg) {
        console.log('[brain] ' + msg);
    }

    function _canAct() {
        if (Date.now() - _lastFix < _cooldown) return false;
        return true;
    }

    function _act() {
        _lastFix = Date.now();
    }

    // ── Detect current page state ────────────────────────────────────────────
    function detectState() {
        var url = window.location.href;
        var bodyText = (document.body && document.body.innerText) || '';

        // Stuck on redirectUrl login page
        if (url.includes('#/login') && url.includes('redirectUrl=')) {
            return 'LOGIN_REDIRECT_STUCK';
        }

        // Contact us page — could be part of application process, leave it alone
        // (Amazon added this as a step in their application flow)

        // Welcome back / "Search all jobs" page
        if ((url.includes('#/login') || (url.includes('hiring.amazon.ca/') && !url.includes('app#') && !url.includes('/contact-us') && !url.includes('/application/')))) {
            var isWelcome = bodyText.includes('Welcome back') || bodyText.includes('Looking for the perfect job');
            var hasSearchBtn = false;
            var btns = document.querySelectorAll('button, a');
            for (var i = 0; i < btns.length; i++) {
                if (/search all jobs/i.test(btns[i].textContent)) { hasSearchBtn = true; break; }
            }
            if (isWelcome || hasSearchBtn) return 'WELCOME_BACK';
        }

        // Homepage without app# (not logged into SPA)
        if (url.match(/hiring\.amazon\.(ca|com)\/?$/) || 
            (url.includes('hiring.amazon') && !url.includes('app#') && !url.includes('#/login') && !url.includes('/application/') && !url.includes('/contact-us'))) {
            var hasHomepage = bodyText.includes('Ready to earn') || bodyText.includes('Find jobs') || bodyText.includes('Hourly opportunities');
            if (hasHomepage) return 'HOMEPAGE';
            // If no homepage content but also not on app# — still wrong page
            return 'WRONG_PAGE';
        }

        // Problem loading page error
        if (/problem loading page|server didn't respond|try refreshing/i.test(bodyText)) {
            return 'PAGE_ERROR';
        }

        // Job search page — normal, do nothing
        if (url.includes('app#/jobSearch')) return 'SCANNING';

        // Job detail / application page
        if (url.includes('app#/jobDetail') || url.includes('/application/')) return 'APPLYING';

        return 'OK';
    }

    // ── Fix stuck states ─────────────────────────────────────────────────────
    function fixState(state) {
        switch (state) {
            case 'LOGIN_REDIRECT_STUCK':
                _log('Stuck on login redirect — navigating to jobSearch');
                _act();
                window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
                break;

            case 'WRONG_PAGE':
                _log('Wrong page (contact-us/faq/other) — navigating to jobSearch');
                _act();
                window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
                break;

            case 'WELCOME_BACK':
                _log('Welcome back page — clicking Search all jobs');
                _act();
                var btns = document.querySelectorAll('button, a');
                var clicked = false;
                for (var i = 0; i < btns.length; i++) {
                    if (/search all jobs/i.test(btns[i].textContent)) {
                        btns[i].click();
                        clicked = true;
                        break;
                    }
                }
                if (!clicked) {
                    window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
                }
                break;

            case 'HOMEPAGE':
                _log('Homepage detected — redirecting to jobSearch');
                _act();
                window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
                break;

            case 'PAGE_ERROR':
                _log('Page error detected — hard refreshing');
                _act();
                setTimeout(function() { window.location.reload(true); }, 2000);
                break;
        }
    }

    // ── Main loop — check every 10 seconds ───────────────────────────────────
    function check() {
        if (!_canAct()) return;

        var state = detectState();
        if (state === 'SCANNING' || state === 'APPLYING' || state === 'OK') return;

        fixState(state);
    }

    // Start checking after 5 seconds (let page settle)
    setTimeout(function() {
        check(); // First check
        setInterval(check, _checkInterval);
    }, 5000);

})();
