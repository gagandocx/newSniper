/**
 * auth.js — Handles ONLY the NEW login steps:
 *   1. Verification type selection ("Where to send code?")
 *   2. CAPTCHA solving (Groq AI vision)
 *   3. OTP auto-fill from Gmail
 *
 * Email, PIN, country selection = handled by original fetch.js (unchanged)
 */
(async function () {
    'use strict';

    // ── Groq API key is entered by users in the extension popup ────────────────
    // No hardcoded key — each user supplies their own via the popup input field.
    // ─────────────────────────────────────────────────────────────────────────

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function toast(html, duration = 4000) {
        if (typeof Swal === 'undefined') return;
        Swal['fire']({
            'toast': !![],
            'position': 'bottom-start',
            'timer': duration,
            'showConfirmButton': ![],
            'timerProgressBar': !![],
            'background': 'rgba(15,15,15,0.92)',
            'html': '<div style="font-size:13px;font-family:sans-serif;">' + html + '</div>'
        });
    }

    function simulateInput(el, value) {
        el.focus();
        // Must use React's native value setter — direct assignment is ignored by React
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(el, value);
        // Fire all events React listens to
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown',  { bubbles: true, key: 'a' }));
        el.dispatchEvent(new KeyboardEvent('keyup',    { bubbles: true, key: 'a' }));
        el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key: 'a' }));
    }

    function simulateClick(el) {
        if (!el) return;
        ['mousedown', 'mouseup', 'click'].forEach(type => {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        });
    }

    async function waitFor(selector, timeout = 8000) {
        const t = Date.now();
        while (Date.now() - t < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(250);
        }
        return null;
    }

    // ── Only detect the 3 new steps — never touch email/PIN/country ──────────
    let _verifyTypeDone = false; // prevent re-firing verify-type in a loop

    function detectStep() {
        const text = document.body.innerText || '';
        const title = document.title || '';

        // Skip if Swal popup is open
        if (document.querySelector('.swal2-container.swal2-shown')) return null;

        // ── CAPTCHA: detect by visible square image grid (works even in shadow DOM / widgets)
        const captchaImgs = [...document.querySelectorAll('img')].filter(img => {
            const r = img.getBoundingClientRect();
            return r.width >= 70 && r.width <= 330 &&
                   r.height >= 70 && r.height <= 330 &&
                   r.top > 30 && img.naturalWidth > 0 && img.src.startsWith('http');
        });
        if (captchaImgs.length >= 6) return 'captcha';
        if (text.includes("confirm you are human")) return 'captcha';

        // ── OTP entry page
        if (text.includes('verification code has been sent') || title.includes('Verify code')) return 'otp';

        // ── Verification type — only fire ONCE per session
        if (!_verifyTypeDone && text.includes('Where should we send your verification code')) return 'verify-type';

        return null;
    }

    // ── Verification type: select Email → Send ────────────────────────────────
    async function handleVerifyType() {
        _verifyTypeDone = true; // lock — never re-fire until page reloads
        await sleep(800);
        const radios = [...document.querySelectorAll('input[type="radio"], [role="radio"]')];
        const emailRadio = radios.find(r => {
            const label = r.closest('label') || r.parentElement;
            return label && label.textContent.toLowerCase().includes('email');
        });
        if (emailRadio) simulateClick(emailRadio);
        await sleep(400);

        const sendBtn = [...document.querySelectorAll('button')]
            .find(b => b.textContent.includes('Send verification code'));
        if (sendBtn) {
            toast('📧 <b style="color:#00d4ff;">Sending verification code to your email...</b>');
            simulateClick(sendBtn);
        }
    }

    // ── CAPTCHA solver ──────────────────────────────────────────────────────────
    // Flow: detect → screenshot → Groq → click cells + Confirm (1 debugger session)
    //       → wait for "Incorrect" or page change → retry ONLY after fresh images


    // ── Groq API Key Setup Guide ──────────────────────────────────────────────
    async function showGroqSetupGuide() {
        if (typeof Swal === 'undefined') return;
        const result = await Swal['fire']({
            'title': '🤖 Groq API Key Required',
            'html': '<div style="text-align:left;font-family:Inter,sans-serif;">'
                + '<p style="margin-bottom:14px;color:rgba(199,210,254,0.8);font-size:13px;">'
                + 'CoderSnap uses <b style="color:#c7d2fe;">Groq AI</b> to automatically solve CAPTCHAs. '
                + 'Get your <b style="color:#c7d2fe;">free</b> API key in 2 minutes:</p>'
                + '<div style="display:flex;flex-direction:column;gap:8px;">'
                + '<div style="background:rgba(34,211,238,0.07);border:1px solid rgba(34,211,238,0.2);border-radius:10px;padding:11px 13px;">'
                + '<div style="font-size:10px;font-weight:700;color:#22d3ee;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">① Create Free Account</div>'
                + '<div style="font-size:12.5px;color:rgba(199,210,254,0.75);">'
                + 'Visit <a href="https://console.groq.com" target="_blank" style="color:#818cf8;font-weight:600;">console.groq.com</a> → Sign up (free, no credit card)</div></div>'
                + '<div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:11px 13px;">'
                + '<div style="font-size:10px;font-weight:700;color:#818cf8;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">② Get Your API Key</div>'
                + '<div style="font-size:12.5px;color:rgba(199,210,254,0.75);">'
                + 'Click <b style="color:#c7d2fe;">API Keys</b> in the sidebar → <b style="color:#c7d2fe;">Create API Key</b> → Copy key starting with '
                + '<code style="background:rgba(99,102,241,0.2);color:#a5f3fc;padding:1px 6px;border-radius:4px;font-size:11px;">gsk_</code></div></div>'
                + '<div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:10px;padding:11px 13px;">'
                + '<div style="font-size:10px;font-weight:700;color:#a78bfa;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">③ Paste in Extension</div>'
                + '<div style="font-size:12.5px;color:rgba(199,210,254,0.75);">'
                + 'Click the <b style="color:#c7d2fe;">CoderSnap</b> icon in toolbar → Find <b style="color:#c7d2fe;">🤖 Groq API Key</b> → Paste → Saved automatically</div></div>'
                + '</div>'
                + '<p style="margin-top:12px;font-size:11px;color:rgba(199,210,254,0.35);text-align:center;">'
                + 'Without API key, you must solve CAPTCHAs manually every time.</p></div>',
            'showConfirmButton': true,
            'showCancelButton': true,
            'confirmButtonText': '🔗 Open Groq Console',
            'cancelButtonText': '✋ Solve Manually',
            'reverseButtons': false,
            'allowEscapeKey': false,
            'allowOutsideClick': false,
            'icon': 'info'
        });
        if (result && result['isConfirmed']) {
            window.open('https://console.groq.com/keys', '_blank');
        }
        // Either way return — user solves manually or gets key and retries
    }
    // ─────────────────────────────────────────────────────────────────────────

    async function handleCaptcha() {
        await sleep(200);
        console.log('[auth.js] handleCaptcha start', new Date().toLocaleTimeString());

        // ── A: Find modal ──────────────────────────────────────────────────────
        const tryList = ['#captchaModal','.captcha-modal','[data-test-id="captchaModal"]',
                         '#captchaModalOverlay > *:first-child','.captcha-overlay > *:first-child'];
        let modal = null;
        for (const s of tryList) { const el = document.querySelector(s); if (el) { modal = el; break; } }
        if (!modal) { console.warn('[auth.js] modal not found'); return; }
        try { modal.scrollIntoView({ block: 'start', behavior: 'instant' }); } catch(_) {}
        await sleep(300);
        const _mr0 = modal.getBoundingClientRect();
        if (_mr0.top < 60) { window.scrollBy(0, _mr0.top - 60); await sleep(200); }
        const mr = modal.getBoundingClientRect();
        const modalRect = {
            top:    Math.max(0, Math.round(mr.top)),
            left:   Math.round(mr.left),
            width:  mr.width > 700 ? Math.round(window.innerWidth * 0.24) : Math.round(mr.width),
            height: mr.width > 700 ? Math.round(window.innerHeight * 0.82) : Math.round(mr.height)
        };
        console.log('[auth.js] modal rect:', JSON.stringify(modalRect));

        // ── B: Groq key ────────────────────────────────────────────────────────
        let groqKey = '';
        try { groqKey = (await chrome.storage.local.get(['groq_api_key'])).groq_api_key || ''; } catch(_) {}
        // No fallback key — user must enter their own key in the popup
        if (!groqKey) {
            // Guide is shown after PIN entry (in fetch.js) — just remind here
            toast('&#9888; <b style="color:#f59e0b;">No Groq API key!</b> Open the CoderSnap popup &rarr; AI Captcha Solver &rarr; paste your <span style="color:#22d3ee;font-family:monospace;">gsk_</span> key. Solving manually for now.', 8000);
            return;
        }

        toast('🤖 <b style="color:#ffcc00;">AI solving CAPTCHA — hang tight...</b>', 25000);

        // ── C: Screenshot ──────────────────────────────────────────────────────
        const ssRes = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'takeScreenshot' }, r => {
                if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
                else resolve(r || { error: 'no ss' });
            });
        });
        if (ssRes.error || !ssRes.dataUrl) { toast('❌ Screenshot failed', 4000); return; }

        // ── D: Crop to modal ───────────────────────────────────────────────────
        let cropUrl = ssRes.dataUrl;
        try {
            const img = new Image();
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = ssRes.dataUrl; });
            const scale = img.naturalWidth / window.innerWidth;
            const PAD = Math.round(20 * scale);
            const sx = Math.max(0, Math.round(modalRect.left * scale) - PAD);
            const sy = Math.max(0, Math.round(modalRect.top  * scale) - PAD);
            const sw = Math.min(Math.round(modalRect.width  * scale) + PAD*2, img.naturalWidth  - sx);
            const sh = Math.min(Math.round(modalRect.height * scale) + PAD*2, img.naturalHeight - sy);
            const fw = Math.min(sw, 640), fh = Math.round(sh * fw / sw);
            const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh;
            cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, fw, fh);
            cropUrl = cv.toDataURL('image/jpeg', 0.90);
            console.log('[auth.js] crop:', fw + 'x' + fh);
        } catch(e) { console.warn('[auth.js] crop failed:', e.message); }

        // ── E: Groq call ── FIX: multi-model fallback (404 on deprecated model) ──
        console.log('[auth.js] calling Groq...');
        let positions = [];
        // ── FIX: compress image + expanded model list + 400 retry with tiny image ──
        // Step 1: Compress crop to max 280x280 at 35% quality (many models reject large images)
        let compCropUrl = cropUrl;
        try {
            const _cimg = new Image();
            await new Promise(function(res, rej) { _cimg.onload = res; _cimg.onerror = rej; _cimg.src = cropUrl; });
            const _maxD = 280;
            const _csc  = Math.min(_maxD / _cimg.naturalWidth, _maxD / _cimg.naturalHeight, 1);
            const _ccv  = document.createElement('canvas');
            _ccv.width  = Math.round(_cimg.naturalWidth  * _csc);
            _ccv.height = Math.round(_cimg.naturalHeight * _csc);
            _ccv.getContext('2d').drawImage(_cimg, 0, 0, _ccv.width, _ccv.height);
            compCropUrl = _ccv.toDataURL('image/jpeg', 0.35);
            console.log('[auth.js] Compressed:', _ccv.width+'x'+_ccv.height,
                        Math.round(cropUrl.length/1024)+'KB →', Math.round(compCropUrl.length/1024)+'KB');
        } catch(_ce) { console.warn('[auth.js] Compress failed:', _ce.message); }

        // Step 2: Model list — prioritise models visible in user's Groq account (Image 3):
        // openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.6-27b are confirmed in account.
        // Llama 4 and Llama 3.2 vision models also tried as fallback.
        // qwen/qwen3.6-27b is Groq's OFFICIAL replacement for Llama 4 Scout (deprecated Jun 2026)
        // It's already in the user's free Groq account and supports image input (vision).
        // Source: console.groq.com/docs/deprecations + console.groq.com/docs/vision
        const _groqModels = [
            'qwen/qwen3.6-27b',                                 // ← PRIMARY: Groq's official replacement for Llama 4 Scout, vision capable, FREE
            'openai/gpt-oss-120b',                              // Groq's replacement for Llama 4 Maverick
            'openai/gpt-oss-20b',                               // Smaller OSS variant
            'llama-4-scout',                                    // Try short ID just in case
            'meta-llama/llama-4-scout-17b-16e-instruct',       // Original full ID
            'llama-3.2-90b-vision-preview',                     // Legacy fallback
            'llama-3.2-11b-vision-preview'
        ];
        const _groqPrompt = 'Solve this CAPTCHA. The image shows a popup with a 3x3 grid.\n\nSTEP 1 - Read the task:\nFind the underlined word in \"Choose all the ___\". Write: Task: [word]\n\nSTEP 2 - Describe EVERY cell (you must fill in all 9):\nCell 1: [describe what you see]\nCell 2: [describe what you see]\nCell 3: [describe what you see]\nCell 4: [describe what you see]\nCell 5: [describe what you see]\nCell 6: [describe what you see]\nCell 7: [describe what you see]\nCell 8: [describe what you see]\nCell 9: [describe what you see]\n\nSTEP 3 - Select:\nWhich cells match the Task word? Only pick cells where that object is clearly the main subject.\n\nFINAL ANSWER: [e.g. 1,3,7] or NONE';

        // ── FIX: Route Groq calls via background.js to bypass CORS ──────────────
        // auth.js runs on auth.hiring.amazon.com — direct fetch() to api.groq.com
        // is blocked by CORS policy. Background service worker has no such restriction.
        async function _tryGroqModel(modelId, imgUrl, key) {
            return new Promise(function(resolve) {
                var _timer = setTimeout(function() {
                    resolve({ ok: false, status: 0, _timeout: true });
                }, 25000);
                chrome.runtime.sendMessage({
                    action: 'groqVisionRequest',
                    groqKey: key,
                    model: modelId,
                    imageUrl: imgUrl,
                    prompt: _groqPrompt
                }, function(result) {
                    clearTimeout(_timer);
                    if (chrome.runtime.lastError || !result) {
                        resolve({ ok: false, status: 0 });
                        return;
                    }
                    var _content = result.content || '';
                    // Return a fake Response-like object so existing code works unchanged
                    resolve({
                        ok:     result.status === 200,
                        status: result.status || 0,
                        json:   async function() {
                            return { choices: [{ message: { content: _content } }] };
                        }
                    });
                });
            });
        }
        // ─────────────────────────────────────────────────────────────────────────

        try {
            let gResp = null, usedModel = '';
            for (const _model of _groqModels) {
                try {
                    let _r = await _tryGroqModel(_model, compCropUrl, groqKey);
                    if (_r && _r.ok) { gResp = _r; usedModel = _model; break; }

                    // 429 Rate Limited — stop trying all models immediately (all will be limited)
                    // Wait 25s before allowing the captchaWatcher to retry.
                    if (_r && _r.status === 429) {
                        console.warn('[auth.js] 429 rate limit — waiting 25s before retry');
                        toast('\u23F3 <b style="color:#f59e0b;">Groq rate limited — auto-retrying in 25s...</b>', 26000);
                        await sleep(25000);
                        return; // exit handleCaptcha — watcher will retry after its cooldown
                    }

                    if (_r && _r.status === 404) {
                        console.warn('[auth.js] Model', _model, '\u2192 404, trying next');
                        continue;
                    }
                    if (_r && _r.status === 400) {
                        // 400: try with even tinier image (strict size limit)
                        console.warn('[auth.js] Model', _model, '\u2192 400, retrying at 160px');
                        try {
                            const _ti = new Image();
                            await new Promise(function(res, rej) { _ti.onload = res; _ti.onerror = rej; _ti.src = compCropUrl; });
                            const _tc = document.createElement('canvas');
                            _tc.width = Math.min(_ti.naturalWidth, 160);
                            _tc.height = Math.round(_ti.naturalHeight * (_tc.width / _ti.naturalWidth));
                            _tc.getContext('2d').drawImage(_ti, 0, 0, _tc.width, _tc.height);
                            _r = await _tryGroqModel(_model, _tc.toDataURL('image/jpeg', 0.3), groqKey);
                            if (_r && _r.ok) { gResp = _r; usedModel = _model+'(tiny)'; break; }
                            // 400 tiny also rate limited
                            if (_r && _r.status === 429) {
                                toast('\u23F3 <b style="color:#f59e0b;">Groq rate limited — auto-retrying in 25s...</b>', 26000);
                                await sleep(25000);
                                return;
                            }
                        } catch(_te) {}
                        continue;
                    }
                    gResp = _r; usedModel = _model; break;
                } catch(_me) { console.warn('[auth.js] Model', _model, 'threw:', _me.message); }
            }
            if (!gResp) { toast('\u274C Groq: no working model — solve CAPTCHA manually', 8000); return; }
            // Wrong key (401), server error (500), etc — show correct message
            if (!gResp.ok) {
                var _errMsg = gResp.status === 401
                    ? '\u274C Groq: Invalid API key — check your Groq key in the popup'
                    : '\u274C Groq error ' + gResp.status + ' — try again later';
                toast(_errMsg, 6000);
                return;
            }
            console.log('[auth.js] Groq model used:', usedModel);
            const gData = await gResp.json();
            let resp = (gData.choices && gData.choices[0] && gData.choices[0].message && gData.choices[0].message.content || '').trim();

            // ── FIX: Qwen 3.6 thinking mode wraps reasoning in <think>...</think> ──
            // max_tokens=500 was too small — thinking block consumed all tokens before
            // FINAL ANSWER could be output. Now using 2000 tokens + stripping think tags.
            resp = resp.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

            console.log('[auth.js] Groq (stripped):', resp.slice(0, 300));

            // Primary parser: look for FINAL ANSWER: X,Y,Z
            const fm = resp.match(/FINAL ANSWER:\s*([0-9][0-9,\s]*|NONE)/i);
            if (fm && fm[1].toUpperCase() !== 'NONE') {
                positions = fm[1].split(/[,\s]+/).map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 1 && n <= 9);
            }
            // Fallback parser: look for "matching cells are X, Y, Z" or "cells are X, Y"
            // (catches responses where FINAL ANSWER format isn't used)
            if (!positions.length) {
                var fallbackMatch = resp.match(/(?:matching cells?|selected cells?|cells? are)[\s:]*([1-9][\s,1-9]*)/i);
                if (fallbackMatch) {
                    positions = fallbackMatch[1].split(/[,\s]+/).map(function(n) { return parseInt(n); }).filter(function(n) { return !isNaN(n) && n >= 1 && n <= 9; });
                    if (positions.length) console.log('[auth.js] Used fallback parser, positions:', positions);
                }
            }
            // Last resort: look for any standalone numbers 1-9 near "yes" or "curtain/bag/clock" etc
            if (!positions.length) {
                var yesMatches = [...resp.matchAll(/Cell\s*(\d):\s*Yes/gi)];
                if (yesMatches.length > 0) {
                    positions = yesMatches.map(function(m) { return parseInt(m[1]); }).filter(function(n) { return n >= 1 && n <= 9; });
                    if (positions.length) console.log('[auth.js] Used Cell:Yes parser, positions:', positions);
                }
            }
        } catch(e) { toast('\u274C Groq error: ' + e.message, 5000); return; }
        if (!positions.length) { console.warn('[auth.js] no positions'); return; }
        console.log('[auth.js] positions:', positions);
        toast('🤖 <b style="color:#4CAF50;">Clicking: ' + positions.join(',') + '</b>', 5000);

        // ── F: Build cell click coordinates ───────────────────────────────────
        const gT = modalRect.top  + modalRect.height * 0.17;
        const gL = modalRect.left + modalRect.width  * 0.03;
        const cW = (modalRect.width  * 0.94) / 3;
        const cH = (modalRect.height * 0.62) / 3;
        const cellClicks = positions.map(pos => {
            const row = Math.floor((pos-1)/3), col = (pos-1)%3;
            return { x: gL + col*cW + cW/2, y: gT + row*cH + cH/2 };
        });

        // ── G: ONE debugger session — click cells then Confirm via shadow DOM ──
        console.log('[auth.js] sending clickCellsAndConfirm...');
        const result = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'clickCellsAndConfirm', cellClicks }, r => {
                if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
                else resolve(r || { error: 'no response' });
            });
        });
        console.log('[auth.js] clickCellsAndConfirm result:', JSON.stringify(result));

        if (result.error) { toast('❌ ' + result.error, 5000); return; }
        toast('✅ <b style="color:#4CAF50;">Submitted: ' + positions.join(',') + ' | ' + (result.confirmStatus || '?') + '</b>', 5000);

        // ── H: Wait for CAPTCHA outcome (up to 6s) ────────────────────────────
        // Only retry after "Incorrect" is confirmed AND new images are loaded
        console.log('[auth.js] waiting for outcome...');
        let outcome = 'pending';
        for (let w = 0; w < 12; w++) {
            await sleep(500);
            const txt = document.body.innerText;
            if (!document.querySelector('#captchaModal, .captcha-modal, awswaf-captcha')) {
                outcome = 'success'; break;
            }
            if (txt.includes('Incorrect') || txt.includes('incorrect') || txt.includes('try again')) {
                outcome = 'incorrect'; break;
            }
        }
        console.log('[auth.js] outcome:', outcome);

        if (outcome === 'success') {
            toast('🎉 <b style="color:#00d4ff;">CAPTCHA solved — proceeding!</b>', 5000);
            clearInterval(_captchaWatcherInterval);
        }
        // If 'incorrect' or 'pending', captchaWatcher will retry after cooldown
        // with the fresh/new CAPTCHA images
    }
    async function clickConfirm() {
        await sleep(400);
        const btn = [...document.querySelectorAll('button')].find(b => /confirm/i.test(b.textContent));
        if (btn) simulateClick(btn);
    }

    // ── OTP: read from Gmail tab → fill → click Continue ────────────────────────
    // staleOtp: if set, skip this code and wait for a NEW different code (after Resend)
    async function handleOTP(staleOtp) {
        clearInterval(_captchaWatcherInterval);
        _captchaHandling = true;
        console.log('[auth.js] ══ handleOTP START ══', new Date().toLocaleTimeString(), staleOtp ? '| skipping stale:' + staleOtp : '');
        // Clear any stale redirect flag from previous sessions
        chrome.storage.local.remove('_pendingJobRedirect');

        // ── One-time Gmail setup guide (shown only on first OTP encounter) ──────
        // Shown BEFORE the OTP polling starts so the user understands what to do.
        // After clicking "Got it!" the extension continues automatically.
        const _guideData = await new Promise(function(res) {
            chrome.storage.local.get('__gmailGuideShown', function(d) { res(d); });
        });
        if (!_guideData['__gmailGuideShown']) {
            // ── FIX: set flag AFTER user clicks Got it — not before ──────────────
            // Previously set before showing → if page navigated away mid-read, flag
            // was already true, guide never reappeared. Now only marks shown on confirm.
            const _guideResult = await Swal['fire']({
                'title': '📬 One-time Gmail Setup',
                'html':
                    '<div style="text-align:left;font-family:Inter,sans-serif;">' +
                    '<p style="margin-bottom:14px;color:rgba(199,210,254,0.8);font-size:13px;">' +
                    'CoderSnap reads your Amazon verification code <b style="color:#c7d2fe;">automatically</b> ' +
                    'from Gmail — no manual typing needed. Complete this one-time setup to go fully ' +
                    '<b style="color:#22d3ee;">24/7 automatic</b>.</p>' +
                    '<div style="display:flex;flex-direction:column;gap:8px;">' +

                    '<div style="background:rgba(34,211,238,0.07);border:1px solid rgba(34,211,238,0.2);border-radius:10px;padding:11px 13px;">' +
                    '<div style="font-size:10px;font-weight:700;color:#22d3ee;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">① Open Gmail in this Chrome</div>' +
                    '<div style="font-size:12.5px;color:rgba(199,210,254,0.75);">Go to <a href="https://mail.google.com" target="_blank" style="color:#818cf8;font-weight:600;">mail.google.com</a> and keep it open in a tab — ' +
                    'the extension reads OTP codes directly from your inbox.</div></div>' +

                    '<div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:11px 13px;">' +
                    '<div style="font-size:10px;font-weight:700;color:#818cf8;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">② Log into the right Google account</div>' +
                    '<div style="font-size:12.5px;color:rgba(199,210,254,0.75);">Make sure Gmail is signed in with the same email address as your ' +
                    '<b style="color:#c7d2fe;">Amazon Jobs account</b> — that\'s where Amazon sends the 6-digit code.</div></div>' +

                    '<div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:10px;padding:11px 13px;">' +
                    '<div style="font-size:10px;font-weight:700;color:#a78bfa;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">③ Never close Gmail while hunting</div>' +
                    '<div style="font-size:12.5px;color:rgba(199,210,254,0.75);">CoderSnap will open Gmail automatically each time it needs a code, ' +
                    'scroll to the <b style="color:#c7d2fe;">latest email</b>, extract the code and fill it in — ' +
                    'completely hands-free.</div></div>' +
                    '</div>' +
                    '<div style="margin-top:13px;padding:10px 13px;background:rgba(22,245,255,0.04);border:1px solid rgba(22,245,255,0.12);border-radius:10px;">' +
                    '<div style="font-size:11.5px;color:rgba(199,210,254,0.6);line-height:1.6;">' +
                    '💡 <b style="color:rgba(199,210,254,0.85);">Pro tip:</b> Pin the Gmail tab so it stays open even after browsing. ' +
                    'This guide will not appear again — you\'re all set after clicking Got it!</div></div>' +
                    '</div>',
                'confirmButtonText': '✅ Got it — start automatic OTP!',
                'showCancelButton': false,
                'allowEscapeKey': false,
                'allowOutsideClick': false,
                'focusConfirm': true,
                'customClass': { 'confirmButton': 'swal-btn-cyan' }
            });
            // Only mark as shown if user actually clicked Got it (not dismissed by page nav)
            if (_guideResult && _guideResult['isConfirmed']) {
                chrome.storage.local.set({ '__gmailGuideShown': true });
            }
            // If dismissed/interrupted: flag stays unset → guide shows again next time
        }
        // ─────────────────────────────────────────────────────────────────────────

        // Step 1: Wait 4s for email to arrive, then switch to Gmail tab + refresh
        toast('📬 <b style="color:#00d4ff;">Waiting for verification email...</b>', 6000);
        await sleep(4000);
        console.log('[auth.js] Switching to Gmail tab + refreshing...');

        // Tell background to refresh Gmail tab — this reloads it and waits for load
        const _rfResult = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'refreshGmailTab' }, r => resolve(r || {}));
        });
        if (_rfResult && _rfResult.opened) {
            console.log('[auth.js] Gmail tab auto-opened — waiting 7s for full load');
            toast('📬 <b style="color:#ffcc00;">Gmail opened — waiting for inbox to load...</b>', 8000);
            await sleep(7000);
        } else {
            // Gmail tab existed — wait 4s for refresh to complete
            await sleep(4000);
        }

        // Now switch focus to the Gmail tab so Chrome fully renders it
        // (some Chrome versions don't execute scripts on truly background tabs)
        await new Promise(function(resolve) {
            chrome.runtime.sendMessage({ action: 'switchToGmailTab' }, function(r) {
                resolve(r || {});
            });
        });
        // Wait 3s with Gmail in focus (ensures DOM is fully rendered)
        await sleep(3000);

        // Switch back to the Amazon auth tab
        await new Promise(function(resolve) {
            chrome.runtime.sendMessage({ action: 'switchBackToAuthTab' }, function(r) {
                resolve(r || {});
            });
        });
        await sleep(500);

        console.log('[auth.js] Gmail refreshed + focused — polling for OTP...');

        // Step 2: Poll for OTP — if staleOtp given, skip it and wait for a NEW code
        let otp = null;
        for (let i = 0; i < 12 && !otp; i++) {
            const candidate = await fetchOTPFromGmail();
            console.log('[auth.js] OTP poll', i+1, '→', candidate || 'null', staleOtp && candidate === staleOtp ? '(stale, skipping)' : '');
            if (candidate && candidate !== staleOtp) {
                otp = candidate;
            } else if (!candidate) {
                toast('📬 Checking Gmail ' + (i+1) + '/12...', 3200);
                await sleep(3000);
            } else if (candidate === staleOtp && i < 8) {
                // Still seeing the old code — wait for Resend to deliver new email
                toast('📬 Waiting for new code (old: ' + staleOtp + ')...', 3200);
                await sleep(4000);
            }
        }

        if (!otp) {
            console.error('[auth.js] OTP not found after 12 attempts');
            if (typeof Swal !== 'undefined') {
                Swal['fire']({
                    'title': '📬 Gmail Required',
                    'html': '<div style="text-align:left;font-size:14px;">' +
                            '<b>Could not find the OTP in Gmail.</b><br><br>' +
                            'Please make sure:<br>' +
                            '✅ Gmail is open in this browser<br>' +
                            '✅ You are logged into your Amazon account email<br>' +
                            '✅ The Amazon Jobs verification email has arrived<br><br>' +
                            '<small style="color:#aaa;">The extension will retry automatically once Gmail is open.</small>' +
                            '</div>',
                    'icon': 'warning',
                    'confirmButtonText': 'Open Gmail',
                    'showCancelButton': true,
                    'cancelButtonText': "I'll do it manually"
                })['then'](function(result) {
                    if (result['isConfirmed']) {
                        chrome.runtime.sendMessage({ action: 'refreshGmailTab' });
                        setTimeout(function() {
                            _handling = false;
                            handleOTP(staleOtp); // keep skipping the stale code
                        }, 8000);
                    }
                });
            } else {
                toast('❌ <b>Open Gmail tab with your Amazon account to receive OTP</b>', 15000);
            }
            return;
        }
        console.log('[auth.js] ✅ OTP found:', otp);
        toast('✅ <b style="color:#00d4ff;">Code received: ' + otp + ' — filling in...</b>', 4000);

        // Step 3: Find OTP input
        await sleep(500);
        const otpInput = document.querySelector('input[data-test-id="input-test-id-code"]')
                      || document.querySelector('input[data-test-id*="code"]')
                      || document.querySelector('input[maxlength="6"]')
                      || document.querySelector('input[type="text"]');
        console.log('[auth.js] OTP input found:', otpInput ? otpInput.outerHTML.slice(0,80) : 'NOT FOUND');
        if (!otpInput) { toast('❌ OTP input not found', 5000); return; }

        // Step 4: Fill OTP using React native setter
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(otpInput, otp);
        otpInput.dispatchEvent(new Event('input',  { bubbles: true }));
        otpInput.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(500);
        nativeSetter.call(otpInput, otp); // second fill to be sure
        otpInput.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(500);
        console.log('[auth.js] Input value after fill:', otpInput.value, '| expected:', otp, '| match:', otpInput.value === otp);

        // Step 5: Set redirect flag NOW — before clicking anything
        chrome.storage.local.set({ _pendingJobRedirect: true });
        console.log('[auth.js] ✅ pendingJobRedirect set (pre-click)');

        // Step 6: Click Verify
        const verifyBtn = document.querySelector('button[data-test-id="button-test-id-verifyAccount"]')
                       || [...document.querySelectorAll('button')].find(b => /^verify$/i.test(b.textContent.trim()));
        console.log('[auth.js] Verify button:', verifyBtn ? verifyBtn.getAttribute('data-test-id') : 'NOT FOUND');
        if (verifyBtn) {
            verifyBtn.focus();
            await sleep(200);
            verifyBtn.click();
            console.log('[auth.js] Verify clicked at', new Date().toLocaleTimeString());
            const _fr = await chrome.storage.local.get('__firstRun');
            if (!_fr['__firstRun']) {
                chrome.storage.local.set({ '__showSetupWizard': true });
            }
        } else {
            toast('❌ Verify button not found', 5000);
            return;
        }

        // Step 7: Wait 3s for Continue button
        console.log('[auth.js] Waiting 3s for Continue button...');
        await sleep(3000);
        const continueBtn = document.querySelector('button[data-test-id="button-continue"]')
                         || [...document.querySelectorAll('button')].find(b => /^continue$/i.test(b.textContent.trim()));
        console.log('[auth.js] Continue button:', continueBtn ? continueBtn.getAttribute('data-test-id') : 'NOT FOUND');
        if (continueBtn) {
            continueBtn.focus();
            await sleep(200);
            continueBtn.click();
            console.log('[auth.js] Continue clicked at', new Date().toLocaleTimeString());
        }

        // Step 8: Check for invalid code error → Resend with current OTP as stale
        await sleep(2000);
        const errorMsg = document.body.innerText || '';
        // Only check for specific OTP rejection messages — NOT general words like "expired"
        if (/not valid|incorrect code|code is invalid|try resending/i.test(errorMsg) && !/session/i.test(errorMsg)) {
            console.log('[auth.js] OTP', otp, 'rejected — clicking Resend, will skip this code next time');
            toast('⚠️ <b style="color:#ffcc00;">Code rejected — requesting fresh code...</b>', 5000);
            const resendBtn = document.querySelector('[data-test-id*="resend"], button[class*="resend"]')
                           || [...document.querySelectorAll('button, a')]
                              .find(b => /resend|send.?again|send.?new/i.test(b.textContent));
            if (resendBtn) {
                resendBtn.click();
                console.log('[auth.js] Resend clicked — waiting 6s then retrying with staleOtp:', otp);
                await sleep(6000);
                _handling = false;
                await handleOTP(otp); // ← pass otp as stale so next poll ignores it
                return;
            }
        }

        // Step 9: Login successful — go directly to jobSearch
        // Don't wait for fetch.js to handle it — auth.js runs on auth.hiring.amazon domain
        // where fetch.js redirect logic doesn't apply
        console.log('[auth.js] OTP flow complete — navigating to jobSearch');
        await sleep(1000);
        // Check if page already navigated away from auth
        if (window.location.href.includes('auth.hiring')) {
            // Still on auth page — force navigate to jobSearch
            window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
        }
    }


    async function fetchOTPFromGmail() {
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'fetchGmailOTP' }, function(r) {
                if (chrome.runtime.lastError) {
                    console.error('[auth.js] fetchGmailOTP error:', chrome.runtime.lastError.message);
                    resolve(null);
                    return;
                }
                resolve(r && r.otp ? r.otp : null);
            });
        });
    }

    // ── Main loop ─────────────────────────────────────────────────────────────
    let _handling = false;
    let _captchaHandling = false; // separate lock just for CAPTCHA

    async function runStep() {
        if (_handling) return;
        const step = detectStep();
        if (!step || step === 'captcha') return; // CAPTCHA has its own watcher
        _handling = true;
        try {
            console.log('[auth.js] step:', step);
            await sleep(400);
            if      (step === 'verify-type') await handleVerifyType();
            else if (step === 'otp')         await handleOTP();
        } finally {
            _handling = false; // reset immediately — no extra wait
        }
    }

    // ── Dedicated CAPTCHA watcher — runs every 600ms, completely independent ──
    async function captchaWatcher() {
        if (_captchaHandling) return;

        // Detect by AWS WAF custom element OR grid images
        const hasWidget = !!document.querySelector('awswaf-captcha, [id*="awswaf"], [class*="awswaf"]');
        const bodyHas   = document.body.innerText.includes('confirm you are human');

        // Image detection: use r.bottom > 50 instead of r.top > 0
        // (modal may be scrolled so row-1 images have negative r.top)
        const imgs = [...document.querySelectorAll('img')].filter(img => {
            const r = img.getBoundingClientRect();
            return r.width  >= 60 && r.width  <= 350 &&
                   r.height >= 60 && r.height <= 350 &&
                   r.bottom > 50 &&  // at least partially visible
                   img.src && img.src.startsWith('http');
        });
        const hasCaptchaImgs = imgs.length >= 6;

        if (hasWidget || bodyHas || hasCaptchaImgs) {
            console.log('[auth.js] CAPTCHA detected! widget:', hasWidget, 'text:', bodyHas, 'imgs:', imgs.length);
            _captchaHandling = true;
            try {
                await handleCaptcha();
            } finally {
                // Wait 4s after solve attempt before allowing retry
                // This prevents watcher from re-triggering during cell clicks / Confirm
                await sleep(4000);
                _captchaHandling = false;
                console.log('[auth.js] captchaWatcher ready for retry');
            }
        }
    }
    const _captchaWatcherInterval = setInterval(captchaWatcher, 600);

    // ── SPA navigation observer ───────────────────────────────────────────────
    const _obs = new MutationObserver(() => { if (!_handling) runStep(); });
    if (document.body) _obs.observe(document.body, { childList: true, subtree: true });

    await sleep(1500); // let fetch.js run first
    await runStep();

    // ── Stuck PIN watchdog ────────────────────────────────────────────────────
    // If stuck on PIN page for > 30 seconds → reload the page (not retry)
    var _lastStep = null;

    setInterval(function() {
        var url = window.location.href;
        if (!url.includes('auth.hiring')) return;

        var bodyText = document.body && document.body.innerText || '';
        var currentStep = null;
        if (bodyText.includes('Enter your personal PIN')) currentStep = 'pin';
        else if (bodyText.includes('verification code has been sent')) currentStep = 'otp';
        else if (bodyText.includes('Where should we send')) currentStep = 'verify-type';
        else if (bodyText.includes('Email or mobile number')) currentStep = 'email';

        if (currentStep === 'pin' && currentStep === _lastStep) {
            // Stuck on PIN for 10s — reload
            console.log('[auth.js] Watchdog: stuck on PIN — reloading page');
            window.location.reload();
            return;
        }

        if (currentStep === _lastStep && currentStep !== null && !_handling) {
            console.log('[auth.js] Watchdog: stuck on', currentStep, '— retrying runStep');
            _handling = false;
            runStep();
        }
        _lastStep = currentStep;
    }, 10000);

    // ── Overall auth flow timeout ─────────────────────────────────────────────
    // If stuck on auth page for > 5 minutes, reload entirely
    setTimeout(function() {
        if (window.location.href.includes('auth.hiring')) {
            console.log('[auth.js] 5-min timeout — reloading auth page');
            window.location.reload();
        }
    }, 5 * 60 * 1000);

})();
