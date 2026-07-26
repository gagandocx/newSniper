// ── License server proxy (background has no CORS/redirect restrictions) ──────
chrome['runtime']['onMessage']['addListener'](function(a, b, c) {
    if (a['action'] === 'licenseRequest') {
        fetch(a['url'], {
            method: 'GET',
            redirect: 'follow',
            headers: { 'Accept': 'application/json' }
        })
        .then(function(resp) { return resp.text(); })
        .then(function(text) {
            console.log('[bg] License response:', text.substring(0, 200));
            try {
                c(JSON.parse(text));
            } catch(e) {
                // Google might return HTML login page — extract error
                if (text.includes('<!DOCTYPE') || text.includes('<html')) {
                    c({ success: false, error: 'Google auth redirect — deploy as "Anyone"' });
                } else {
                    c({ success: false, error: 'Parse error: ' + text.substring(0, 100) });
                }
            }
        })
        .catch(function(err) {
            console.error('[bg] License fetch error:', err);
            c({ success: false, error: err.message || 'Network error' });
        });
        return true; // keep message channel open for async response
    }
});
// ─────────────────────────────────────────────────────────────────────────────

chrome['runtime']['onConnect']['addListener'](function (a) {
    a['onMessage']['addListener'](async function (b) {
        let c = new Object();
        c['action'] = b['action'];
        if (b['action'] == 'fetch_info') {
            let {__un: d} = await chrome['storage']['local']['get']('__un'), {__pw: e} = await chrome['storage']['local']['get']('__pw'), {candidateID: f} = await chrome['storage']['local']['get']('candidateID'), {selectedCity: g} = await chrome['storage']['local']['get']('selectedCity'), {lat: h} = await chrome['storage']['local']['get']('lat'), {lng: i} = await chrome['storage']['local']['get']('lng'), {distance: j} = await chrome['storage']['local']['get']('distance'), {jobType: k} = await chrome['storage']['local']['get']('jobType'), {__ap: l} = await chrome['storage']['local']['get']('__ap'), m = await new Promise(n => chrome['management']['getSelf'](o => n(o['version'])));
            c['data'] = {
                '$username': d,
                '$password': e,
                '$candidateID': f,
                '$selectedCity': g,
                '$lat': h,
                '$lng': i,
                '$distance': j,
                '$jobType': k,
                '$active': l,
                '$version': m
            };
        }
        a['postMessage'](c);
    });
}), chrome['runtime']['onInstalled']['addListener'](async ({reason: a}) => {
    chrome['action']['disable'](), chrome['declarativeContent']['onPageChanged']['removeRules'](undefined, () => {
        let b = {
                'conditions': [new chrome['declarativeContent']['PageStateMatcher']({ 'pageUrl': {} })],
                'actions': [new chrome['declarativeContent']['ShowAction']()]
            }, c = [b];
        chrome['declarativeContent']['onPageChanged']['addRules'](c);
    }), a === 'install' && (await chrome['storage']['local']['set']({
        '__ap': !![],  // Auto-activate on fresh install
        '__cr': 0x0,
        '__fq': 0.5,
        '__gp': 0x3,
        '__tdgp': 0x3
    }), chrome['tabs']['create']({ 'url': 'https://hiring.amazon.ca/app#/jobSearch' })), chrome['storage']['onChanged']['addListener']((b, c) => {
        if (c === 'local' && b['candidateId']) {
            const d = b['candidateId']['newValue'];
        }
    });
}), chrome['tabs']['onUpdated']['addListener']((a, b, c) => {
    b['status'] === 'complete' && ((c['url']['includes']('hiring.amazon.ca/application/us/') || c['url']['includes']('hiring.amazon.com/application/us/')) && c['url']['includes']('jobId=') && chrome['scripting']['executeScript']({
        'target': { 'tabId': a },
        'files': ['Createapp.js']
    }, () => {
    }));
}), chrome['runtime']['onMessage']['addListener']((a, b, c) => {
    // ── CAPTCHA solver via Debugger API ─────────────────────────────────────────
    // Uses screenshot + Groq to identify positions, then debugger for real mouse events
    // This is the ONLY reliable way to click inside cross-origin iframes (AWS WAF CAPTCHA)
    // ── Fast handler 1: just take screenshot and return dataUrl ─────────────
    if (a['action'] === 'takeScreenshot') {
        const _wid = b && b.tab ? b.tab.windowId : null;
        if (!_wid) { c({ error: 'no windowId' }); return true; }
        chrome.tabs.captureVisibleTab(_wid, { format: 'jpeg', quality: 88 }, function(url) {
            if (chrome.runtime.lastError) c({ error: chrome.runtime.lastError.message });
            else c({ dataUrl: url || null });
        });
        return true;
    }

    // ── Fast handler 2: click a list of x,y coords via debugger then detach ─
    if (a['action'] === 'debuggerClick') {
        const _tabId = b && b.tab ? b.tab.id : null;
        const { clicks } = a; // [{x,y}, ...]
        if (!_tabId || !clicks || !clicks.length) { c({ error: 'bad args' }); return true; }
        (async function() {
            try {
                await new Promise(function(res, rej) {
                    chrome.debugger.attach({ tabId: _tabId }, '1.3', function() {
                        if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
                        else res();
                    });
                });
                for (var i = 0; i < clicks.length; i++) {
                    // Honor pauseBefore (used to delay confirm click without detaching)
                    if (clicks[i].pauseBefore) {
                        await new Promise(function(r){ setTimeout(r, clicks[i].pauseBefore); });
                    }
                    var p = { x: Math.round(clicks[i].x), y: Math.round(clicks[i].y), button: 'left', clickCount: 1, modifiers: 0 };
                    await new Promise(function(r){ chrome.debugger.sendCommand({ tabId: _tabId }, 'Input.dispatchMouseEvent', Object.assign({}, p, { type: 'mousePressed' }), r); });
                    await new Promise(function(r){ setTimeout(r, 70); });
                    await new Promise(function(r){ chrome.debugger.sendCommand({ tabId: _tabId }, 'Input.dispatchMouseEvent', Object.assign({}, p, { type: 'mouseReleased' }), r); });
                    await new Promise(function(r){ setTimeout(r, 160 + Math.floor(Math.random() * 80)); });
                }
                await new Promise(function(r){ chrome.debugger.detach({ tabId: _tabId }, r); });
                c({ success: true });
            } catch(e) {
                try { chrome.debugger.detach({ tabId: _tabId }, function(){}); } catch(_) {}
                c({ error: e.message || String(e) });
            }
        })();
        return true;
    }


    // ── Click Confirm button inside AWS WAF captcha iframe via CDP Runtime ──────
    if (a['action'] === 'clickConfirmInIframe') {
        const _tabId = b && b.tab ? b.tab.id : null;
        if (!_tabId) { c({ error: 'no tabId' }); return true; }

        (async function() {
            try {
                await new Promise(function(res, rej) {
                    chrome.debugger.attach({ tabId: _tabId }, '1.3', function() {
                        if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
                        else res();
                    });
                });

                // Get all frames to find the captcha iframe
                const frameTree = await new Promise(function(res) {
                    chrome.debugger.sendCommand({ tabId: _tabId }, 'Page.getFrameTree', {}, res);
                });

                let captchaFrameId = null;
                function findCaptchaFrame(frame) {
                    if (frame.frame && frame.frame.url && frame.frame.url.includes('captcha')) {
                        captchaFrameId = frame.frame.id;
                        return;
                    }
                    if (frame.childFrames) {
                        frame.childFrames.forEach(findCaptchaFrame);
                    }
                }
                if (frameTree && frameTree.frameTree) findCaptchaFrame(frameTree.frameTree);
                console.log('[bg] captcha frameId:', captchaFrameId);

                let clicked = false;
                if (captchaFrameId) {
                    // Get execution context for the captcha iframe
                    const contexts = await new Promise(function(res) {
                        chrome.debugger.sendCommand({ tabId: _tabId }, 'Runtime.evaluate', {
                            expression: '(function() { var frames = document.querySelectorAll("iframe"); for (var i=0; i<frames.length; i++) { if (frames[i].src && frames[i].src.includes("captcha")) return i; } return -1; })()',
                        }, res);
                    });

                    // Try executing in iframe using executeScript approach
                    const result = await new Promise(function(res) {
                        chrome.debugger.sendCommand({ tabId: _tabId }, 'Runtime.evaluate', {
                            expression: '(function() { var iframes = document.querySelectorAll("iframe"); for (var i = 0; i < iframes.length; i++) { try { var btn = iframes[i].contentDocument && iframes[i].contentDocument.querySelector("button"); if (btn) { btn.click(); return "clicked via iframe[" + i + "]"; } } catch(e) {} } return "not found"; })()',
                        }, res);
                    });
                    console.log('[bg] iframe button click result:', JSON.stringify(result));
                    if (result && result.result && result.result.value && result.result.value.startsWith('clicked')) {
                        clicked = true;
                    }
                }

                // Fallback: click at fixed offset from bottom-right of the captcha modal area
                if (!clicked) {
                    const { modalRect } = a;
                    if (modalRect) {
                        var cx = modalRect.left + modalRect.width * 0.69;
                        var cy = modalRect.top + modalRect.height * 0.95;
                        console.log('[bg] Confirm fallback CDP click at', Math.round(cx), Math.round(cy));
                        var p = { x: Math.round(cx), y: Math.round(cy), button: 'left', clickCount: 1, modifiers: 0 };
                        await new Promise(function(r) { chrome.debugger.sendCommand({ tabId: _tabId }, 'Input.dispatchMouseEvent', Object.assign({}, p, { type: 'mousePressed' }), r); });
                        await new Promise(function(r) { setTimeout(r, 80); });
                        await new Promise(function(r) { chrome.debugger.sendCommand({ tabId: _tabId }, 'Input.dispatchMouseEvent', Object.assign({}, p, { type: 'mouseReleased' }), r); });
                        clicked = true;
                    }
                }

                await new Promise(function(r) { chrome.debugger.detach({ tabId: _tabId }, r); });
                c({ success: true, clicked });
            } catch(err) {
                try { chrome.debugger.detach({ tabId: _tabId }, function() {}); } catch(_) {}
                c({ error: err.message || String(err) });
            }
        })();
        return true;
    }

    // ── One session: click cells + Confirm (shadow DOM pierce) ──────────────────
    if (a['action'] === 'clickCellsAndConfirm') {
        const _tabId = b && b.tab ? b.tab.id : null;
        const { cellClicks } = a;
        if (!_tabId) { c({ error: 'no tabId' }); return true; }

        (async function() {
            try {
                // Attach once
                await new Promise(function(res, rej) {
                    chrome.debugger.attach({ tabId: _tabId }, '1.3', function() {
                        if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
                        else res();
                    });
                });

                // Click each cell
                for (var i = 0; i < cellClicks.length; i++) {
                    var p = { x: Math.round(cellClicks[i].x), y: Math.round(cellClicks[i].y), button: 'left', clickCount: 1, modifiers: 0 };
                    await new Promise(function(r) { chrome.debugger.sendCommand({ tabId: _tabId }, 'Input.dispatchMouseEvent', Object.assign({type:'mousePressed'}, p), r); });
                    await new Promise(function(r) { setTimeout(r, 65); });
                    await new Promise(function(r) { chrome.debugger.sendCommand({ tabId: _tabId }, 'Input.dispatchMouseEvent', Object.assign({type:'mouseReleased'}, p), r); });
                    await new Promise(function(r) { setTimeout(r, 170 + Math.floor(Math.random()*80)); });
                }

                // Wait for selections to register
                await new Promise(function(r) { setTimeout(r, 700); });

                // Pierce shadow DOM to click Confirm — no coordinate guessing
                const confirmResult = await new Promise(function(res) {
                    chrome.debugger.sendCommand({ tabId: _tabId }, 'Runtime.evaluate', {
                        expression: [
                            '(function() {',
                            '  var host = document.querySelector("awswaf-captcha");',
                            '  if (host && host.shadowRoot) {',
                            '    var btn = host.shadowRoot.querySelector("#amzn-btn-verify-internal, .btn.btn-primary, button[type=submit]");',
                            '    if (btn) { btn.click(); return "shadow:clicked"; }',
                            '  }',
                            '  var btn2 = document.querySelector("#amzn-btn-verify-internal, button[type=submit]");',
                            '  if (btn2) { btn2.click(); return "dom:clicked"; }',
                            '  return "not-found";',
                            '})()'
                        ].join('\n'),
                        awaitPromise: false
                    }, res);
                });
                console.log('[bg] Confirm click result:', JSON.stringify(confirmResult));

                await new Promise(function(r) { chrome.debugger.detach({ tabId: _tabId }, r); });
                var val = confirmResult && confirmResult.result && confirmResult.result.value;
                c({ success: true, confirmStatus: val });
            } catch(err) {
                console.error('[bg] clickCellsAndConfirm error:', err.message);
                try { chrome.debugger.detach({ tabId: _tabId }, function(){}); } catch(_) {}
                c({ error: err.message || String(err) });
            }
        })();
        return true;
    }

    if (a['action'] === 'refreshGmailTab') {
        chrome['tabs']['query']({ 'url': '*://mail.google.com/*' }, function(tabs) {
            if (!tabs || !tabs[0]) {
                // No Gmail tab open — auto-open one
                console.log('[bg] No Gmail tab found — opening mail.google.com');
                chrome['tabs']['create']({ 'url': 'https://mail.google.com/', 'active': false }, function(newTab) {
                    // Wait 5s for Gmail to load then signal done
                    setTimeout(function() { c({ done: true, opened: true }); }, 5000);
                });
                return;
            }
            chrome['tabs']['reload'](tabs[0]['id'], { bypassCache: true }, function() {
                // Poll until loaded
                var tabId = tabs[0]['id'];
                var tries = 0;
                function poll() {
                    chrome['tabs']['get'](tabId, function(tab) {
                        if (tab && tab['status'] === 'complete') {
                            setTimeout(function() { c({ done: true }); }, 2000); // +2s for Gmail render
                        } else if (tries++ < 20) {
                            setTimeout(poll, 500);
                        } else {
                            c({ done: true }); // timeout
                        }
                    });
                }
                poll();
            });
        });
        return true;
    }
    if (a['action'] === 'getTabId') {
        c({ tabId: b && b.tab ? b.tab.id : null });
        return;
    }

    if (a['action'] === 'captureScreen') {
        // Must capture the ACTIVE visible tab — captureVisibleTab only works on active tabs
        chrome['tabs']['query']({ 'active': !![], 'currentWindow': !![] }, function(tabs) {
            if (!tabs || !tabs[0]) { c({ 'dataUrl': null }); return; }
            chrome['tabs']['captureVisibleTab'](tabs[0]['windowId'], { 'format': 'png', 'quality': 100 }, function(dataUrl) {
                if (chrome.runtime.lastError) {
                    console.error('captureVisibleTab error:', chrome.runtime.lastError.message);
                    c({ 'dataUrl': null });
                    return;
                }
                c({ 'dataUrl': dataUrl || null });
            });
        });
        return !![];
    }
    if (a['action'] === 'fetchGmailOTP') {
        // ── FIX: robust OTP reader — polls Gmail DOM with retries, removed duplicate ──
        chrome['tabs']['query']({ 'url': '*://mail.google.com/*' }, function(tabs) {
            if (!tabs || !tabs[0]) {
                console.log('[bg] fetchGmailOTP: no Gmail tab — opening one');
                chrome['tabs']['create']({ 'url': 'https://mail.google.com/', 'active': false }, function() {
                    setTimeout(function() { c({ 'otp': null, 'gmailOpened': true }); }, 500);
                });
                return;
            }
            var tabId = tabs[0]['id'];
            chrome['scripting']['executeScript']({
                'target': { 'tabId': tabId },
                'func': async function() {
                    // ── Collect ALL 6-digit codes near Amazon/verification text ────────────
                    // Returns them in order (oldest first, newest last).
                    // Caller always takes the LAST one = newest OTP in thread.
                    function extractAllCodes(text) {
                        if (!text) return [];
                        var codes = [];
                        var t = text.replace(/\s+/g, ' ');
                        var patterns = [
                            /verification\s+code[^0-9]{0,80}(\d{6})/gi,
                            /amazon\s+jobs[^0-9]{0,60}(\d{6})/gi,
                            /your\s+code[^0-9]{0,50}(\d{6})/gi,
                            /Amazon[^0-9]{0,100}(\d{6})/gi
                        ];
                        patterns.forEach(function(re) {
                            var m;
                            while ((m = re.exec(t)) !== null) {
                                if (codes.indexOf(m[1]) === -1) codes.push(m[1]);
                            }
                        });
                        return codes; // ordered first→last = oldest→newest
                    }

                    // ── Read codes from ALL open email bodies in the thread ───────────────
                    // Gmail thread: oldest message at TOP, newest at BOTTOM.
                    // We collect from every .a3s.aiL body and return the LAST code = newest.
                    function getNewestCodeFromOpenThread() {
                        var allCodes = [];
                        // Primary Gmail email body selectors
                        var bodyEls = document.querySelectorAll('.a3s.aiL, .ii.gt .a3s, [data-message-id] .a3s');
                        bodyEls.forEach(function(el) {
                            extractAllCodes(el.innerText || el.textContent || '').forEach(function(c) {
                                if (allCodes.indexOf(c) === -1) allCodes.push(c);
                            });
                        });
                        // Fallback: any .a3s element
                        if (allCodes.length === 0) {
                            document.querySelectorAll('.a3s').forEach(function(el) {
                                extractAllCodes(el.innerText || el.textContent || '').forEach(function(c) {
                                    if (allCodes.indexOf(c) === -1) allCodes.push(c);
                                });
                            });
                        }
                        console.log('[gmail] All codes from open thread:', allCodes);
                        // LAST code = bottom of thread = newest OTP
                        return allCodes.length > 0 ? allCodes[allCodes.length - 1] : null;
                    }

                    // ── STEP 1: Check if Amazon OTP thread is already open ────────────────
                    var openCode = getNewestCodeFromOpenThread();
                    if (openCode) {
                        console.log('[gmail] Thread already open, newest code:', openCode);
                        return openCode;
                    }

                    // ── STEP 2: Find Amazon Jobs thread in inbox and open it ──────────────
                    var rows = document.querySelectorAll('tr.zA, [data-thread-id], [data-legacy-thread-id], [data-item-id]');
                    var amazonRow = null;
                    for (var r = 0; r < rows.length; r++) {
                        var rtxt = rows[r].innerText || '';
                        if (/amazon.*verif|verif.*amazon|amazon.{0,20}jobs/i.test(rtxt)) {
                            amazonRow = rows[r];
                            break; // Gmail inbox: newest thread is at TOP — first match is newest
                        }
                    }

                    if (amazonRow) {
                        console.log('[gmail] Found Amazon thread row — clicking to open');
                        amazonRow.click();

                        // ── STEP 3: Wait for thread to fully load (3s) then re-read ─────
                        await new Promise(function(r) { setTimeout(r, 3000); });

                        // Re-read from opened thread — returns LAST code = newest message
                        var threadCode = getNewestCodeFromOpenThread();
                        if (threadCode) {
                            console.log('[gmail] Code from opened thread (newest):', threadCode);
                            return threadCode;
                        }

                        // Extra wait if thread is still loading
                        await new Promise(function(r) { setTimeout(r, 2000); });
                        threadCode = getNewestCodeFromOpenThread();
                        if (threadCode) return threadCode;
                    }

                    // ── STEP 4: Brute force — scan full page text, return LAST code ───────
                    var codes = extractAllCodes(document.body.innerText || '');
                    if (codes.length > 0) {
                        console.log('[gmail] Brute force codes found:', codes, '→ returning last');
                        return codes[codes.length - 1];
                    }

                    console.log('[gmail] No OTP found');
                    return null;
                }
            }, function(results) {
                if (chrome['runtime']['lastError']) {
                    console.error('[bg] Gmail DOM read error:', chrome['runtime']['lastError']['message']);
                    c({ 'otp': null });
                    return;
                }
                var otp = results && results[0] && results[0]['result'];
                console.log('[bg] Gmail OTP from DOM:', otp);
                c({ 'otp': otp || null });
            });
        });
        return true;
    }
    // ── Groq Vision API — called from auth.js content script ──────────────────
    // Content scripts on auth.hiring.amazon.com get CORS-blocked calling Groq directly.
    // Service worker (background.js) has no CORS restrictions — it proxies the call.
    if (a['action'] === 'groqVisionRequest') {
        var _gKey   = a['groqKey'];
        var _gModel = a['model'];
        var _gImg   = a['imageUrl'];
        var _gProm  = a['prompt'];
        var _gSys   = 'You are a precise CAPTCHA solver. You MUST describe every single cell before answering. Always end with FINAL ANSWER: on its own line.';
        (async function() {
            try {
                var resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + _gKey
                    },
                    body: JSON.stringify({
                        model: _gModel,
                        max_tokens: 2000,
                        temperature: 0.1,
                        messages: [
                            { role: 'system', content: _gSys },
                            { role: 'user', content: [
                                { type: 'image_url', image_url: { url: _gImg, detail: 'low' } },
                                { type: 'text', text: _gProm }
                            ]}
                        ]
                    })
                });
                var status = resp.status;
                if (!resp.ok) { c({ status: status, content: null }); return; }
                var data = await resp.json();
                var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
                c({ status: 200, content: text });
            } catch(err) {
                c({ status: 0, content: null, error: String(err.message || err) });
            }
        })();
        return true;
    }
    // ────────────────────────────────────────────────────────────────────────────

    if (a['action'] === 'start_fetch')
        chrome['runtime']['sendMessage']({ 'action': 'start_fetch' });
    else {
        if (a['action'] === 'stop_fetch')
            chrome['runtime']['sendMessage']({ 'action': 'stop_fetch' });
        else {
            if (a['action'] === 'playSound') {
                // Always show system notification — no permission prompt needed
                chrome['notifications']['create']('ss_job_' + Date.now(), {
                    'type': 'basic',
                    'iconUrl': chrome['runtime']['getURL']('images/logo.png'),
                    'title': '🎯 CoderSnap — Job Found!',
                    'message': (a['jobTitle'] || 'A matching warehouse shift') + ' — Applying now...',
                    'priority': 2,
                    'requireInteraction': false
                });
                const d = new Audio(chrome['runtime']['getURL']('alert.wav'));
                return d['play']()['then'](() => {
                    setTimeout(() => {
                        const e = new Audio(chrome['runtime']['getURL']('alert.wav'));
                        e['play']()['catch'](f => console['error']('Failed secondary sound:', f));
                    }, 0x3e8);
                })['catch'](e => {
                    console['error']('Failed to play sound from background:', e);
                }), !![];
            }
        }
    }
}), chrome['runtime']['onMessage']['addListener'](function (a, b, c) {
    if (a['candidateId']) {
        const d = a['candidateId'];
        chrome['storage']['local']['set']({ 'candidateId': d }, function () {
        }), c({ 'status': 'success' });
    }
});