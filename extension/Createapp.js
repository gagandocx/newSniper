// ── Createapp.js — CAPTCHA-aware application submitter ───────────────────────
// Clicks "Next" then "Create Application" on the Amazon job application page.
// CAPTCHA-aware: checks window._ssCaptchaActive (set by auth.js captchaWatcher)
// before every click. If CAPTCHA is active, waits up to 3 minutes for it to
// be solved automatically, then continues the application flow.
// ─────────────────────────────────────────────────────────────────────────────
(async function () {
    'use strict';

    // ── Helpers ───────────────────────────────────────────────────────────────
    function _clickBtn(btn) {
        const e = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });
        btn.dispatchEvent(e);
        // Belt-and-suspenders: also fire a native click 500ms later
        setTimeout(function() { try { btn.click(); } catch(_) {} }, 500);
    }

    function _goJobSearch() {
        // DISABLED: Don't redirect back to jobSearch.
        // This tab stays for user to complete further steps (identity verification, etc).
        // The main jobSearch tab continues scanning independently.
        console.log('[Createapp] Application submitted — leaving tab for user to complete.');
    }

    function _isCaptchaVisible() {
        // Check the global flag set by auth.js captchaWatcher
        if (window['_ssCaptchaActive']) return true;
        // Only detect CAPTCHA if "confirm you are human" or "Choose all" text is present
        var bodyText = document.body.innerText || '';
        if (bodyText.includes('confirm you are human') || bodyText.includes('Choose all')) return true;
        return false;
    }

    // Wait until no CAPTCHA is visible (polls every 500ms, max maxMs)
    async function _waitNoCaptcha(maxMs) {
        const _start = Date.now();
        while (Date.now() - _start < maxMs) {
            if (!_isCaptchaVisible()) return true; // CAPTCHA gone / solved
            console.log('[Createapp] CAPTCHA active — waiting for auto-solve...');
            await new Promise(function(r) { setTimeout(r, 500); });
        }
        return false; // timed out (shouldn't happen — auth.js handles it)
    }

    function _getBtn(text) {
        // Method 1: StencilReactRow structure
        var found = [...document.querySelectorAll('button')].find(function(btn) {
            var stencil = btn.querySelector('div[data-test-component="StencilReactRow"]');
            if (stencil && stencil.textContent.trim() === text) return true;
            if (btn.textContent.trim() === text) return true;
            return false;
        });
        if (found) return found;
        // Method 2: Broader — button containing the text anywhere (case-insensitive)
        found = [...document.querySelectorAll('button')].find(function(btn) {
            return btn.textContent.trim().toLowerCase().includes(text.toLowerCase());
        });
        if (found) return found;
        // Method 3: Any clickable element (a, input[type=submit]) with the text
        found = [...document.querySelectorAll('a, input[type="submit"]')].find(function(el) {
            return (el.textContent || el.value || '').trim().toLowerCase().includes(text.toLowerCase());
        });
        return found || null;
    }

    // ── Main flow ─────────────────────────────────────────────────────────────
    console.log('[Createapp] Starting application flow — CAPTCHA watchdog ON');

    // Detect "0 schedules found" / "no schedules match" → return to jobSearch
    function _noSchedules() {
        var _t = document.body.innerText || '';
        return /0\s+schedules?\s+found/i.test(_t) ||
               /sorry.*no\s+schedules?/i.test(_t) ||
               /no\s+schedules?\s+that\s+match/i.test(_t) ||
               _t.includes('0 schedules found');
    }

    let _loopCount = 0;

    async function _tryFlow() {
        _loopCount++;
        if (_loopCount > 30) { // safety: max 30 iterations (~5 min)
            console.warn('[Createapp] Max iterations reached — going to jobSearch');
            _goJobSearch();
            return;
        }

        // ── Identity verification page (liveness-check) ──────────────────────
        // Check consent boxes, click Start, then STOP completely — user takes over
        var _bodyText = document.body.innerText || '';
        if (_bodyText.includes("Let's confirm it's you") || _bodyText.includes('liveness') || 
            _bodyText.includes('Start identity verification') || _bodyText.includes('Provide consent')) {
            console.log('[Createapp] Identity verification page — checking consent + clicking Start');
            
            // Check all unchecked checkboxes
            var checkboxes = document.querySelectorAll('input[type="checkbox"]');
            for (var cb = 0; cb < checkboxes.length; cb++) {
                if (!checkboxes[cb].checked) {
                    checkboxes[cb].click();
                    await new Promise(function(r) { setTimeout(r, 300); });
                }
            }
            
            await new Promise(function(r) { setTimeout(r, 1000); });
            
            // Click "Start identity verification" button
            var startBtn = [...document.querySelectorAll('button')]
                .find(function(b) { return /start identity verification/i.test(b.textContent.trim()); });
            if (startBtn) {
                _clickBtn(startBtn);
                console.log('[Createapp] Start identity verification clicked — leaving tab for user');
            }
            // STOP completely — no more recursion, no more interference on this tab
            return;
        }

        // ── No schedules available → return to jobSearch immediately ──────────
        if (_noSchedules()) {
            console.log('[Createapp] No schedules available — returning to jobSearch in 2s');
            setTimeout(function() {
                window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
            }, 2000);
            return;
        }
        // ─────────────────────────────────────────────────────────────────────

        // Step 0: Wait if CAPTCHA is currently showing (auth.js will solve it)
        if (_isCaptchaVisible()) {
            console.log('[Createapp] CAPTCHA detected at flow start — waiting up to 3 min');
            const _solved = await _waitNoCaptcha(180000);
            if (!_solved) { console.warn('[Createapp] CAPTCHA wait timeout'); _goJobSearch(); return; }
            console.log('[Createapp] CAPTCHA solved — resuming application flow');
        }

        // Step 1: Find "Next" button
        const _nextBtn = _getBtn('Next');
        if (_nextBtn) {
            console.log('[Createapp] Clicking Next');
            _clickBtn(_nextBtn);
            // Poll rapidly for Create Application (every 200ms, up to 5s)
            for (var _p = 0; _p < 25; _p++) {
                await new Promise(function(r) { setTimeout(r, 200); });
                var _cBtn = _getBtn('Create Application');
                if (_cBtn) { break; }
            }
            await _tryFlow(); // recurse to pick up Create Application button
            return;
        }

        // Step 2: Find "Create Application" button
        const _createBtn = _getBtn('Create Application');
        if (_createBtn) {
            // Check again — CAPTCHA might have appeared between Next and now
            if (_isCaptchaVisible()) {
                console.log('[Createapp] CAPTCHA appeared before Create Application click — waiting');
                const _s = await _waitNoCaptcha(180000);
                if (!_s) { _goJobSearch(); return; }
            }
            console.log('[Createapp] Clicking Create Application');
            _clickBtn(_createBtn);
            console.log('[Createapp] Application submitted — tab stays for user');
            _goJobSearch();
            return;
        }

        // Neither button found yet — poll rapidly (every 200ms) with MutationObserver
        console.log('[Createapp] Waiting for Next or Create Application button...');
        await new Promise(function(res) {
            let _resolved = false;
            const _ob = new MutationObserver(function() {
                if (!_resolved && _noSchedules()) {
                    _resolved = true;
                    _ob.disconnect();
                    console.log('[Createapp] No schedules detected — going to jobSearch');
                    setTimeout(function() { window.location.href = 'https://hiring.amazon.ca/app#/jobSearch'; }, 500);
                    res();
                    return;
                }
                if (!_resolved && (_getBtn('Next') || _getBtn('Create Application'))) {
                    _resolved = true;
                    _ob.disconnect();
                    res();
                }
            });
            _ob.observe(document.body, { childList: true, subtree: true });
            // Also poll every 200ms as backup (MutationObserver might miss)
            var _pollId = setInterval(function() {
                if (!_resolved && (_getBtn('Next') || _getBtn('Create Application') || _noSchedules())) {
                    _resolved = true;
                    _ob.disconnect();
                    clearInterval(_pollId);
                    res();
                }
            }, 200);
            // Timeout: 3s max wait (was 5s)
            setTimeout(function() {
                if (!_resolved) { _resolved = true; _ob.disconnect(); clearInterval(_pollId); res(); }
            }, 3000);
        });

        await _tryFlow(); // recurse after buttons appear
    }

    // Start
    await _tryFlow();

    // ── SAFETY NET: If _tryFlow finished without clicking, poll every 500ms ──
    // Catches cases where button was already on page when script ran
    var _safetyAttempts = 0;
    var _safetyPoll = setInterval(function() {
        _safetyAttempts++;
        if (_safetyAttempts > 60) { clearInterval(_safetyPoll); return; } // Stop after 30s
        var btn = _getBtn('Create Application');
        if (btn) {
            console.log('[Createapp] Safety net found Create Application button — clicking');
            _clickBtn(btn);
            clearInterval(_safetyPoll);
        }
    }, 500);
})();
