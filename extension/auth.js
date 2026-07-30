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

        // ── CAPTCHA Begin page: "Let's confirm you are human" + Begin button (no grid yet)
        const beginBtn = [...document.querySelectorAll('button, input[type="submit"], a')]
            .find(b => /^begin/i.test((b.textContent || b.value || '').trim()));
        if (beginBtn && (text.includes('confirm you are human') || text.includes('security check'))) return 'captcha-begin';

        // ── CAPTCHA Grid: visible square image grid (grid is already showing)
        const captchaImgs = [...document.querySelectorAll('img')].filter(img => {
            const r = img.getBoundingClientRect();
            return r.width >= 70 && r.width <= 330 &&
                   r.height >= 70 && r.height <= 330 &&
                   r.top > 30 && img.naturalWidth > 0 && img.src.startsWith('http');
        });
        if (captchaImgs.length >= 6) return 'captcha';
        if (text.includes('Choose all')) return 'captcha';

        // ── OTP entry page
        if (text.includes('verification code has been sent') || title.includes('Verify code')) return 'otp';

        // ── Verification type — only fire ONCE per session
        if (!_verifyTypeDone && text.includes('Where should we send your verification code')) return 'verify-type';

        // ── Rate limited: "Please wait 60 seconds before trying again"
        if (text.includes('Please wait') && text.includes('seconds before trying again')) return 'verify-rate-limited';

        // ── Login page: email input visible
        const emailInput = document.querySelector('input[data-test-id="input-test-id-login"]');
        if (emailInput && !emailInput.value) return 'login-email';

        // ── PIN page: pin input visible
        const pinInput = document.querySelector('input[data-test-id="input-test-id-pin"]');
        if (pinInput && !pinInput.value) return 'login-pin';

        return null;
    }

    // ── CAPTCHA Begin: click "Begin" button → grid loads → captchaWatcher solves it
    async function handleCaptchaBegin() {
        console.log('[auth.js] "Let\'s confirm you are human" page — clicking Begin');
        await sleep(500);
        const beginBtn = [...document.querySelectorAll('button, input[type="submit"], a')]
            .find(b => /^begin/i.test((b.textContent || b.value || '').trim()));
        if (beginBtn) {
            simulateClick(beginBtn);
            toast('🤖 <b style="color:#00d4ff;">Starting human verification...</b>', 3000);
            console.log('[auth.js] Begin clicked — waiting for CAPTCHA grid to appear');
            await sleep(3000);
            // captchaWatcher will pick up the grid once it appears
        } else {
            console.warn('[auth.js] Begin button not found');
        }
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

    // ── Rate limited: wait 65s then click Send verification code again ────────
    var _rateLimitHandling = false;
    async function handleVerifyRateLimited() {
        if (_rateLimitHandling) return; // prevent multiple timers
        _rateLimitHandling = true;
        console.log('[auth.js] Rate limited — waiting 65s before retrying...');
        toast('⏳ <b style="color:#f59e0b;">Rate limited — auto-retrying in 30 seconds...</b>', 31000);
        await sleep(30000);

        // Click Send verification code
        const sendBtn = [...document.querySelectorAll('button')]
            .find(b => b.textContent.includes('Send verification code'));
        if (sendBtn) {
            console.log('[auth.js] 65s elapsed — clicking Send verification code');
            toast('📧 <b style="color:#00d4ff;">Retrying — sending verification code...</b>');
            simulateClick(sendBtn);
        } else {
            console.log('[auth.js] Send button not found after 65s wait');
        }
        _rateLimitHandling = false;
        _verifyTypeDone = false; // allow re-detection if needed
    }

    // ── Login Email: fill stored email → click Continue ─────────────────────
    async function handleLoginEmail() {
        console.log('[auth.js] handleLoginEmail — filling email from storage');
        var data = await new Promise(function(r) {
            chrome.storage.local.get(['__un'], function(d) { r(d); });
        });
        var email = data['__un'] || '';
        if (!email) {
            console.log('[auth.js] No stored email — cannot auto-fill');
            return;
        }

        var emailInput = document.querySelector('input[data-test-id="input-test-id-login"]');
        if (!emailInput) return;

        simulateInput(emailInput, email);
        await sleep(500);
        toast('📧 <b style="color:#00d4ff;">Filling login: ' + email + '</b>', 3000);

        // Click Continue
        await sleep(800);
        var continueBtn = [...document.querySelectorAll('button')]
            .find(function(b) { return /continue/i.test(b.textContent.trim()); });
        if (continueBtn) {
            simulateClick(continueBtn);
            console.log('[auth.js] Continue clicked after email fill');
        }
    }

    // ── Login PIN: fill stored PIN → click Continue ──────────────────────────
    async function handleLoginPin() {
        console.log('[auth.js] handleLoginPin — filling PIN from storage');
        var data = await new Promise(function(r) {
            chrome.storage.local.get(['__pw'], function(d) { r(d); });
        });
        var pin = data['__pw'] || '';
        if (!pin) {
            console.log('[auth.js] No stored PIN — cannot auto-fill');
            return;
        }

        var pinInput = document.querySelector('input[data-test-id="input-test-id-pin"]');
        if (!pinInput) return;

        simulateInput(pinInput, pin);
        await sleep(500);
        toast('🔑 <b style="color:#00d4ff;">Filling PIN...</b>', 2000);

        // Click Continue
        await sleep(800);
        var continueBtn = document.querySelector('button[data-test-id="button-continue"]')
                       || [...document.querySelectorAll('button')]
                          .find(function(b) { return /continue/i.test(b.textContent.trim()); });
        if (continueBtn) {
            simulateClick(continueBtn);
            console.log('[auth.js] Continue clicked after PIN fill');
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

        // ── A: Find CAPTCHA area ───────────────────────────────────────────────
        // Two modes: 1) Modal (login flow), 2) Full-page (human verification)
        const tryList = ['#captchaModal','.captcha-modal','[data-test-id="captchaModal"]',
                         '#captchaModalOverlay > *:first-child','.captcha-overlay > *:first-child'];
        let modal = null;
        let isFullPage = false; // true = standalone "Let's confirm you are human" page
        for (const s of tryList) { const el = document.querySelector(s); if (el) { modal = el; break; } }

        if (!modal) {
            // Check if this is the full-page CAPTCHA ("Choose all the hats")
            const bodyText = document.body.innerText || '';
            if (bodyText.includes('Choose all') || bodyText.includes('confirm you are human')) {
                // Use the entire visible page as the "modal"
                modal = document.body;
                isFullPage = true;
                console.log('[auth.js] Full-page CAPTCHA detected');
            } else {
                console.warn('[auth.js] No CAPTCHA modal or page found');
                return;
            }
        }

        if (!isFullPage) {
            try { modal.scrollIntoView({ block: 'start', behavior: 'instant' }); } catch(_) {}
            await sleep(300);
            const _mr0 = modal.getBoundingClientRect();
            if (_mr0.top < 60) { window.scrollBy(0, _mr0.top - 60); await sleep(200); }
        }

        const mr = isFullPage
            ? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }
            : modal.getBoundingClientRect();
        const modalRect = {
            top:    Math.max(0, Math.round(mr.top)),
            left:   Math.round(mr.left),
            width:  isFullPage ? Math.round(window.innerWidth) : (mr.width > 700 ? Math.round(window.innerWidth * 0.24) : Math.round(mr.width)),
            height: isFullPage ? Math.round(window.innerHeight) : (mr.width > 700 ? Math.round(window.innerHeight * 0.82) : Math.round(mr.height))
        };
        console.log('[auth.js] CAPTCHA rect:', JSON.stringify(modalRect), 'fullPage:', isFullPage);

        // ── B: Groq key ────────────────────────────────────────────────────────
        let groqKey = '';
        try { groqKey = (await chrome.storage.local.get(['groq_api_key'])).groq_api_key || ''; } catch(_) {}
        // No fallback key — user must enter their own key in the popup
        if (!groqKey) {
            // Guide is shown after PIN entry (in fetch.js) — just remind here
            toast('&#9888; <b style="color:#f59e0b;">No Groq API key!</b> Open the ShiftSniper popup &rarr; AI Captcha Solver &rarr; paste your <span style="color:#22d3ee;font-family:monospace;">gsk_</span> key. Solving manually for now.', 8000);
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

        // ── E: Groq call ───────────────────────────────────────────────────────
        console.log('[auth.js] calling Groq...');
        let positions = [];
        try {
            const ctl = new AbortController();
            const gt = setTimeout(() => ctl.abort(), 22000);
            let gResp;
            try {
                gResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    signal: ctl.signal, method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
                    body: JSON.stringify({
                        model: 'qwen/qwen3.6-27b',
                        max_tokens: 800, temperature: 0.1,
                        messages: [
                            { role: 'system', content: 'You are a precise CAPTCHA solver. You MUST describe every single cell before answering. IMPORTANT: You MUST select EXACTLY 5 cells. Always end with FINAL ANSWER: on its own line.' },
                            { role: 'user', content: [
                                { type: 'image_url', image_url: { url: cropUrl } },
                                { type: 'text', text: `Solve this CAPTCHA. The image shows a popup with a 3x3 grid.

STEP 1 - Read the task:
Find the underlined word in "Choose all the ___". Write: Task: [word]

STEP 2 - Describe EVERY cell (you must fill in all 9):
Cell 1: [describe what you see]
Cell 2: [describe what you see]
Cell 3: [describe what you see]
Cell 4: [describe what you see]
Cell 5: [describe what you see]
Cell 6: [describe what you see]
Cell 7: [describe what you see]
Cell 8: [describe what you see]
Cell 9: [describe what you see]

STEP 3 - Select EXACTLY 5 cells:
Which cells match the Task word? You MUST pick EXACTLY 5 cells. Even if unsure, always pick 5.

FINAL ANSWER: [exactly 5 numbers, e.g. 1,2,4,7,9]` }
                            ]}
                        ]
                    })
                });
            } finally { clearTimeout(gt); }
            // Check for rate limiting (429)
            if (gResp.status === 429) {
                console.log('[auth.js] Groq rate limited (429) — waiting 15s before retry');
                toast('⏸️ <b style="color:#f59e0b;">Groq rate limited — waiting 15s...</b>', 15000);
                _groqRateLimited = true;
                await sleep(15000);
                _groqRateLimited = false;
                return; // Exit — captchaWatcher will retry after cooldown
            }
            if (!gResp.ok) {
                console.log('[auth.js] Groq error:', gResp.status);
                toast('❌ Groq error: ' + gResp.status, 5000);
                await sleep(5000);
                return;
            }
            const gData = await gResp.json();
            const resp = (gData.choices && gData.choices[0] && gData.choices[0].message && gData.choices[0].message.content || '').trim();
            console.log('[auth.js] Groq:', resp);
            // Try multiple parsing patterns — different models format answers differently
            var fm = resp.match(/FINAL ANSWER:\s*([0-9][0-9,\s]*|NONE)/i);
            if (!fm) {
                // Fallback: look for "matching cells are X, Y, Z" pattern
                fm = resp.match(/matching cells?\s*(?:are|:)\s*([0-9][0-9,\s]*)/i);
            }
            if (!fm) {
                // Fallback: look for any line that's just numbers at the end
                fm = resp.match(/(?:^|\n)\s*([0-9](?:[,\s]+[0-9])*)\s*\.?\s*$/m);
            }
            if (!fm) {
                // Fallback: find all single digits mentioned after "select" or "answer" or "match"
                var answerSection = resp.slice(resp.toLowerCase().lastIndexOf('select'));
                if (answerSection.length < 5) answerSection = resp.slice(-200);
                var digits = answerSection.match(/\b([1-9])\b/g);
                if (digits && digits.length >= 1 && digits.length <= 6) {
                    fm = [null, digits.join(',')];
                }
            }
            if (fm && fm[1] && fm[1].toUpperCase() !== 'NONE') {
                positions = fm[1].split(/[,\s]+/).map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 1 && n <= 9);
            }

            // Enforce exactly 5 selections — pad or trim as needed
            if (positions.length > 0 && positions.length !== 5) {
                console.log('[auth.js] AI gave', positions.length, 'positions — adjusting to 5');
                if (positions.length > 5) {
                    // Too many — keep first 5
                    positions = positions.slice(0, 5);
                } else {
                    // Too few — add random cells that aren't already selected
                    var available = [1,2,3,4,5,6,7,8,9].filter(n => positions.indexOf(n) === -1);
                    while (positions.length < 5 && available.length > 0) {
                        var randIdx = Math.floor(Math.random() * available.length);
                        positions.push(available[randIdx]);
                        available.splice(randIdx, 1);
                    }
                }
                console.log('[auth.js] Adjusted to 5 positions:', positions);
            }
        } catch(e) { toast('❌ Groq error: ' + e.message, 5000); return; }

        if (!positions.length) { console.warn('[auth.js] no positions'); return; }
        console.log('[auth.js] positions:', positions);
        toast('🤖 <b style="color:#4CAF50;">Clicking: ' + positions.join(',') + '</b>', 5000);

        // ── F: Build cell click coordinates ───────────────────────────────────
        let cellClicks;
        if (isFullPage) {
            // Full-page CAPTCHA: find the actual image grid position
            const gridImgs = [...document.querySelectorAll('img')].filter(img => {
                const r = img.getBoundingClientRect();
                return r.width >= 70 && r.width <= 250 && r.height >= 70 && r.height <= 250 && r.top > 30;
            });
            if (gridImgs.length >= 6) {
                // Calculate grid bounds from actual images
                let minX = 9999, minY = 9999, maxX = 0, maxY = 0;
                gridImgs.forEach(img => {
                    const r = img.getBoundingClientRect();
                    minX = Math.min(minX, r.left);
                    minY = Math.min(minY, r.top);
                    maxX = Math.max(maxX, r.right);
                    maxY = Math.max(maxY, r.bottom);
                });
                const gridW = maxX - minX, gridH = maxY - minY;
                const cW = gridW / 3, cH = gridH / 3;
                cellClicks = positions.map(pos => {
                    const row = Math.floor((pos-1)/3), col = (pos-1)%3;
                    return { x: minX + col*cW + cW/2, y: minY + row*cH + cH/2 };
                });
            } else {
                // Fallback: estimate from page center
                const gT = modalRect.height * 0.15;
                const gL = modalRect.width * 0.35;
                const cW = (modalRect.width * 0.30) / 3;
                const cH = (modalRect.height * 0.55) / 3;
                cellClicks = positions.map(pos => {
                    const row = Math.floor((pos-1)/3), col = (pos-1)%3;
                    return { x: gL + col*cW + cW/2, y: gT + row*cH + cH/2 };
                });
            }
        } else {
            // Modal CAPTCHA: original calculation
            const gT = modalRect.top  + modalRect.height * 0.17;
            const gL = modalRect.left + modalRect.width  * 0.03;
            const cW = (modalRect.width  * 0.94) / 3;
            const cH = (modalRect.height * 0.62) / 3;
            cellClicks = positions.map(pos => {
                const row = Math.floor((pos-1)/3), col = (pos-1)%3;
                return { x: gL + col*cW + cW/2, y: gT + row*cH + cH/2 };
            });
        }

        // ── G: Click cells then Confirm ────────────────────────────────────────
        if (isFullPage) {
            // Full-page mode: use debugger for cells, then click Confirm button directly
            console.log('[auth.js] Full-page CAPTCHA — clicking cells via debugger...');
            const clickResult = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'debuggerClick', clicks: cellClicks }, r => {
                    if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
                    else resolve(r || { error: 'no response' });
                });
            });
            console.log('[auth.js] Cell clicks result:', JSON.stringify(clickResult));
            if (clickResult.error) { toast('❌ ' + clickResult.error, 5000); return; }

            // Wait for selections to register, then click Confirm
            await sleep(800);
            const confirmBtn = [...document.querySelectorAll('button, input[type="submit"]')]
                .find(b => /confirm/i.test(b.textContent || b.value || ''));
            if (confirmBtn) {
                simulateClick(confirmBtn);
                console.log('[auth.js] Confirm button clicked (full-page)');
                toast('✅ <b style="color:#4CAF50;">Submitted: ' + positions.join(',') + '</b>', 5000);
            } else {
                // Fallback: try debugger click at Confirm button location
                console.warn('[auth.js] Confirm button not found — trying debugger click');
                const confirmClicks = [{ x: Math.round(window.innerWidth * 0.7), y: Math.round(window.innerHeight * 0.85) }];
                chrome.runtime.sendMessage({ action: 'debuggerClick', clicks: confirmClicks });
            }
        } else {
            // Modal mode: original approach (shadow DOM pierce)
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
        }

        // ── H: Wait for CAPTCHA outcome (up to 3s) ────────────────────────────
        console.log('[auth.js] waiting for outcome...');
        let outcome = 'pending';
        for (let w = 0; w < 8; w++) {
            await sleep(400);
            const txt = document.body.innerText;
            // Full-page: success = page navigates away (no more "Choose all" text)
            if (isFullPage) {
                if (!txt.includes('Choose all') && !txt.includes('confirm you are human')) {
                    outcome = 'success'; break;
                }
            } else {
                if (!document.querySelector('#captchaModal, .captcha-modal, awswaf-captcha')) {
                    outcome = 'success'; break;
                }
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
    var _otpRequestedAt = 0; // Timestamp when OTP was requested — only accept newer emails
    var _lastUsedOtp = null; // Last OTP code we tried — skip if same code appears again

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

        // Step 9: Login successful — go to hiring root (Amazon handles session redirect)
        console.log('[auth.js] OTP flow complete — navigating to hiring root');
        await sleep(1000);
        if (window.location.href.includes('auth.hiring')) {
            // Go to root — Amazon will redirect to jobSearch once session is established
            window.location.href = 'https://hiring.amazon.ca/';
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
    var _groqRateLimited = false; // Flag: Groq returned 429, need to wait longer

    async function runStep() {
        if (_handling) return;
        const step = detectStep();
        if (!step || step === 'captcha') return; // CAPTCHA has its own watcher
        _handling = true;
        try {
            console.log('[auth.js] step:', step);
            await sleep(400);
            if      (step === 'verify-type') await handleVerifyType();
            else if (step === 'verify-rate-limited') await handleVerifyRateLimited();
            else if (step === 'captcha-begin') await handleCaptchaBegin();
            else if (step === 'otp')         await handleOTP();
            else if (step === 'login-email') await handleLoginEmail();
            else if (step === 'login-pin')   await handleLoginPin();
        } finally {
            _handling = false;
        }
    }

    // ── Dedicated CAPTCHA watcher — runs every 600ms, completely independent ──
    async function captchaWatcher() {
        if (_captchaHandling) return;

        var isAuthPage = window.location.href.includes('auth.hiring.amazon');
        var bodyText = document.body.innerText || '';

        // Detect "Begin" button page (pre-CAPTCHA) — on any Amazon page
        var beginBtn = [...document.querySelectorAll('button, input[type="submit"], a')]
            .find(function(b) { return /^begin/i.test((b.textContent || b.value || '').trim()); });
        if (beginBtn && (bodyText.includes('confirm you are human') || bodyText.includes('security check'))) {
            console.log('[auth.js] captchaWatcher: Begin page detected — clicking Begin');
            _captchaHandling = true;
            try {
                await handleCaptchaBegin();
            } finally {
                await sleep(3000);
                _captchaHandling = false;
            }
            return;
        }

        // Detect CAPTCHA grid — WAF widget or "Choose all" text on any page
        const hasWidget = !!document.querySelector('awswaf-captcha, [id*="awswaf"], [class*="awswaf"]');
        const hasChooseAll = bodyText.includes('Choose all');

        // Image grid detection — ONLY on auth pages (jobSearch has warehouse photos)
        var hasCaptchaImgs = false;
        if (isAuthPage || hasChooseAll) {
            const imgs = [...document.querySelectorAll('img')].filter(img => {
                const r = img.getBoundingClientRect();
                return r.width  >= 60 && r.width  <= 350 &&
                       r.height >= 60 && r.height <= 350 &&
                       r.bottom > 50 &&
                       img.src && img.src.startsWith('http');
            });
            hasCaptchaImgs = imgs.length >= 6;
        }

        if (hasWidget || hasChooseAll || hasCaptchaImgs) {
            console.log('[auth.js] CAPTCHA detected! widget:', hasWidget, 'chooseAll:', hasChooseAll, 'imgs:', hasCaptchaImgs);
            _captchaHandling = true;
            try {
                await handleCaptcha();
            } finally {
                var _retryCooldown = _groqRateLimited ? 15000 : 4000;
                await sleep(_retryCooldown);
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
