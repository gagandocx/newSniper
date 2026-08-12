(async function (a) {
    // ── ACTIVITY STATS — tracked and sent to Google Sheet every 5 min ────────
    // Stats now PERSIST across restarts using chrome.storage.local
    // Session stats track the current run; lifetime stats accumulate forever
    var _stats = {
        startedAt: Date.now(),
        shiftsFound: 0,
        applied: 0,
        captchaSolved: 0,
        rateLimitHits: 0,
        scansCompleted: 0,
        lastShiftFoundAt: null
    };
    // Lifetime stats — loaded from storage, never reset
    var _lifetimeStats = {
        shiftsFound: 0,
        applied: 0,
        captchaSolved: 0,
        rateLimitHits: 0,
        scansCompleted: 0,
        totalSessions: 0,
        firstStartedAt: null
    };

    // Load persisted lifetime stats from chrome.storage.local
    await new Promise(function(resolve) {
        chrome.storage.local.get(['__cs_lifetime_stats'], function(data) {
            if (data['__cs_lifetime_stats']) {
                var saved = data['__cs_lifetime_stats'];
                _lifetimeStats.shiftsFound = saved.shiftsFound || 0;
                _lifetimeStats.applied = saved.applied || 0;
                _lifetimeStats.captchaSolved = saved.captchaSolved || 0;
                _lifetimeStats.rateLimitHits = saved.rateLimitHits || 0;
                _lifetimeStats.scansCompleted = saved.scansCompleted || 0;
                _lifetimeStats.totalSessions = saved.totalSessions || 0;
                _lifetimeStats.firstStartedAt = saved.firstStartedAt || null;
            }
            // Record first-ever start time if not set
            if (!_lifetimeStats.firstStartedAt) {
                _lifetimeStats.firstStartedAt = new Date().toISOString();
            }
            // Increment session count for this new run
            _lifetimeStats.totalSessions++;
            // Save immediately so session count is recorded
            chrome.storage.local.set({ '__cs_lifetime_stats': _lifetimeStats });
            resolve();
        });
    });

    // Make stats accessible globally so other functions can increment them
    window['__cs_stats'] = _stats;
    window['__cs_lifetime_stats'] = _lifetimeStats;

    // Helper: persist lifetime stats to storage (called after every heartbeat and on stat changes)
    function _persistLifetimeStats() {
        chrome.storage.local.set({ '__cs_lifetime_stats': _lifetimeStats });
    }

    (function _activityHeartbeat() {
        var STATS_INTERVAL = 5 * 60 * 1000; // 5 minutes
        var LICENSE_URL = 'https://script.google.com/macros/s/AKfycbziX_IPp8afiwz7-4Cj3QisI1dz6W0IZQAqP7vpsBrBbq0yLB-vl42HNnL4hyFYxeJEMQ/exec';

        // Track what we last sent so we only send the NEW increments each heartbeat
        var _lastSent = {
            shiftsFound: 0,
            applied: 0,
            captchaSolved: 0,
            rateLimitHits: 0,
            scansCompleted: 0
        };

        async function _sendStats() {
            try {
                var data = await new Promise(function(r) {
                    chrome.storage.local.get(['__cs_license_key', '__cs_license_email', 'selectedCity', 'distance'], function(d) { r(d); });
                });
                if (!data['__cs_license_key'] || !data['__cs_license_email']) return;

                // Calculate new increments since last send
                var newShiftsFound = _stats.shiftsFound - _lastSent.shiftsFound;
                var newApplied = _stats.applied - _lastSent.applied;
                var newCaptcha = _stats.captchaSolved - _lastSent.captchaSolved;
                var newRateLimit = _stats.rateLimitHits - _lastSent.rateLimitHits;
                var newScans = _stats.scansCompleted - _lastSent.scansCompleted;

                // Add new increments to lifetime totals
                _lifetimeStats.shiftsFound += newShiftsFound;
                _lifetimeStats.applied += newApplied;
                _lifetimeStats.captchaSolved += newCaptcha;
                _lifetimeStats.rateLimitHits += newRateLimit;
                _lifetimeStats.scansCompleted += newScans;

                // Update _lastSent to current session values
                _lastSent.shiftsFound = _stats.shiftsFound;
                _lastSent.applied = _stats.applied;
                _lastSent.captchaSolved = _stats.captchaSolved;
                _lastSent.rateLimitHits = _stats.rateLimitHits;
                _lastSent.scansCompleted = _stats.scansCompleted;

                // Persist lifetime stats locally
                _persistLifetimeStats();

                var durationMin = Math.round((Date.now() - _stats.startedAt) / 60000);
                var url = LICENSE_URL + '?action=heartbeat'
                    + '&key=' + encodeURIComponent(data['__cs_license_key'])
                    + '&email=' + encodeURIComponent(data['__cs_license_email'])
                    + '&status=running'
                    + '&duration=' + encodeURIComponent(durationMin + 'min')
                    + '&shiftsFound=' + _lifetimeStats.shiftsFound
                    + '&applied=' + _lifetimeStats.applied
                    + '&captchaSolved=' + _lifetimeStats.captchaSolved
                    + '&rateLimitHits=' + _lifetimeStats.rateLimitHits
                    + '&scans=' + _lifetimeStats.scansCompleted
                    + '&city=' + encodeURIComponent(data['selectedCity'] || 'Any')
                    + '&radius=' + encodeURIComponent(data['distance'] || '50')
                    + '&lastShift=' + encodeURIComponent(_stats.lastShiftFoundAt || 'none')
                    + '&totalSessions=' + _lifetimeStats.totalSessions
                    + '&firstStarted=' + encodeURIComponent(_lifetimeStats.firstStartedAt || 'unknown')
                    + '&sessionScans=' + _stats.scansCompleted
                    + '&sessionFound=' + _stats.shiftsFound
                    + '&sessionApplied=' + _stats.applied;

                chrome.runtime.sendMessage({ action: 'licenseRequest', url: url }, function() {});
            } catch(e) {}
        }

        setTimeout(function() {
            _sendStats();
            setInterval(_sendStats, STATS_INTERVAL);
        }, 60000);
    })();
    // ─────────────────────────────────────────────────────────────────────────

    // ── PROACTIVE SESSION REFRESH — Every 30 min, open auth tab to check/renew ──
    // If session is still valid: auth page redirects instantly → tab auto-closes
    // If session expired: auth.js handles re-login → tab auto-closes after success
    // Main scanning tab is NEVER interrupted
    (function _proactiveSessionRefresh() {
        var SESSION_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes

        function _doSessionCheck() {
            console.log('[fetch.js] Proactive session check — requesting background to open auth tab');
            chrome.runtime.sendMessage({ action: 'proactiveSessionCheck' }, function(resp) {
                if (resp && resp.done) {
                    console.log('[fetch.js] Proactive check tab opened:', resp.tabId);
                } else {
                    console.log('[fetch.js] Proactive check failed — will retry next interval');
                }
            });
        }

        // First check after 30 min, then every 30 min
        setTimeout(function() {
            _doSessionCheck();
            setInterval(_doSessionCheck, SESSION_CHECK_INTERVAL);
        }, SESSION_CHECK_INTERVAL);
    })();
    // ─────────────────────────────────────────────────────────────────────────

    // ═══════════════════════════════════════════════════════════════════════════
    // ██  PERFORMANCE ENGINE v2 — Adaptive Speed + Smart Rate Limiting  ██
    // ═══════════════════════════════════════════════════════════════════════════

    // ── FEATURE 1: ADAPTIVE SCAN INTERVAL ────────────────────────────────────
    // Scans faster during peak shift-drop hours, slower during dead hours
    // Peak hours: 4-7 AM, 11 AM-1 PM, 5-7 PM (when Amazon typically posts shifts)
    var _adaptiveEngine = {
        peakHours: [[4,7], [11,13], [17,19]], // [start, end] in 24h local time
        peakInterval: 1500,   // 1.5s during peak (slightly faster, safe)
        normalInterval: null, // set from user's configured interval
        burstMode: false,     // activated when shift was just found
        burstUntil: 0,        // timestamp when burst mode ends
        burstInterval: 1000   // 1s burst after a shift is found
    };

    function _isPeakHour() {
        var hour = new Date().getHours();
        for (var i = 0; i < _adaptiveEngine.peakHours.length; i++) {
            if (hour >= _adaptiveEngine.peakHours[i][0] && hour < _adaptiveEngine.peakHours[i][1]) return true;
        }
        return false;
    }

    function _getAdaptiveInterval(baseInterval) {
        // Burst mode: something was just found, scan ultra-fast to grab it
        if (_adaptiveEngine.burstMode && Date.now() < _adaptiveEngine.burstUntil) {
            return _adaptiveEngine.burstInterval;
        }
        if (_adaptiveEngine.burstMode && Date.now() >= _adaptiveEngine.burstUntil) {
            _adaptiveEngine.burstMode = false; // Burst expired
        }
        // Peak hours: scan at 500ms
        if (_isPeakHour()) return _adaptiveEngine.peakInterval;
        // Normal: use configured interval
        return baseInterval;
    }

    // Activate burst mode (called when shifts are found)
    function _activateBurst() {
        _adaptiveEngine.burstMode = true;
        _adaptiveEngine.burstUntil = Date.now() + 30000; // 30 second burst
        console.log('[perf] BURST MODE — scanning at 300ms for 30 seconds');
    }
    window['__cs_activateBurst'] = _activateBurst;
    // ─────────────────────────────────────────────────────────────────────────

    // ── FEATURE 2: RATE LIMIT LEARNING ───────────────────────────────────────
    // Tracks rate limit patterns and auto-throttles BEFORE hitting the limit
    var _rateLimitLearner = {
        requestsBeforeLimit: [],  // history of how many requests before each 429
        currentRequestCount: 0,
        lastResetTime: Date.now(),
        safeThreshold: null,      // learned: max safe requests per window
        windowMs: 120000,         // 2-minute sliding window
        throttled: false,
        cooldownUntil: 0
    };

    // Load learned threshold from storage
    chrome.storage.local.get(['__cs_rate_limit_threshold'], function(d) {
        if (d['__cs_rate_limit_threshold']) {
            _rateLimitLearner.safeThreshold = d['__cs_rate_limit_threshold'];
            console.log('[perf] Loaded rate limit threshold:', _rateLimitLearner.safeThreshold, 'requests per 2min');
        } else {
            // Default safe threshold until we learn the real one
            _rateLimitLearner.safeThreshold = 40; // Conservative: assume 40 req/2min is safe
        }
    });

    function _trackRequest() {
        _rateLimitLearner.currentRequestCount++;
        // Reset counter every window
        if (Date.now() - _rateLimitLearner.lastResetTime > _rateLimitLearner.windowMs) {
            _rateLimitLearner.currentRequestCount = 1;
            _rateLimitLearner.lastResetTime = Date.now();
            _rateLimitLearner.throttled = false;
        }
        // Pre-emptive throttle: if we're approaching the learned threshold
        // Only trigger ONCE per window — don't keep resetting cooldown
        if (_rateLimitLearner.safeThreshold && !_rateLimitLearner.throttled &&
            _rateLimitLearner.currentRequestCount >= _rateLimitLearner.safeThreshold - 2) {
            _rateLimitLearner.throttled = true;
            _rateLimitLearner.cooldownUntil = Date.now() + 10000; // 10s cooldown then resume
            console.log('[perf] Pre-emptive throttle — cooling down 10s');
        }
    }

    function _learnRateLimit() {
        // Called when we hit a 403/429 — learn how many requests we made before it
        var count = _rateLimitLearner.currentRequestCount;
        _rateLimitLearner.requestsBeforeLimit.push(count);
        // Keep last 10 data points
        if (_rateLimitLearner.requestsBeforeLimit.length > 10) {
            _rateLimitLearner.requestsBeforeLimit.shift();
        }
        // Calculate safe threshold: minimum of all observed limits minus buffer
        var minLimit = Math.min.apply(null, _rateLimitLearner.requestsBeforeLimit);
        _rateLimitLearner.safeThreshold = Math.max(5, minLimit - 3); // 3 request buffer
        // Persist
        chrome.storage.local.set({ '__cs_rate_limit_threshold': _rateLimitLearner.safeThreshold });
        console.log('[perf] Learned rate limit threshold:', _rateLimitLearner.safeThreshold, 
                    '(hit at', count, ', history:', _rateLimitLearner.requestsBeforeLimit, ')');
        // Reset counter
        _rateLimitLearner.currentRequestCount = 0;
        _rateLimitLearner.lastResetTime = Date.now();
    }
    window['__cs_learnRateLimit'] = _learnRateLimit;

    function _shouldThrottle() {
        if (_rateLimitLearner.throttled && Date.now() < _rateLimitLearner.cooldownUntil) {
            return true;
        }
        _rateLimitLearner.throttled = false;
        return false;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── FEATURE 3: PREDICTIVE SHIFT TIMING ───────────────────────────────────
    // Learns when shifts historically appear and ramps up scanning
    var _shiftPredictor = {
        history: [],       // array of { hour, minute, dayOfWeek }
        nextPredicted: null,
        ramping: false
    };

    // Load history from storage
    chrome.storage.local.get(['__cs_shift_history'], function(d) {
        if (d['__cs_shift_history']) {
            _shiftPredictor.history = d['__cs_shift_history'];
            _predictNextDrop();
        }
    });

    function _recordShiftFound() {
        var now = new Date();
        _shiftPredictor.history.push({
            hour: now.getHours(),
            minute: now.getMinutes(),
            dayOfWeek: now.getDay(),
            ts: now.getTime()
        });
        // Keep last 100 entries
        if (_shiftPredictor.history.length > 100) _shiftPredictor.history.shift();
        chrome.storage.local.set({ '__cs_shift_history': _shiftPredictor.history });
        _predictNextDrop();
    }
    window['__cs_recordShiftFound'] = _recordShiftFound;

    function _predictNextDrop() {
        if (_shiftPredictor.history.length < 5) return; // Need enough data
        // Find the most common hours shifts appear
        var hourCounts = {};
        _shiftPredictor.history.forEach(function(entry) {
            var h = entry.hour;
            hourCounts[h] = (hourCounts[h] || 0) + 1;
        });
        // Sort hours by frequency
        var topHours = Object.keys(hourCounts).sort(function(a, b) {
            return hourCounts[b] - hourCounts[a];
        }).slice(0, 5).map(Number);
        
        // Check if current hour is within 30 min of a top hour
        var now = new Date();
        var currentMin = now.getHours() * 60 + now.getMinutes();
        for (var i = 0; i < topHours.length; i++) {
            var targetMin = topHours[i] * 60;
            var diff = targetMin - currentMin;
            if (diff > -15 && diff < 30) { // Within window
                _shiftPredictor.ramping = true;
                return;
            }
        }
        _shiftPredictor.ramping = false;
    }
    // Re-predict every 5 minutes
    setInterval(_predictNextDrop, 5 * 60 * 1000);
    // ─────────────────────────────────────────────────────────────────────────

    // ── FEATURE 4: SHIFT QUALITY SCORING ─────────────────────────────────────
    // Scores shifts so we apply to the best ones first
    var _shiftScorer = {
        preferredDistance: 25,    // km — closer is better
        preferredHours: null,     // set from user's jobType preference
        minScore: 0               // apply to anything by default (0 = no filter)
    };

    function _scoreShift(job) {
        var score = 100;
        // Distance penalty: -2 points per km beyond preferred
        var dist = parseFloat(job['distance'] || 0);
        if (dist > _shiftScorer.preferredDistance) {
            score -= Math.min(40, (dist - _shiftScorer.preferredDistance) * 2);
        }
        // Bonus: very close shifts get a boost
        if (dist < 10) score += 10;
        if (dist < 5) score += 10;
        return Math.max(0, Math.min(100, score));
    }

    function _sortByScore(jobs) {
        return jobs.slice().sort(function(a, b) {
            return _scoreShift(b) - _scoreShift(a);
        });
    }
    window['__cs_scoreShift'] = _scoreShift;
    // ─────────────────────────────────────────────────────────────────────────

    // ── FEATURE 5: ANTI-RATE-LIMIT STRATEGIES ────────────────────────────────
    // Exponential backoff with jitter on rate limits
    var _backoff = {
        level: 0,          // 0 = no backoff, each 429 increases
        maxLevel: 5,
        baseMs: 2000,
        lastRateLimit: 0
    };

    function _getBackoffDelay() {
        if (_backoff.level === 0) return 0;
        // Exponential: 2s, 4s, 8s, 16s, 32s + random jitter ±1s
        var delay = _backoff.baseMs * Math.pow(2, _backoff.level - 1);
        var jitter = (Math.random() - 0.5) * 2000; // ±1000ms
        return Math.min(delay + jitter, 35000); // Cap at 35s
    }

    function _onRateLimit() {
        _backoff.level = Math.min(_backoff.level + 1, _backoff.maxLevel);
        _backoff.lastRateLimit = Date.now();
        _learnRateLimit(); // Feed data to the learning system
    }

    function _onSuccessfulRequest() {
        // Gradually reduce backoff after successful requests
        if (_backoff.level > 0 && Date.now() - _backoff.lastRateLimit > 30000) {
            _backoff.level = Math.max(0, _backoff.level - 1);
        }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── FEATURE 6: SESSION PERSISTENCE (cookie/token caching) ────────────────
    // Save auth tokens to survive page reloads faster
    function _cacheSession() {
        var tok = _ssAuthTok || null;
        if (tok) {
            try { localStorage.setItem('__ss_auth', tok); } catch(_) {}
        }
    }
    // Cache session token every 5 minutes
    setInterval(_cacheSession, 5 * 60 * 1000);
    // ─────────────────────────────────────────────────────────────────────────

    // ── MASTER INTERVAL CALCULATOR ───────────────────────────────────────────
    // Combines all performance features to determine the optimal scan interval
    function _calculateOptimalInterval(baseInterval) {
        // If pre-emptive throttle is active, slow down but NEVER stop scanning
        if (_shouldThrottle()) return 3000; // 3s — slowed but still scanning
        // If backoff is active from recent rate limit
        var backoffDelay = _getBackoffDelay();
        if (backoffDelay > 0) return Math.min(backoffDelay, 5000); // Cap at 5s max
        // Get adaptive interval (peak hours / burst mode)
        var adaptive = _getAdaptiveInterval(baseInterval);
        // If shift predictor says we're in a hot window, use slightly faster interval
        if (_shiftPredictor.ramping && adaptive > 1500) adaptive = 1500;
        // SAFETY: Never go below 1000ms to avoid rate limits
        return Math.max(adaptive, 1000);
    }
    window['__cs_getOptimalInterval'] = _calculateOptimalInterval;
    // ═══════════════════════════════════════════════════════════════════════════

    // ── ONLINE LICENSE CHECK — Extension won't work without verified license ──
    var _csLicenseOk = false;
    var _csLicensedEmail = null;

    async function _checkLicenseOnline() {
        return new Promise(function(resolve) {
            chrome.storage.local.get(['__cs_license_key', '__cs_license_email', '__cs_license_valid', '__cs_license_device'], function(data) {
                if (!data['__cs_license_key'] || !data['__cs_license_email']) {
                    resolve(false); return;
                }
                // Use the cached validity from last popup verification
                // The popup (license.js) does the online check and stores __cs_license_valid
                if (data['__cs_license_valid'] === true) {
                    _csLicensedEmail = data['__cs_license_email'].toLowerCase().trim();
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        });
    }

    // ── Email enforcement: block if user tries to use a different Amazon account ──
    function _enforceEmailBinding() {
        setInterval(function() {
            if (!_csLicensedEmail) return;
            chrome.storage.local.get(['__un'], function(data) {
                var currentEmail = (data['__un'] || '').toLowerCase().trim();
                if (currentEmail && currentEmail !== _csLicensedEmail) {
                    console.log('[CoderSnap] Email mismatch! Licensed:', _csLicensedEmail, '| Current:', currentEmail);
                    chrome.storage.local.set({ '__ap': false });
                    if (typeof Swal !== 'undefined') {
                        Swal.fire({
                            title: '🚫 License Violation',
                            html: '<div style="text-align:left;font-family:Inter,sans-serif;font-size:13px;color:rgba(199,210,254,0.85);">'
                                + '<p>This license is bound to:<br><b style="color:#22d3ee;">' + _csLicensedEmail + '</b></p>'
                                + '<p style="margin-top:10px;">You are logged into:<br><b style="color:#f87171;">' + currentEmail + '</b></p>'
                                + '<p style="margin-top:14px;color:rgba(199,210,254,0.5);font-size:11px;">Each license works with one Amazon account only. Contact admin for a new license.</p></div>',
                            icon: 'error',
                            confirmButtonText: 'OK',
                            allowEscapeKey: false,
                            allowOutsideClick: false
                        });
                    }
                }
            });
        }, 10000);
    }

    _csLicenseOk = await _checkLicenseOnline();
    if (!_csLicenseOk) {
        console.log('[CoderSnap] No valid license — scanning disabled. Activate in the popup.');
        return; // Exit entire content script
    }
    _enforceEmailBinding();

    // ── SERVER HEARTBEAT — Re-verify license online every 30 minutes ──────────
    // If license is revoked/expired while scanning, this catches it.
    // Someone who bypasses the popup check can't bypass server-side verification.
    (function _heartbeat() {
        var HEARTBEAT_INTERVAL = 30 * 60 * 1000; // 30 minutes
        var LICENSE_URL = 'https://script.google.com/macros/s/AKfycbziX_IPp8afiwz7-4Cj3QisI1dz6W0IZQAqP7vpsBrBbq0yLB-vl42HNnL4hyFYxeJEMQ/exec';

        async function _verifyOnline() {
            try {
                var data = await new Promise(function(r) {
                    chrome.storage.local.get(['__cs_license_key', '__cs_license_email', '__cs_license_device'], function(d) { r(d); });
                });
                if (!data['__cs_license_key'] || !data['__cs_license_email']) {
                    // No license stored — kill scanning
                    chrome.storage.local.set({ '__cs_license_valid': false, '__ap': false });
                    return;
                }

                var key = data['__cs_license_key'];
                var email = data['__cs_license_email'];
                var device = data['__cs_license_device'] || '';

                var url = LICENSE_URL + '?action=verify'
                    + '&key=' + encodeURIComponent(key)
                    + '&email=' + encodeURIComponent(email)
                    + '&device=' + encodeURIComponent(device);

                // Route through background.js (credentials:omit for Google redirect)
                var result = await new Promise(function(resolve) {
                    chrome.runtime.sendMessage({ action: 'licenseRequest', url: url }, function(response) {
                        if (chrome.runtime.lastError) {
                            resolve(null); // Network error — don't kill on transient failure
                        } else {
                            resolve(response);
                        }
                    });
                });

                if (!result) return; // Network error — skip this check, try again next interval

                if (result.success && result.valid) {
                    // License still good
                    console.log('[heartbeat] License valid. Days remaining:', result.daysRemaining || '?');
                    chrome.storage.local.set({ '__cs_license_valid': true });
                } else {
                    // License invalid/expired/revoked — KILL scanning
                    console.warn('[heartbeat] License INVALID:', result.error || 'unknown');
                    chrome.storage.local.set({ '__cs_license_valid': false, '__ap': false });
                    // Reload to show the locked state
                    if (typeof Swal !== 'undefined') {
                        Swal.fire({
                            title: '&#128274; License Revoked',
                            html: '<p style="color:rgba(199,210,254,0.8);font-size:13px;">'
                                + (result.error || 'Your license is no longer valid.') + '</p>'
                                + '<p style="color:rgba(199,210,254,0.4);font-size:11px;margin-top:10px;">'
                                + 'Contact your CoderSnap administrator.</p>',
                            icon: 'error',
                            confirmButtonText: 'OK',
                            allowEscapeKey: false,
                            allowOutsideClick: false
                        });
                    }
                }
            } catch(e) {
                console.log('[heartbeat] Check failed (network?):', e.message);
                // Don't kill on error — could be temporary network issue
            }
        }

        // First heartbeat after 5 minutes (gives time for scanning to start)
        setTimeout(function() {
            _verifyOnline();
            // Then every 30 minutes
            setInterval(_verifyOnline, HEARTBEAT_INTERVAL);
        }, 5 * 60 * 1000);
    })();
    // ─────────────────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────

    // Load Nunito font for consistent Swal dialog typography (matches popup theme)
    if (!document.querySelector('link[href*="Nunito"]')) {
        var _fl = document.createElement('link');
        _fl.rel = 'stylesheet';
        _fl.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&display=swap';
        document.head.appendChild(_fl);
    }
    // Swal override styles now in css/swal_theme.css (injected via manifest content_scripts)
    // ── Scan Ring Pill — spinning arc + text label ──────────────────────────
    (function() {
        if (document.getElementById('ss-scan-style')) return;
        var st = document.createElement('style');
        st.id = 'ss-scan-style';
        st.textContent =
            '#ss-ring{position:fixed;bottom:16px;left:16px;display:none;align-items:center;gap:10px;' +
            'padding:10px 18px 10px 12px;border-radius:28px;' +
            'background:rgba(8,8,25,0.93);border:1px solid rgba(22,245,255,0.3);' +
            'box-shadow:0 4px 16px rgba(0,0,0,0.45),0 0 10px rgba(22,245,255,0.08);' +
            'z-index:2147483647;pointer-events:none;font-family:Inter,system-ui,sans-serif;}' +
            '#ss-ring.ss-warn{border-color:rgba(245,158,11,0.5);box-shadow:0 4px 16px rgba(0,0,0,0.45),0 0 10px rgba(245,158,11,0.12);}' +
            '#ss-ring.ss-err{border-color:rgba(239,68,68,0.5);box-shadow:0 4px 16px rgba(0,0,0,0.45),0 0 10px rgba(239,68,68,0.12);}' +
            '#ss-ring .ss-w{position:relative;width:30px;height:30px;flex-shrink:0;}' +
            '#ss-ring svg{position:absolute;top:0;left:0;width:100%;height:100%;transform:rotate(-90deg);}' +
            '#ss-ring .ss-trk{fill:none;stroke:rgba(22,245,255,0.15);stroke-width:3;}' +
            '#ss-ring .ss-arc{fill:none;stroke:url(#ssG);stroke-width:3;stroke-linecap:round;' +
            'stroke-dasharray:60;stroke-dashoffset:60;}' +
            '#ss-ring.ss-warn .ss-arc{stroke:url(#ssGW);}' +
            '#ss-ring.ss-err .ss-arc{stroke:url(#ssGE);}' +
            '#ss-ring .ss-ico{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:12px;}' +
            '#ss-ring .ss-lbl{font-size:13.5px;font-weight:600;color:rgba(199,210,254,0.9);white-space:nowrap;letter-spacing:0.2px;}' +
            '#ss-ring.ss-warn .ss-lbl{color:rgba(253,186,116,0.9);}' +
            '#ss-ring.ss-err .ss-lbl{color:rgba(252,165,165,0.9);}' +
            '';
        document.head.appendChild(st);
        var el = document.createElement('div');
        el.id = 'ss-ring';
        el.innerHTML =
            '<div class="ss-w">' +
            '<svg viewBox="0 0 22 22"><defs>' +
            '<linearGradient id="ssG" x1="0%" y1="0%" x2="100%" y2="0%">' +
            '<stop offset="0%" stop-color="#16f5ff"/><stop offset="100%" stop-color="#a341ff"/></linearGradient>' +
            '<linearGradient id="ssGW" x1="0%" y1="0%" x2="100%" y2="0%">' +
            '<stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#fbbf24"/></linearGradient>' +
            '<linearGradient id="ssGE" x1="0%" y1="0%" x2="100%" y2="0%">' +
            '<stop offset="0%" stop-color="#ef4444"/><stop offset="100%" stop-color="#f87171"/></linearGradient>' +
            '</defs>' +
            '<circle class="ss-trk" cx="11" cy="11" r="9"/>' +
            '<circle class="ss-arc" cx="11" cy="11" r="9"/>' +
            '</svg><span class="ss-ico">⚡</span></div>' +
            '<span class="ss-lbl" id="ss-lbl">Job Checking...</span>';
        document.body.appendChild(el);
    })();

    var _ss_countdown = null;
    // ── Popup-aware navigation guard ────────────────────────────────────────────
    // When any Swal popup is visible, doRedirect() defers navigation and stores
    // the reason here. A 500ms poll fires the redirect as soon as the popup closes.
    var _pendingRedirect = null;
    var _pendingRedirectPoll = null;
    function _popupIsOpen() {
        return typeof Swal !== 'undefined' && Swal['isVisible'] && Swal['isVisible']();
    }
    // ─────────────────────────────────────────────────────────────────────────────

    // ── requestAnimationFrame arc engine ─────────────────────────────────────
    // Drives stroke-dashoffset from 60→0 over exactly durationMs using
    // performance.now() — same clock as the setTimeout(D, c) scheduled
    // right before fetch(). Animation and request are mathematically synced.
    var _raf_id    = null;   // current rAF handle
    var _raf_start = 0;      // performance.now() when arc sweep began
    var _raf_dur   = 2000;   // sweep duration in ms (matches c)
    var _raf_arc   = null;   // cached .ss-arc element

    function _arcSweep(ts) {
        if (!_raf_arc) return;
        var progress = Math.min((ts - _raf_start) / _raf_dur, 1);
        _raf_arc.style.strokeDashoffset = (60 * (1 - progress)).toFixed(3);
        if (progress < 1 && _raf_id !== null) {
            _raf_id = requestAnimationFrame(_arcSweep);
        }
    }

    function _startArcRaf(ms) {
        // Stop any running sweep first
        if (_raf_id !== null) { cancelAnimationFrame(_raf_id); _raf_id = null; }
        _raf_arc = _raf_arc || document.querySelector('#ss-ring .ss-arc');
        if (!_raf_arc) return;
        _raf_dur   = ms;
        _raf_start = performance.now();
        _raf_arc.style.strokeDashoffset = '60'; // reset to empty instantly
        _raf_id = requestAnimationFrame(_arcSweep);
    }

    function _stopArcRaf() {
        if (_raf_id !== null) { cancelAnimationFrame(_raf_id); _raf_id = null; }
        if (_raf_arc) _raf_arc.style.strokeDashoffset = '60';
    }
    // ─────────────────────────────────────────────────────────────────────────
    function _showRing(ms) {
        if (!p) return;
        var el = document.getElementById('ss-ring');
        if (!el) return;
        el.className = '';
        el.style.display = 'flex';
        var lbl = document.getElementById('ss-lbl');
        if (lbl) lbl.textContent = 'Job Checking...';
        _startArcRaf(ms); // RAF-driven sweep: smooth 60fps, perfectly synced
    }
    function _hideRing() {
        _stopArcRaf();
        var el = document.getElementById('ss-ring');
        if (_ss_countdown) { clearInterval(_ss_countdown); _ss_countdown = null; }
        if (el) el.style.display = 'none';
    }
    // _ringState(state, label, durationMs)
    // durationMs: if provided, updates the arc animation speed to match
    function _ringState(state, label, durationMs) {
        if (!p) { _hideRing(); return; } // Hide immediately if deactivated
        var el = document.getElementById('ss-ring');
        var lbl = document.getElementById('ss-lbl');
        if (!el || el.style.display === 'none') return;
        if (_ss_countdown) { clearInterval(_ss_countdown); _ss_countdown = null; }
        el.className = state ? 'ss-' + state : '';
        if (lbl) lbl.textContent = label || (state === 'warn' ? 'Rate limited...' : state === 'err' ? 'Server error' : 'Job Checking...');
        // Restart RAF with new duration so rate-limit/error animations are also smooth
        if (durationMs) {
            _startArcRaf(durationMs);
        }
        // Start countdown for rate-limited state
        if (state === 'warn' && label) {
            var m = label.match(/(\d+)s/);
            if (m) {
                var s = parseInt(m[1]);
                _ss_countdown = setInterval(function() {
                    s--;
                    if (s <= 0) { clearInterval(_ss_countdown); _ss_countdown = null; return; }
                    if (lbl) lbl.textContent = 'Rate limited — retry in ' + s + 's';
                }, 1000);
            }
        }
    }
    // ─────────────────────────────────────────────────────────────────────────


    let b = null, c = 0x7d0;
    const d = [
        'already-applied-but-can-be-reset',
        'consent'
    ];
    function e() {
        const O = window['location']['href'];
        return d['some'](P => O['includes'](P));
    }
    if (e())
        return;
    async function f() {
        const O = 0x2710, P = 0xfa;
        let Q = 0x0;
        while (Q < O) {
            const S = document['querySelector']('input[data-test-id=\x22input-test-id-emailId\x22]');
            if (S && S['value'])
                return S;
            await new Promise(T => setTimeout(T, P)), Q += P;
        }
        await Swal['fire']({
            'title': 'Session Expired',
            'html': 'Your session has ended. Please sign in again to resume hunting.',
            'allowEscapeKey': ![],
            'allowEnterKey': ![],
            'allowOutsideClick': ![],
            'icon': 'warning',
            'confirmButtonText': 'Ok'
        });
        const R = y(i);
        return location['href'] = location['href']['replace']('https://auth.hiring.amazon.ca/#/'), null;
    }
    let g = null, h = null, i = null, j = null, k = null, l = 43.653524, m = -79.383907, n = 0x5, o = null, p = ![], q = ![], r = 0x0, s = '', t = 0x64, u = 0x5, v = '', w = ![], x = ![];

    // ── Amazon auth token (captured by notif_block.js MAIN world interceptor) ──
    // Stored in localStorage.__ss_auth, read here to include in GraphQL requests.
    // Without this the new hiring.amazon.ca/graphql endpoint returns 401.
    var _ssAuthTok = null; // in-memory cache per page load
    function _getAuthHeader() {
        if (_ssAuthTok) return _ssAuthTok;
        try {
            // Primary: use token captured from Amazon's own SPA requests
            var stored = localStorage.getItem('__ss_auth');
            if (stored && stored.length > 80) {
                _ssAuthTok = stored;
                return _ssAuthTok;
            }
            // Fallback A: Cognito idToken pattern in localStorage
            // Standard key: CognitoIdentityServiceProvider.{clientId}.{user}.idToken
            for (var _ci = 0; _ci < localStorage.length; _ci++) {
                var _ck = localStorage.key(_ci);
                if (_ck && _ck.includes('CognitoIdentityServiceProvider') && _ck.includes('.idToken')) {
                    var _cv = localStorage.getItem(_ck) || '';
                    if (_cv.length > 100 && _cv.startsWith('eyJ')) {
                        _ssAuthTok = 'Bearer Status|logged-in|Session|' + _cv;
                        return _ssAuthTok;
                    }
                }
            }
            // Fallback B: scan for any long JWT (3 base64 parts separated by dots)
            for (var _ji = 0; _ji < localStorage.length; _ji++) {
                var _jk = localStorage.key(_ji);
                var _jv = localStorage.getItem(_jk) || '';
                if (_jv.length > 100 && _jv.startsWith('eyJ') && _jv.split('.').length === 3) {
                    _ssAuthTok = 'Bearer Status|logged-in|Session|' + _jv;
                    return _ssAuthTok;
                }
            }
        } catch(_e) { console.warn('[fetch.js] _getAuthHeader error:', _e.message); }
        return null;
    }
    // ─────────────────────────────────────────────────────────────────────────
    $version = '1.0.0';
    function y(O) {
        return O === 'United\x20States' ? {
            'domain': 'hiring.amazon.com',
            'locale': 'en-US',
            'country': 'United\x20States',
            'countryCode': 'US'
        } : {
            'domain': 'hiring.amazon.ca',
            'locale': 'en-CA',
            'country': 'Canada',
            'countryCode': 'CA'
        };
    }
    async function z() {
        const O = await chrome['storage']['local']['get']([
                'fetchIntervalValue',
                'fetchIntervalUnit'
            ]);
        // parseFloat supports decimal seconds like 0.5, 1.3, 2.5 etc
        const P = parseFloat(O['fetchIntervalValue']) || 2.0;
        const Q = O['fetchIntervalUnit'] || 's';
        // Always use seconds — ms option removed from popup
        return Q === 's' ? Math.round(P * 1000) : Math.round(P);
    }
    async function A() {
        c = await z(), [g, h, j, k, l, m, n, o, p, $version, $credits, $isProUser, i] = await Promise['all']([
            chrome['storage']['local']['get']('__un')['then'](O => O['__un'] || null),
            chrome['storage']['local']['get']('__pw')['then'](O => O['__pw'] || null),
            chrome['storage']['local']['get']('candidateID')['then'](O => O['candidateID'] || null),
            chrome['storage']['local']['get']('selectedCity')['then'](O => O['selectedCity'] || 'Toronto'),
            chrome['storage']['local']['get']('lat')['then'](O => O['lat'] || 43.653524),
            chrome['storage']['local']['get']('lng')['then'](O => O['lng'] || -79.383907),
            chrome['storage']['local']['get']('distance')['then'](O => O['distance'] || 50),
            chrome['storage']['local']['get']('jobType')['then'](O => O['jobType'] || 'Any'),
            chrome['storage']['local']['get']('__ap')['then'](O => typeof O['__ap'] !== 'undefined' ? O['__ap'] : ![]),
            chrome['storage']['local']['get']('$version')['then'](O => O['$version'] || '1.0.0'),
            chrome['storage']['local']['get']('__cr')['then'](O => O['__cr']),
            chrome['storage']['local']['get']('__isProUser')['then'](O => O['__isProUser'] || ![]),
            chrome['storage']['local']['get']('__country')['then'](O => O['__country'] || null)
        ]);
    }
    chrome['storage']['onChanged']['addListener'](async function (O, P) {
        P === 'local' && (O['selectedCity'] && (k = O['selectedCity']['newValue']), O['distance'] && (n = O['distance']['newValue']), O['lat'] && (l = O['lat']['newValue']), O['lng'] && (m = O['lng']['newValue']), O['jobType'] && (o = O['jobType']['newValue']), (O['fetchIntervalValue'] || O['fetchIntervalUnit']) && (c = await z(),
            // When frequency changes: cancel pending timer, call _startScan().
            // D() shows the ring and fires the request in the SAME synchronous block
            // so there is exactly ONE animation reset at the exact moment the request fires.
            // (Calling _showRing here caused a double-reset stutter 5ms before D() reset it)
            b && p && (clearTimeout(b), b = null),
            p && _startScan()));
    }), await A();
    async function B(O) {
        // UNLIMITED: credit sync disabled
        return;
    }

    // ══════════════════════════════════════════════════════════════
    // ACCESS CONTROL — Server-side trial/premium gate
    // Token in MEMORY ONLY — cannot be bypassed via chrome.storage edits
    // ══════════════════════════════════════════════════════════════
    var _ss = { tok: null, ok: false, pro: false, trialRem: 0, exp: 0, busy: false };

    function _fp() {
        try { return btoa([navigator.hardwareConcurrency||0, screen.colorDepth||0,
            screen.width+'x'+screen.height].join('|')).substr(0,20);
        } catch(e) { return 'x'; }
    }
    // Real Chrome Extension ID — cannot be faked by modified/repackaged extensions
    function _extId() {
        try { return chrome['runtime']['id'] || ''; } catch(e) { return ''; }
    }

    async function _refreshTok() {
        // UNLIMITED: skip server validation entirely
        _ss.ok = true;
        _ss.pro = true;
        _ss.trialRem = 999999;
        _ss.exp = Date.now() + 999999999;
        _ss.tok = 'unlimited';
        chrome['storage']['local']['set']({
            '__ss_pro': true,
            '__ss_trial_exp': 9999999999999,
            '__ss_expired': false,
            '__isProUser': true,
            '__ss_blocked': false
        });
    }

    // Fast synchronous check — UNLIMITED: always returns true
    async function _checkAccess() {
        return true;
    }

    function _fmtTime(sec) {
        if (sec <= 0) return '0s';
        const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
        if (h > 0) return h + 'h ' + m + 'm';
        if (m > 0) return m + 'm ' + s + 's';
        return s + 's';
    }


    // ── Modified Extension Detected ──────────────────────────────
    async function _showBlocked() {
        // UNLIMITED: blocked screen disabled
        return;
    }
    // ─────────────────────────────────────────────────────────────



    // ── Pro Activated Banner — shown on free→pro transition ──────
    // Triggered by: Stripe payment OR admin Pro grant
    async function _showProActivatedBanner() {
        if (typeof Swal === 'undefined' || window['_ss_banner_shown']) return;
        window['_ss_banner_shown'] = true;
        // ── STOP scanning while banner is showing ──
        if (b) { clearTimeout(b); b = null; }
        _hideRing();
        await Swal['fire']({
            'title': '&#10024; You are Premium!',
            'html':
                '<div style="text-align:center;font-family:Inter,sans-serif;">'
                + '<div style="display:inline-flex;align-items:center;justify-content:center;'
                + 'width:72px;height:72px;border-radius:50%;'
                + 'background:linear-gradient(135deg,#16f5ff,#a341ff);'
                + 'margin-bottom:16px;'
                + 'animation:ss-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">'
                + '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
                + '<polyline points="20,6 9,17 4,12"/></svg></div>'
                + '<style>@keyframes ss-pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}</style>'
                + '<p style="color:rgba(199,210,254,0.9);font-size:14px;margin-bottom:16px;">'
                + 'Your account is now <b style="color:#22d3ee;">Premium</b>.<br>'
                + 'Unlimited 24/7 scanning is active.</p>'
                + '<div style="background:rgba(22,245,255,0.06);border:1px solid rgba(22,245,255,0.2);'
                + 'border-radius:12px;padding:12px 16px;font-size:12.5px;color:rgba(199,210,254,0.75);text-align:left;">'
                + '&#10003; Unlimited job scanning &mdash; 24/7<br>'
                + '&#10003; AI CAPTCHA auto-solver<br>'
                + '&#10003; Lifetime access &mdash; never expires</div></div>',
            'showConfirmButton': true,
            'confirmButtonText': '&#9654; Start Checking Now!',
            'showCancelButton': false,
            'allowEscapeKey': false,
            'allowOutsideClick': false
        });
        window['_ss_banner_shown'] = false;
        // Resume scanning after user clicks Start Checking
        if (p) { _startScan(); }
    }
    // ─────────────────────────────────────────────────────────────

    // ── Payment Status Polling ────────────────────────────────────
    // Runs after checkout opens — checks every 10s for up to 6 min
    // The moment Stripe webhook fires → DB updated → next poll detects Pro
    // → scanning resumes INSTANTLY without any user action
    function _startPaymentPoll() {
        if (window['_ss_polling']) return; // Don't start duplicate polls
        window['_ss_polling'] = true;
        var _polls = 0;
        var _pollTimer = setInterval(async function() {
            _polls++;
            if (_polls > 36) { // Stop after 6 minutes
                clearInterval(_pollTimer);
                window['_ss_polling'] = false;
                return;
            }
            // Force fresh server check — bypass cache
            _ss.exp = 0; _ss.tok = null;
            var ok = await _checkAccess();
            if (ok) {
                clearInterval(_pollTimer);
                window['_ss_polling'] = false;
                // Payment confirmed! Resume scanning immediately
                if (p) { _startScan(); }
                // Update popup badge
                chrome['storage']['local']['set']({
                    '__ss_pro': true, '__ss_expired': false,
                    '__isProUser': true
                });
                _showProActivatedBanner();
            }
        }, 10000); // Check every 10 seconds
    }
    // ─────────────────────────────────────────────────────────────

    async function _showPaywall() {
        // UNLIMITED: paywall disabled
        return;
    }
    // ══════════════════════════════════════════════════════════════

        // ── Groq API Guide (shown once after PIN) ────────────────────────────────

    // ── Popup & Redirect Permission Guide ───────────────────────
    // Step-by-step guide shown ONCE on jobSearch — before premium banner
    async function _showPermissionGuide() {
        if (typeof Swal === 'undefined') return;
        // Stop all scanning while guide is showing
        window['_ss_guide_showing'] = true;
        if (b) { clearTimeout(b); b = null; }
        _hideRing();
        var result = await Swal['fire']({
            'title': '&#128279; Allow Pop-ups for CoderSnap',
            'html':
                '<div style="text-align:left;font-family:Inter,sans-serif;font-size:13px;'
                + 'color:rgba(199,210,254,0.9);line-height:1.7;">'
                + '<p style="margin-bottom:14px;color:rgba(199,210,254,0.75);">Follow these steps to allow '
                + 'CoderSnap to open job pages automatically:</p>'

                + '<div style="counter-reset:steps;">'

                // Step 1
                + '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;">'
                + '<div style="min-width:26px;height:26px;background:linear-gradient(135deg,#22d3ee,#818cf8);'
                + 'border-radius:50%;display:flex;align-items:center;justify-content:center;'
                + 'font-weight:800;font-size:12px;color:#07071c;flex-shrink:0;">1</div>'
                + '<div>'
                + '<div style="font-weight:700;color:#e2e8f0;margin-bottom:3px;">Click the icon in the address bar</div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.65);">Look for the <b style="color:#22d3ee;">two-line &#9776;</b> or '
                + '<b style="color:#22d3ee;">lock &#128273;</b> icon to the left of the web address</div>'
                + '</div></div>'

                // Step 2
                + '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;">'
                + '<div style="min-width:26px;height:26px;background:linear-gradient(135deg,#22d3ee,#818cf8);'
                + 'border-radius:50%;display:flex;align-items:center;justify-content:center;'
                + 'font-weight:800;font-size:12px;color:#07071c;flex-shrink:0;">2</div>'
                + '<div>'
                + '<div style="font-weight:700;color:#e2e8f0;margin-bottom:3px;">Click <b style="color:#22d3ee;">"Site settings"</b></div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.65);">A new Chrome settings window opens for <b>hiring.amazon.ca</b></div>'
                + '</div></div>'

                // Step 3
                + '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;">'
                + '<div style="min-width:26px;height:26px;background:linear-gradient(135deg,#22d3ee,#818cf8);'
                + 'border-radius:50%;display:flex;align-items:center;justify-content:center;'
                + 'font-weight:800;font-size:12px;color:#07071c;flex-shrink:0;">3</div>'
                + '<div>'
                + '<div style="font-weight:700;color:#e2e8f0;margin-bottom:3px;">Find <b style="color:#c084fc;">"Pop-ups and redirects"</b></div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.65);">Change from '
                + '<b style="color:#f87171;">Block (default)</b> to <b style="color:#4ade80;">Allow</b></div>'
                + '</div></div>'

                // Step 4
                + '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:14px;">'
                + '<div style="min-width:26px;height:26px;background:linear-gradient(135deg,#22d3ee,#818cf8);'
                + 'border-radius:50%;display:flex;align-items:center;justify-content:center;'
                + 'font-weight:800;font-size:12px;color:#07071c;flex-shrink:0;">4</div>'
                + '<div>'
                + '<div style="font-weight:700;color:#e2e8f0;margin-bottom:3px;">Click <b style="color:#fb923c;">"Reload"</b> on the Amazon page</div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.65);">Chrome shows a reload bar at the top — click it to apply</div>'
                + '</div></div>'
                + '</div>'

                + '<div style="background:rgba(251,146,60,0.06);border:1px solid rgba(251,146,60,0.2);'
                + 'border-radius:8px;padding:8px 12px;font-size:12px;color:rgba(199,210,254,0.55);">'
                + '&#128161; Only needed <b>once</b> — applies to hiring.amazon.ca only.</div>'
                + '</div>',
            'showConfirmButton': true,
            'confirmButtonText': '&#10003; Done',
            'showCancelButton': false,
            'allowEscapeKey': false,
            'allowOutsideClick': false,
            'width': 'min(480px, 92vw)'
        });
        // Guide dismissed — clear flag
        window['_ss_guide_showing'] = false;
        // If no pro banner coming, restart scanning
        // (if pro banner IS coming, it controls the restart via Start Checking Now)
    }
    // ─────────────────────────────────────────────────────────────

    async function showGroqAfterPinGuide() {
        if (typeof Swal === 'undefined') return;
        await Swal['fire']({
            'title': '🤖 Set Up AI CAPTCHA Solver',
            'html':
                '<div style="text-align:left;font-family:Inter,sans-serif;">'
                + '<p style="margin-bottom:12px;color:rgba(199,210,254,0.8);font-size:13px;">'
                + 'CoderSnap uses <b style="color:#c7d2fe;">Groq AI</b> to auto-solve CAPTCHAs so login never stops. '
                + 'Get your <b style="color:#22d3ee;">free key</b> in 2 minutes:</p>'
                + '<div style="display:flex;flex-direction:column;gap:7px;">'

                + '<div style="background:rgba(22,245,255,0.06);border:1px solid rgba(22,245,255,0.2);border-radius:10px;padding:10px 13px;">'
                + '<div style="font-size:10px;font-weight:800;color:#22d3ee;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">&#9312; Create Free Account</div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.8);line-height:1.5;">'
                + 'Visit <a href="https://console.groq.com/keys" target="_blank" style="color:#818cf8;font-weight:700;">console.groq.com/keys</a>'
                + ' &rarr; Sign up (free, no credit card)</div></div>'

                + '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:10px 13px;">'
                + '<div style="font-size:10px;font-weight:800;color:#818cf8;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">&#9313; Create API Key</div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.8);line-height:1.5;">'
                + 'Click <b style="color:#c7d2fe;">+ Create API Key</b> &rarr; Enter any name (e.g. <i style="color:#a5f3fc;">CoderSnap</i>)'
                + ' &rarr; Keep expiry as <b style="color:#c7d2fe;">No expiration</b> &rarr; Click <b style="color:#c7d2fe;">Submit</b></div></div>'

                + '<div style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:10px 13px;">'
                + '<div style="font-size:10px;font-weight:800;color:#f87171;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">&#9314; Copy Key &mdash; ONCE ONLY!</div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.8);line-height:1.5;">'
                + 'The key starts with <code style="background:rgba(22,245,255,0.1);color:#22d3ee;padding:1px 6px;border-radius:4px;">gsk_</code>. '
                + '<b style="color:#f87171;">Groq shows it ONLY ONCE</b> — copy it immediately!'
                + ' Save it in a safe place (Notes, password manager) in case you need it again.</div></div>'

                + '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:10px 13px;">'
                + '<div style="font-size:10px;font-weight:800;color:#f59e0b;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">&#9315; Paste in Extension</div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.8);line-height:1.5;">'
                + 'Open the <b style="color:#c7d2fe;">CoderSnap</b> popup &rarr; <b style="color:#c7d2fe;">&#9670; AI Captcha Solver</b>'
                + ' &rarr; Paste in <b style="color:#c7d2fe;">GROQ API KEY</b> field &rarr; Saves automatically when valid</div></div>'

                + '</div>'
                + '<div style="margin-top:10px;padding:8px 12px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:8px;">'
                + '<div style="font-size:11px;color:rgba(253,186,116,0.9);line-height:1.5;">'
                + '<b style="color:#fbbf24;">&#9888; Keep your key safe!</b> If you ever click <b>Reset</b> in the extension, '
                + 'your key will be wiped. You can always create a new one following the same steps above. '
                + 'We never store your key on any server — it stays only in your browser.</div></div>'
                + '<p style="margin-top:10px;font-size:11px;color:rgba(199,210,254,0.28);text-align:center;">'
                + 'Shown once. Skip = solve CAPTCHAs manually every time.</p></div>',
            'confirmButtonText': '&#10003; Got it &mdash; Authenticate Now!',
            'showCancelButton': true,
            'cancelButtonText': 'Skip for now',
            'allowEscapeKey': false,
            'allowOutsideClick': false,
            'icon': 'info'
        });
    }
    // ─────────────────────────────────────────────────────────────────────────

    async function C() {
        const O = window['location']['href'], P = O['includes']('#/contactInformation'), Q = O['includes']('#/login'), R = O['includes']('jobSearch');
        let S = await chrome['storage']['local']['get']('__uc')['then'](({__uc: V}) => V), T = a['includes']('login'), U = a['includes']('jobSearch');
        if (Q) {
            const V = document['querySelector']('button[data-test-component=\x22StencilReactButton\x22][data-test-id=\x22consentBtn\x22]\x20div[data-test-component=\x22StencilReactRow\x22].hvh-careers-emotion-n1m10m');
            if (V)
                V['click']();
            else {
            }
            if (!i) {
                const Z = document['querySelector']('div[data-test-component=\x22StencilReactRow\x22].css-hxw9t3\x20button[data-test-component=\x22StencilReactButton\x22][type=\x22button\x22].e4s17lp0.css-1ipr55l\x20div[data-test-component=\x22StencilReactRow\x22].css-n1m10m');
                if (Z)
                    Z['click']();
                else {
                }
                i = await Swal['fire']({
                    'title': 'CoderSnap Setup',
                    'html': '<b>Choose your target region</b><br><small style="color:#aaa;">Select the country where you want to hunt for warehouse shifts.</small>',
                    'input': 'select',
                    'inputOptions': {
                        'Canada': 'Canada',
                        'United\x20States': 'United\x20States'
                    },
                    'inputPlaceholder': 'Select your region',
                    'allowEscapeKey': ![],
                    'allowEnterKey': ![],
                    'allowOutsideClick': ![],
                    'icon': 'warning',
                    'confirmButtonText': 'Confirm Region →',
                    'inputValidator': a0 => {
                        return new Promise(a1 => {
                            a0 ? a1() : a1('You\x20need\x20to\x20select\x20a\x20country');
                        });
                    }
                })['then'](a0 => {
                    const a1 = a0['value'];
                    return chrome['storage']['local']['set']({ '__country': a1 }), a1;
                });
            }
            !g && (g = await Swal['fire']({
                'title': 'Account Authentication',
                'html': '<b>Enter your Amazon hiring account email</b>',
                'input': 'email',
                'inputLabel': 'Amazon account email',
                'inputPlaceholder': 'your@email.com',
                'allowEscapeKey': ![],
                'allowEnterKey': ![],
                'allowOutsideClick': ![],
                'icon': 'warning',
                'confirmButtonText': 'Continue →'
            })['then'](a0 => {
                return chrome['storage']['local']['set']({ '__un': a0['value'] }), a0['value'];
            }));
            // ── LICENSE EMAIL ENFORCEMENT: Block if email doesn't match license ──
            if (g && _csLicensedEmail && g.toLowerCase().trim() !== _csLicensedEmail) {
                await Swal['fire']({
                    'title': '🚫 Wrong Account',
                    'html': '<div style="text-align:left;font-family:Inter,sans-serif;font-size:13px;color:rgba(199,210,254,0.85);">'
                        + '<p>Your license is bound to:</p>'
                        + '<p style="margin:8px 0;"><b style="color:#22d3ee;font-size:14px;">' + _csLicensedEmail + '</b></p>'
                        + '<p>You entered:</p>'
                        + '<p style="margin:8px 0;"><b style="color:#f87171;font-size:14px;">' + g + '</b></p>'
                        + '<p style="margin-top:14px;color:rgba(199,210,254,0.5);font-size:11px;">You can only use this extension with the Amazon account linked to your license. Contact admin for help.</p></div>',
                    'icon': 'error',
                    'confirmButtonText': 'OK',
                    'allowEscapeKey': false,
                    'allowOutsideClick': false
                });
                g = null;
                chrome['storage']['local']['remove']('__un');
                return;
            }
            // ─────────────────────────────────────────────────────────────────────
            if (!h) {
                h = await Swal['fire']({
                    'title': 'Security Verification',
                    'html': '<b>Enter your 6-digit Amazon account PIN</b>',
                    'input': 'password',
                    'inputLabel': 'Account PIN',
                    'inputPlaceholder': '••••••',
                    'inputAttributes': { 'maxlength': 0x6, 'pattern': '\x5cd*' },
                    'allowEscapeKey': false, 'allowEnterKey': false, 'allowOutsideClick': false,
                    'icon': 'warning',
                    'confirmButtonText': 'Next →'
                })['then'](function(a0) {
                    chrome['storage']['local']['set']({ '__pw': a0['value'] });
                    return a0['value'];
                });
                // Show Groq API guide ONCE — right after PIN, before authenticating
                var _gd = await chrome['storage']['local']['get']('__groqGuideSeen');
                if (!_gd['__groqGuideSeen']) {
                    chrome['storage']['local']['set']({ '__groqGuideSeen': true });
                    await showGroqAfterPinGuide();
                }

            }
            const W = document['querySelector']('#country-toggle-button');
            if (W) {
                W['click'](), await new Promise(a2 => setTimeout(a2, 0x1f4));
                const a0 = await new Promise(a2 => {
                        chrome['storage']['local']['get']('__country', a3 => {
                            a2(a3['__country'] || 'United\x20States');
                        });
                    }), a1 = document['querySelector']('ul[role=\x22listbox\x22]');
                if (a1) {
                    const a2 = a1['querySelectorAll']('li');
                    a2['forEach'](a3 => {
                        a3['textContent']['trim']() === a0 && a3['click']();
                    });
                } else {
                }
            } else {
            }
            const X = document['querySelector']('input[data-test-id=\x22input-test-id-login\x22]');
            if (X) {
                X['value'] = g, X['dispatchEvent'](new Event('input', { 'bubbles': !![] }));
                const a3 = document['querySelectorAll']('div[data-test-component=\x22StencilReactRow\x22]');
                a3['forEach'](a4 => {
                    a4['textContent']['trim']() === 'Continue' && a4['click']();
                });
            }
            await new Promise(a4 => setTimeout(a4, 0x3e8));
            const Y = document['querySelector']('input[data-test-id=\x22input-test-id-pin\x22]');
            if (Y) {
                // Use React native setter so React registers the value change
                const _setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                _setter.call(Y, h);
                Y['dispatchEvent'](new Event('input',  { 'bubbles': !![] }));
                Y['dispatchEvent'](new Event('change', { 'bubbles': !![] }));
                await new Promise(r => setTimeout(r, 800)); // wait for React to update
                const a4 = document['querySelector']('button[data-test-id=\x22button-continue\x22]');
                if (a4) a4['click']();
            }
        }
        if (R && !S) {
            const a5 = document['querySelector']('button[data-test-component=\x22StencilReactButton\x22][data-test-id=\x22consentBtn\x22]\x20div[data-test-component=\x22StencilReactRow\x22].hvh-careers-emotion-n1m10m');
            if (a5) {
                a5['click']();
                const a6 = chrome['runtime']['getURL']('images/popup.png');
                await Swal['fire']({
                    'title': 'Turn\x20on\x20your\x20pop-ups',
                    'html': '<p>Please\x20make\x20sure\x20you\x20have\x20enabled\x20pop-ups\x20in\x20your\x20browser\x20settings\x20for\x20this\x20extension\x20to\x20work\x20properly.</p>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20<img\x20src=\x22' + a6 + '\x22\x20alt=\x22Enable\x20Pop-ups\x22\x20style=\x22max-width:100%;\x20height:auto;\x20margin-top:10px;\x22>',
                    'icon': 'warning',
                    'confirmButtonText': 'Got it, pop-ups enabled ✓',
                    'allowEscapeKey': ![],
                    'allowEnterKey': ![],
                    'allowOutsideClick': ![]
                })['then'](() => {
                    return chrome['storage']['local']['set']({ '__uc': !![] });
                });
            } else {
            }
        }
        if (R) {
            E();
            if (p) {
                L();
                return;
            }
        }
        if (P) {
        }
    }

    // ── Scan starter — uses setTimeout chain for perfect animation sync ────
    // D() schedules its own next call via setTimeout right when _showRing starts.
    // This guarantees: animation duration = time to next request = perfect sync.
    function _startScan() {
        if (window['_ss_banner_shown']) return;
        if (b) { clearTimeout(b); b = null; }
        if (!p) return;
        // ── Detect "Problem loading page" error → hard refresh immediately ──
        var _bodyText = (document.body && document.body.innerText) || '';
        if (/problem loading page|server didn't respond|try refreshing/i.test(_bodyText)) {
            console.log('[fetch.js] Page error detected — hard refreshing in 3s');
            setTimeout(function() { window.location.reload(true); }, 3000);
            return;
        }
        D(); // D() schedules its own next call at the right time
    }
    // ─────────────────────────────────────────────────────────────

    async function D() {
        // Don't scan while any popup is showing
        if (window['_ss_banner_shown'] || window['_ss_guide_showing']) return;
        // ── ACCESS GATE: UNLIMITED — always scan ──
        const _canScan = true;
        if (!_canScan) {
            if (b) { clearTimeout(b); b = null; }
            _hideRing();
            // Check if blocked (modified extension) vs trial expired
            const _blk = await new Promise(r => chrome['storage']['local']['get']('__ss_blocked', d => r(d['__ss_blocked'])));
            if (_blk) {
                await _showBlocked();
            } else {
                await _showPaywall();
            }
            return;
        }
        // ─────────────────────────────────────────────────────────
        try {
            if (!F())
                return;
            if (typeof p === 'undefined' || !p)
                return;
            // ── FIX 4: Click "All" tab — Amazon added Recommended tab by default ──
            if (!window['_ssAllTabDone']) {
                var _allBtn = null;
                var _btns = document.querySelectorAll('button');
                for (var _bi = 0; _bi < _btns.length; _bi++) {
                    if (_btns[_bi].textContent.trim() === 'All' && _btns[_bi].getBoundingClientRect().width > 0) {
                        _allBtn = _btns[_bi]; break;
                    }
                }
                if (_allBtn) {
                    _allBtn.click();
                    window['_ssAllTabDone'] = true;
                    console.log('[fetch.js] Clicked All tab');
                    await new Promise(function(r) { setTimeout(r, 700); });
                }
            }
            // ─────────────────────────────────────────────────────────

            // ── FIX: Read Amazon Bearer JWT before building headers ────────────
            // Intercepted from Amazon's own SPA requests by notif_block.js MAIN world.
            // Without this token hiring.amazon.ca/graphql returns 401 Unauthorized.
            var _tok = _getAuthHeader();
            if (!_tok) {
                // SPA hasn't made its first request yet — wait up to 6s for token
                console.log('[fetch.js] Waiting for Amazon auth token...');
                for (var _tw = 0; _tw < 12 && !_tok; _tw++) {
                    await new Promise(function(r) { setTimeout(r, 500); });
                    _tok = _getAuthHeader();
                }
                if (!_tok) console.warn('[fetch.js] Auth token not found — may get 401');
            }
            // _gqlHeaders is built inline inside fetch() below (after Q is defined)
            // ─────────────────────────────────────────────────────────────────────

            // ── DEBUG: log all filter values being sent to API ──────────────────
            console.log('[fetch.js] ══ API QUERY PARAMS ══');
            console.log('[fetch.js] City (k):', k, '| Lat:', l, '| Lng:', m);
            console.log('[fetch.js] Distance (n):', n, 'km → parsed:', parseInt(n) || 50);
            console.log('[fetch.js] JobType/WorkHours (o):', o, '→', o !== 'Any' ? 'FILTERING by ' + o : 'Any (no filter)');
            console.log('[fetch.js] Country (i):', i, '→', y(i)['locale']);
            console.log('[fetch.js] Active (p):', p, '| Interval (c):', c, 'ms');
            // ─────────────────────────────────────────────────────────────────
            // ── Build query then fire animation + request SIMULTANEOUSLY ─────────
            const O = o !== 'Any' ? [{
                        'key': 'jobType',
                        'val': [o]
                    }] : [];
            const P = new Date()['toISOString']()['split']('T')[0x0];
            const Q = y(i);
            const R = {
                    'operationName': 'searchJobCardsByLocation',
                    'variables': {
                        'searchJobRequest': {
                            'locale': Q['locale'],
                            'country': Q['country'],
                            'keyWords': '',
                            'equalFilters': [],
                            'containFilters': [
                                {
                                    'key': 'isPrivateSchedule',
                                    'val': ['false']
                                },
                                ...O
                            ],
                            'rangeFilters': [{
                                    'key': 'hoursPerWeek',
                                    'range': {
                                        'minimum': 0x0,
                                        'maximum': 0x50
                                    }
                                }],
                            'orFilters': [],
                            'dateFilters': [{
                                    'key': 'firstDayOnSite',
                                    'range': { 'startDate': P }
                                }],
                            'sorters': [],
                            'pageSize': 0x64,
                            'geoQueryClause': {
                                'lat': l,
                                'lng': m,
                                'unit': 'km',
                                'distance': parseInt(n) || 50
                            },
                            'consolidateSchedule': !![]
                        }
                    },
                    'query': 'query\x20searchJobCardsByLocation($searchJobRequest:\x20SearchJobRequest!)\x20{\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20searchJobCardsByLocation(searchJobRequest:\x20$searchJobRequest)\x20{\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20nextToken\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20jobCards\x20{\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20jobId\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20jobTitle\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20city\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20distance\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20}\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20}\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20}'
            };
            if (!p) return;
            // ── PERFORMANCE ENGINE: Skip scan if throttled ──
            if (_shouldThrottle()) {
                // But still check for page errors even when throttled
                var _errText = (document.body && document.body.innerText) || '';
                if (/problem loading page|server didn't respond|try refreshing/i.test(_errText)) {
                    console.log('[fetch.js] Page error during throttle — hard refreshing');
                    setTimeout(function() { window.location.reload(true); }, 2000);
                    return;
                }
                // Don't skip — just slow down. A 3s scan is better than no scan.
                console.log('[perf] Near rate limit — slowing to 3s for this scan');
                if (b) { clearTimeout(b); b = null; }
                b = setTimeout(function() { b = null; if (p) D(); }, 3000);
                // Don't return — let the scan execute at this slower pace
            }
            // ── START ANIMATION + TIMER AT EXACT MOMENT REQUEST FIRES ──────────
            // User sees animation begin at the same instant the request is sent.
            // setTimeout(D, c) fires c ms later — exactly when animation completes.
            _showRing(c);
            if (b) { clearTimeout(b); b = null; }
            // ── PERFORMANCE ENGINE: Use optimal interval instead of fixed c ──
            var _optInterval = _calculateOptimalInterval(c);
            _trackRequest(); // Track for rate limit learning
            b = setTimeout(function() { b = null; if (p) D(); }, _optInterval);
            // ─────────────────────────────────────────────────────────────────────
            const S = await fetch('https://hiring.amazon.ca/graphql', {
                    'method': 'POST',
                    'credentials': 'include',
                    'headers': Object.assign({
                        'accept': '*/*',
                        'accept-language': 'en-US,en;q=0.7',
                        'content-type': 'application/json',
                        'Country': Q['country'],
                        'Iscanary': 'false',
                        'Priority': 'u=1, i'
                    }, _tok ? {'authorization': _tok} : {}),
                    'body': JSON['stringify'](R)
                });
            // Deactivated while waiting for network? Hide ring and stop
            if (!p) { _hideRing(); return; }
            // ── Handle 401: clear stale token and re-scan after 2s ──────────────
            // S is const — cannot reassign. Instead: clear cache, let next D() retry.
            if (S['status'] === 401) {
                console.warn('[fetch.js] 401 — clearing auth token cache, retrying in 2s');
                _ssAuthTok = null;
                try { localStorage.removeItem('__ss_auth'); } catch(_) {}
                _ringState('warn', 'Auth refresh — retry in 2s', 2000);
                if (b) { clearTimeout(b); b = null; }
                b = setTimeout(function() { b = null; if (p) D(); }, 2000);
                return;
            }
            // ─────────────────────────────────────────────────────────────────────
            // Check HTTP status — update the toast if server returned an error
            if (!S['ok']) {
                if (S['status'] === 403 || S['status'] === 429) {
                    // 403/429: rate limited — switch to random 3-5s interval until 200 returns
                    if (!window['_rateLimited']) {
                        window['_rateLimited'] = true;
                        window['_normalInterval'] = c;
                        window['_rateLimitStarted'] = Date.now();
                        _stats.rateLimitHits++;
                        _onRateLimit(); // Feed performance engine
                        console.log('[fetch.js] 403/429 detected — switching to smart backoff');
                    }
                    // If rate limited for 10+ minutes straight — full session reset
                    if (window['_rateLimitStarted'] && (Date.now() - window['_rateLimitStarted']) > 10 * 60 * 1000) {
                        console.log('[fetch.js] Rate limited for 10+ minutes — full session reset');
                        window['_rateLimited'] = false;
                        window['_rateLimitStarted'] = null;
                        window.location.href = 'https://auth.hiring.amazon.ca/#/login';
                        return;
                    }
                    var _randomMs = (3000 + Math['floor'](Math['random']() * 2000)); // 3000-5000ms
                    _ringState('warn', 'Rate limited — retry in ' + Math['round'](_randomMs/1000) + 's', _randomMs);
                    if (b) { clearTimeout(b); b = null; }
                    b = setTimeout(function() { b = null; if (p) D(); }, _randomMs);
                } else {
                    // Other errors (500 etc) — retry after c ms
                    _ringState('err', 'Server error ' + S['status'], c);
                    if (b) { clearTimeout(b); b = null; }
                    b = setTimeout(function() { b = null; if (p) D(); }, c);
                }
                return;
            }
            // 200 OK — if we were rate limited, restore normal interval
            if (window['_rateLimited']) {
                window['_rateLimited'] = false;
                window['_rateLimitStarted'] = null;
                c = window['_normalInterval'];
                console.log('[fetch.js] 200 OK — restored normal interval:', c, 'ms');
                _startScan();
                _ringState('', 'Job Checking...', c); // Restore animation to normal scan interval
            }
            _onSuccessfulRequest(); // Feed performance engine
            const T = await S['json'](), U = T['data']['searchJobCardsByLocation']['jobCards'];
            _stats.scansCompleted++;
            if (U && U['length'] > 0x0) {
                // Rich toast: show ALL found jobs (any city, any range)
                const _ci = y(i);
                // ── INCREMENT STATS: shifts found ──
                _stats.shiftsFound += U['length'];
                _stats.lastShiftFoundAt = new Date().toLocaleTimeString();
                // ── PERFORMANCE ENGINE: Activate burst + record for predictions ──
                _activateBurst();
                _recordShiftFound();
                // Sort jobs by quality score (best first)
                U = _sortByScore(U);
                let _allJobsHtml = '<div style="text-align:left;font-size:12px;color:white;max-width:340px;font-family:sans-serif;">';
                _allJobsHtml += '<div style="font-weight:bold;font-size:14px;color:#4CAF50;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid rgba(76,175,80,0.4);">\uD83D\uDD0D ' + U['length'] + ' Job' + (U['length'] > 1 ? 's' : '') + ' Found!</div>';
                U['slice'](0, 6)['forEach'](function (_job, _idx) {
                    const _jobUrl = 'https://' + _ci['domain'] + '/app#/jobDetail?jobId=' + _job['jobId'] + '&locale=' + _ci['locale'];
                    const _isLast = _idx >= Math['min'](U['length'], 6) - 1;
                    _allJobsHtml += '<div style="margin-bottom:6px;padding-bottom:6px;' + (!_isLast ? 'border-bottom:1px solid rgba(255,255,255,0.08);' : '') + '">';
                    _allJobsHtml += '<div style="font-weight:bold;">' + (_job['jobTitle'] || 'Warehouse Associate') + '</div>';
                    _allJobsHtml += '<div style="color:#aaa;font-size:11px;margin-top:2px;">\uD83D\uDCCD ' + (_job['city'] || 'N/A') + (_job['distance'] ? ' &nbsp;&middot;&nbsp; ' + parseFloat(_job['distance'])['toFixed'](1) + ' km away' : '') + '</div>';
                    _allJobsHtml += '<a href="' + _jobUrl + '" style="color:#4CAF50;font-size:11px;text-decoration:none;" target="_blank">View \u2192</a>';
                    _allJobsHtml += '</div>';
                });
                if (U['length'] > 6) {
                    _allJobsHtml += '<div style="color:#aaa;font-size:11px;margin-top:2px;">+' + (U['length'] - 6) + ' more jobs...</div>';
                }
                _allJobsHtml += '</div>';
                Swal['fire']({
                    'toast': !![],
                    'position': 'bottom-start',
                    'timer': 12000,
                    'showConfirmButton': ![],
                    'timerProgressBar': !![],
                    'html': _allJobsHtml,
                    'background': 'rgba(15,15,15,0.92)',
                    'width': '370px'
                });
                // Send Telegram for ALL found jobs in background (non-blocking)
                U['forEach'](function (_job) {
                    fetchScheduleDetails(_job['jobId'])['then'](function (_schedules) {
                        return sendTelegramAlert(_schedules, _job);
                    })['catch'](function (_e) {
                        console['error']('BG telegram failed for ' + _job['jobId'] + ':', _e);
                    });
                });
                M();
                G(U);
            } else {
            }
        } catch (V) {
            console['error']('Error\x20fetching\x20job\x20listings:', V);
        }
    }
    async function E() {
        if (!j) {
            const O = y(i);
            // Flag: tell checkRedirect not to interrupt us while we fetch candidateID
            window['_candidateIDFetching'] = true;
            window['location']['href'] = 'https://hiring.amazon.ca/app#/contactInformation', await f();
            const P = document['querySelector']('input[data-test-id=\x22input-test-id-emailId\x22]');
            if (P && P['value']) {
                const Q = P['value'];
                chrome['storage']['local']['set']({ 'candidateID': Q }, function () {
                    window['_candidateIDFetching'] = false;
                    const R = y(i);
                    window['location']['href'] = 'https://hiring.amazon.ca/app#/jobSearch';
                });
            } else {
                window['_candidateIDFetching'] = false;
            }
        } else {
        }
    }
    function F() {
        const O = window['location']['href'], P = O['includes']('/app#/jobSearch');
        return P;
    }
    async function fetchScheduleDetails(jobId) {
        try {
            const Q = y(i), P = new Date()['toISOString']()['split']('T')[0x0];
            const request = {
                'operationName': 'searchScheduleCards',
                'variables': {
                    'searchScheduleRequest': {
                        'locale': Q['locale'],
                        'country': Q['country'],
                        'keyWords': '',
                        'equalFilters': [],
                        'containFilters': [{
                            'key': 'isPrivateSchedule',
                            'val': ['false']
                        }],
                        'rangeFilters': [{
                            'key': 'hoursPerWeek',
                            'range': { 'minimum': 0x0, 'maximum': 0x50 }
                        }],
                        'orFilters': [],
                        'dateFilters': [{
                            'key': 'firstDayOnSite',
                            'range': { 'startDate': P }
                        }],
                        'sorters': [],
                        'pageSize': 0x3e8,
                        'jobId': jobId,
                        'consolidateSchedule': !![]
                    }
                },
                'query': 'query\x20searchScheduleCards($searchScheduleRequest:\x20SearchScheduleRequest!)\x20{\x0a\x20\x20searchScheduleCards(searchScheduleRequest:\x20$searchScheduleRequest)\x20{\x0a\x20\x20\x20\x20nextToken\x0a\x20\x20\x20\x20scheduleCards\x20{\x0a\x20\x20\x20\x20\x20\x20jobId\x0a\x20\x20\x20\x20\x20\x20scheduleId\x0a\x20\x20\x20\x20\x20\x20externalJobTitle\x0a\x20\x20\x20\x20\x20\x20city\x0a\x20\x20\x20\x20\x20\x20state\x0a\x20\x20\x20\x20\x20\x20address\x0a\x20\x20\x20\x20\x20\x20postalCode\x0a\x20\x20\x20\x20\x20\x20basePay\x0a\x20\x20\x20\x20\x20\x20basePayL10N\x0a\x20\x20\x20\x20\x20\x20signOnBonus\x0a\x20\x20\x20\x20\x20\x20signOnBonusL10N\x0a\x20\x20\x20\x20\x20\x20surgePay\x0a\x20\x20\x20\x20\x20\x20totalPayRate\x0a\x20\x20\x20\x20\x20\x20totalPayRateL10N\x0a\x20\x20\x20\x20\x20\x20hoursPerWeek\x0a\x20\x20\x20\x20\x20\x20firstDayOnSite\x0a\x20\x20\x20\x20\x20\x20firstDayOnSiteL10N\x0a\x20\x20\x20\x20\x20\x20scheduleText\x0a\x20\x20\x20\x20\x20\x20scheduleType\x0a\x20\x20\x20\x20\x20\x20scheduleTypeL10N\x0a\x20\x20\x20\x20\x20\x20employmentType\x0a\x20\x20\x20\x20\x20\x20employmentTypeL10N\x0a\x20\x20\x20\x20\x20\x20currencyCode\x0a\x20\x20\x20\x20\x20\x20distance\x0a\x20\x20\x20\x20\x20\x20distanceL10N\x0a\x20\x20\x20\x20\x20\x20scheduleBannerText\x0a\x20\x20\x20\x20\x20\x20scheduleBusinessCategory\x0a\x20\x20\x20\x20\x20\x20scheduleBusinessCategoryL10N\x0a\x20\x20\x20\x20\x20\x20hireStartDate\x0a\x20\x20\x20\x20\x20\x20monthlyBasePay\x0a\x20\x20\x20\x20\x20\x20monthlyBasePayL10N\x0a\x20\x20\x20\x20}\x0a\x20\x20}\x0a}'
            };
            // Include auth token for schedule details (same 401 issue)
            var _schedHeaders = {
                'accept': '*/*',
                'content-type': 'application/json',
                'Country': Q['country'],
                'Iscanary': 'false'
            };
            var _schedTok = _getAuthHeader();
            if (_schedTok) _schedHeaders['authorization'] = _schedTok;
            const response = await fetch('https://hiring.amazon.ca/graphql', {
                'method': 'POST',
                'credentials': 'include',
                'headers': _schedHeaders,
                'body': JSON['stringify'](request)
            });
            const data = await response['json']();
            return data['data']['searchScheduleCards']['scheduleCards'] || [];
        } catch (err) {
            console['error']('Error\x20fetching\x20schedule\x20details:', err);
            return [];
        }
    }
    async function sendTelegramAlert(schedules, matchedJob) {
        // Send job alert to our own Telegram group
        try {
            const Q = y(i);
            const jobUrl = 'https://' + Q['domain'] + '/app#/jobDetail?jobId=' + matchedJob['jobId'] + '&locale=' + Q['locale'];
            let msg = '🎯 *CoderSnap — Job Found!*\n\n';
            msg += '📋 *' + (matchedJob['jobTitle'] || 'Warehouse Associate') + '*\n';
            msg += '📍 ' + (matchedJob['city'] || 'N/A') + '\n';
            if (matchedJob['distance']) msg += '📏 ' + parseFloat(matchedJob['distance']).toFixed(1) + ' km away\n';
            msg += '🔗 [View Job](' + jobUrl + ')\n';
            if (schedules && schedules.length > 0) {
                msg += '\n*Schedules:*\n';
                schedules.slice(0, 5).forEach(function(s) {
                    msg += '• ' + (s['externalJobTitle'] || s['scheduleType'] || 'Shift') + ' — ';
                    if (s['totalPayRateL10N'] || s['totalPayRate']) msg += '$' + (s['totalPayRateL10N'] || s['totalPayRate']) + '/hr ';
                    if (s['hoursPerWeek']) msg += '(' + s['hoursPerWeek'] + 'h/wk) ';
                    if (s['firstDayOnSiteL10N'] || s['firstDayOnSite']) msg += '| Start: ' + (s['firstDayOnSiteL10N'] || s['firstDayOnSite']);
                    msg += '\n';
                });
            }
            msg += '\n👤 ' + (g || 'Unknown user');
            await fetch('https://api.telegram.org/bot8863800330:AAE48axXq3pJCf3140YoqP-VPF7yesG2zS4/sendMessage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: '-5532300400',
                    text: msg,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                })
            });
        } catch (err) {
            console['error']('Telegram alert failed:', err);
        }
    }
    async function G(O) {
        const P = await chrome['storage']['local']['get']([
                'cityTags',
                '__cr',
                '__isProUser',
                'selectedCity'
            ]), Q = P['cityTags'] || [];
        let R = P['__cr'] || 0x0;
        const S = P['__isProUser'] || ![];
        var _selectedRegion = P['selectedCity'] || '';
        // If no city tags set, apply to ALL found shifts (API already filtered by distance)
        if (Q['length'] === 0x0) {
            console.log('[fetch.js] No city tags set — applying to first found shift');
            // Fall through with isAnyCity = true
        }
        var isAnyCity = Q['length'] === 0x0 || Q['some'](V => V['toLowerCase']()['replace'](/[^a-zA-Z]/g, '') === 'anycity');
        // When using "Entire BC" or "Any City" region — apply to everything within radius
        if (_selectedRegion === 'Entire BC' || _selectedRegion === 'Any City') {
            isAnyCity = true;
        }
        const T = Q['map'](V => V['toLowerCase']()['replace'](/[^a-zA-Z]/g, ''));
        let U = null;
        for (const V of O) {
            if (!V['city']) {
                const W = await chrome['storage']['local']['get'](['cityTags']), X = W['cityTags'] || [], Y = X['map'](Z => Z['toLowerCase']()['replace'](/[^a-zA-Z]/g, ''));
                T['push'](...Y);
            }
            // City match only — distance is already filtered by the API geoQueryClause
            // Work hours (jobType) is filtered by containFilters in the API call
            const cityMatched = isAnyCity || (V['city'] && T['some'](a0 => V['city']['toLowerCase']()['replace'](/[^a-zA-Z]/g, '')['includes'](a0)));
            console.log('[fetch.js] Job:', V['jobTitle'], '| City:', V['city'] || 'N/A', '| CityMatch:', cityMatched);
            if (cityMatched) {
                    chrome['runtime']['sendMessage']({ 'action': 'playSound' });
                    try {
                        const a0 = new Audio(chrome['runtime']['getURL']('alert.wav'));
                        a0['volume'] = 0x1, a0['play']()['catch'](a1 => console['log']('Direct\x20play\x20failed,\x20background\x20handler\x20will\x20take\x20over'));
                    } catch (a1) {
                    }
                    // ── Notify YOUR Telegram group ──
                    try {
                        var _tgMsg = '🎯 *TARGET ACQUIRED!*\n' + (V['jobTitle'] || 'Warehouse') + ' — ' + (V['city'] || '') + '\n👤 ' + (g || '');
                        fetch('https://api.telegram.org/bot8863800330:AAE48axXq3pJCf3140YoqP-VPF7yesG2zS4/sendMessage', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ chat_id: '-5532300400', text: _tgMsg, parse_mode: 'Markdown' })
                        })['catch'](function(e) { console['log']('[telegram] notify failed:', e.message); });
                    } catch(e) {}
                    // ─────────────────────────────────────────────────────────
                    Swal['fire']({
                        'toast': !![],
                        'position': 'bottom-start',
                        'showConfirmButton': ![],
                        'timerProgressBar': !![],
                        'timer': 5000,
                        'background': 'rgba(15,15,15,0.92)',
                        'html': '<div style="color:white;font-size:13px;"><b style="color:#00d4ff;">🎯 TARGET ACQUIRED!</b><br><span style="color:#aaa;font-size:12px;">Deploying application to ' + (V['city'] || 'matched city') + '...</span></div>'
                    });
                    // ── INCREMENT STATS: applied ──
                    _stats.applied++;
                    U = V;
                    break;
            }
        }
        if (U) {
            const a2 = y(i), a3 = 'https://' + a2['domain'] + '/app#/jobDetail?jobId=' + U['jobId'] + '&locale=' + a2['locale'];
            // Telegram already sent for all jobs (including this one) in the D() fetch loop above.
            window['location']['href'] = a3, H();
        } else
            if (!b) _startScan();
    }
    function H() {
        var _hPoll;
        const O = new MutationObserver((Q, R) => {
            const S = document['querySelectorAll']('button[data-test-id=\x22ScheduleCardSelectScheduleLink\x22]');
            if (S['length'] > 0x0) {
                const U = Math['floor'](Math['random']() * S['length']), V = S[U];
                V['click'](), R['disconnect'](), clearInterval(_hPoll);
                return;
            }
            const T = document['querySelector']('button[data-test-id=\x22jobDetailSelectScheduleButton\x22]');
            if (T) {
                T['click'](), R['disconnect'](), clearInterval(_hPoll), setTimeout(() => H(), 0x64);
                return;
            }
        });
        O['observe'](document['body'], {
            'childList': !![],
            'subtree': !![]
        });
        const P = document['querySelectorAll']('button[data-test-id=\x22ScheduleCardSelectScheduleLink\x22]');
        if (P['length'] > 0x0) {
            const Q = Math['floor'](Math['random']() * P['length']);
            P[Q]['click'](), O['disconnect']();
            return;
        }
        // Polling fallback: check every 200ms for up to 10 seconds
        var _hAttempts = 0;
        _hPoll = setInterval(function() {
            _hAttempts++;
            var cards = document['querySelectorAll']('button[data-test-id=\x22ScheduleCardSelectScheduleLink\x22]');
            if (cards['length'] > 0) {
                var idx = Math['floor'](Math['random']() * cards['length']);
                cards[idx]['click']();
                O['disconnect']();
                clearInterval(_hPoll);
            } else {
                var selectBtn = document['querySelector']('button[data-test-id=\x22jobDetailSelectScheduleButton\x22]');
                if (selectBtn) {
                    selectBtn['click']();
                    O['disconnect']();
                    clearInterval(_hPoll);
                    setTimeout(() => H(), 100);
                }
            }
            if (_hAttempts >= 50) { // 10 seconds
                O['disconnect']();
                clearInterval(_hPoll);
                // Fallback: try StencilText click
                var R = document['querySelector']('div[data-test-component=\x22StencilText\x22]\x20em');
                if (R) { R['click'](); setTimeout(() => I(), 100); }
                else { console.log('[fetch.js] H() — no schedule cards found after 10s, retrying'); setTimeout(() => H(), 2000); }
            }
        }, 200);
    }
    function I() {
        var _iPoll;
        const O = new MutationObserver((Q, R) => {
            const S = document['querySelectorAll']('.scheduleCardLabelText');
            if (S['length'] > 0x0) {
                const T = Math['floor'](Math['random']() * S['length']), U = S[T];
                U['click'](), R['disconnect'](), clearInterval(_iPoll), J();
            }
        });
        O['observe'](document['body'], {
            'childList': !![],
            'subtree': !![]
        });
        const P = document['querySelectorAll']('.scheduleCardLabelText');
        if (P['length'] > 0x0) {
            const Q = Math['floor'](Math['random']() * P['length']);
            P[Q]['click'](), O['disconnect'](), J();
            return;
        }
        // Polling fallback: check every 200ms for up to 10 seconds
        var _iAttempts = 0;
        _iPoll = setInterval(function() {
            _iAttempts++;
            var labels = document['querySelectorAll']('.scheduleCardLabelText');
            if (labels['length'] > 0) {
                var idx = Math['floor'](Math['random']() * labels['length']);
                labels[idx]['click']();
                O['disconnect']();
                clearInterval(_iPoll);
                J();
            }
            if (_iAttempts >= 50) { // 10 seconds
                O['disconnect']();
                clearInterval(_iPoll);
                console.log('[fetch.js] I() — no schedule labels found after 10s');
                J(); // Try J() anyway — button might exist
            }
        }, 200);
    }
    function J() {
        var _jPoll;
        const O = new MutationObserver((Q, R) => {
            const S = document['querySelector']('button[data-test-id=\x22jobDetailApplyButtonDesktop\x22]');
            if (S) { S['click'](); R['disconnect'](); clearInterval(_jPoll); }
        });
        O['observe'](document['body'], {
            'childList': !![],
            'subtree': !![]
        });
        const P = document['querySelector']('button[data-test-id=\x22jobDetailApplyButtonDesktop\x22]');
        if (P) { P['click'](); O['disconnect'](); return; }
        // Polling fallback: check every 200ms for up to 10 seconds
        // Fixes issue where button appears without DOM mutations (no loading spinner)
        var _jAttempts = 0;
        _jPoll = setInterval(function() {
            _jAttempts++;
            var btn = document['querySelector']('button[data-test-id=\x22jobDetailApplyButtonDesktop\x22]');
            if (btn) {
                btn['click']();
                O['disconnect']();
                clearInterval(_jPoll);
            } else if (_jAttempts >= 50) { // 50 * 200ms = 10 seconds max
                O['disconnect']();
                clearInterval(_jPoll);
                console['log']('[fetch.js] Create Application button not found after 10s — retrying J()');
                setTimeout(function() { J(); }, 1000);
            }
        }, 200);
    }
    function K(O) {
        return new Promise((P, Q) => {
            chrome['storage']['local']['get'](O, R => {
                chrome['runtime']['lastError'] ? Q(chrome['runtime']['lastError']) : P(R);
            });
        });
    }

    // ── First-Time Setup Wizard ───────────────────────────────────────────────
    // Shows after first successful login — stays open until user clicks "All Set"
    async function showFirstTimeWizard() {
        if (typeof Swal === 'undefined') return;
        await Swal['fire']({
            'title': '🎯 Welcome to CoderSnap!',
            'html':
                '<div style="text-align:left;font-family:Inter,sans-serif;">'
                + '<p style="margin-bottom:14px;color:rgba(199,210,254,0.8);font-size:13px;">'
                + 'You are logged in! Here is what happens next &mdash; and one thing you <b style="color:#c7d2fe;">must set up</b> for full automation:</p>'
                + '<div style="display:flex;flex-direction:column;gap:8px;">'

                + '<div style="background:rgba(34,211,238,0.07);border:1px solid rgba(34,211,238,0.22);border-radius:10px;padding:11px 13px;">'
                + '<div style="font-size:10px;font-weight:800;color:#22d3ee;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px;">① What CoderSnap Does</div>'
                + '<div style="font-size:12.5px;color:rgba(199,210,254,0.8);">'
                + 'Automatically scans Amazon Jobs every <b style="color:#c7d2fe;">2 seconds</b>, finds matching shifts, and applies for you — hands free.</div></div>'

                + '<div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:11px 13px;">'
                + '<div style="font-size:10px;font-weight:800;color:#fbbf24;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px;">② Set Up Groq API Key (Required for CAPTCHA)</div>'
                + '<div style="font-size:12.5px;color:rgba(199,210,254,0.8);">'
                + 'When Amazon shows a CAPTCHA, CoderSnap uses <b style="color:#c7d2fe;">Groq AI</b> to solve it automatically. '
                + 'Without a key, you must solve CAPTCHAs manually every time.<br><br>'
                + '<b style="color:#fbbf24;">→ Get your free key:</b> Visit <a href="https://console.groq.com/keys" target="_blank" '
                + 'style="color:#818cf8;font-weight:700;">console.groq.com/keys</a> → Sign up free → Create API Key → '
                + 'Copy the key (starts with <code style="background:rgba(99,102,241,0.2);color:#a5f3fc;padding:1px 6px;border-radius:4px;">gsk_</code>)'
                + '</div></div>'

                + '<div style="background:rgba(139,92,246,0.07);border:1px solid rgba(139,92,246,0.22);border-radius:10px;padding:11px 13px;">'
                + '<div style="font-size:10px;font-weight:800;color:#a78bfa;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px;">③ Paste Key in Extension</div>'
                + '<div style="font-size:12.5px;color:rgba(199,210,254,0.8);">'
                + 'Click the <b style="color:#c7d2fe;">CoderSnap</b> icon in your toolbar → Find <b style="color:#c7d2fe;">◈ AI Captcha Solver</b> '
                + '→ Paste your key in the <b style="color:#c7d2fe;">GROQ API KEY</b> field → It saves automatically when valid.</div></div>'

                + '</div>'
                + '<p style="margin-top:12px;font-size:11px;color:rgba(199,210,254,0.35);text-align:center;">'
                + 'You can open this guide anytime from the Guide button.</p></div>',
            'confirmButtonText': '✅ All Set — Start Hunting!',
            'showCancelButton': false,
            'allowEscapeKey': false,
            'allowOutsideClick': false,
            'icon': 'info'
        });
    }
    // ─────────────────────────────────────────────────────────────────────────

    async function L() {
        if (!b) {
            // First-time wizard removed — Groq guide is shown after PIN in C()
            if (!g) {
                // Re-check storage — g might not be loaded yet on fresh page
                var _storedEmail = await chrome['storage']['local']['get']('__un')['then'](function(d) { return d['__un'] || null; });
                if (_storedEmail) {
                    g = _storedEmail;
                } else {
                    // Truly no email — but don't redirect to login if we just came FROM login
                    if (window.location.href.includes('redirectUrl') || window.location.href.includes('jobSearch')) {
                        console.log('[fetch.js] L() — no email but on redirect/jobSearch page, waiting...');
                        return;
                    }
                    const O = y(i);
                    window['location']['href'] = 'https://auth.hiring.amazon.ca/#/login';
                    return;
                }
            }
            if (g) {
                const P = y(i);
                // Flag: tell checkRedirect not to interrupt us while we fetch candidateID
                window['_candidateIDFetching'] = true;
                window['location']['href'] = 'https://hiring.amazon.ca/app#/contactInformation', await f();
                let Q = null;
                const R = document['querySelector']('input[data-test-id=\x22input-test-id-emailId\x22]');
                if (R && R['value']) {
                    Q = R['value'];
                    window['location']['href'] = 'https://hiring.amazon.ca/app#/jobSearch';
                }
                window['_candidateIDFetching'] = false;
                if (p) {
                    // UNLIMITED: skip server config check entirely
                    await chrome['storage']['local']['set']({
                        '__cr': 9999,
                        '__isProUser': true
                    });
                    // Credits check bypassed — unlimited usage
                }
                if (p) { _startScan(); }
                else {
                }
            } else {
            }
        }
    }
    function M() {
        b && (clearTimeout(b), b = null);
            _hideRing();
    }
    chrome['runtime']['onMessage']['addListener'](function (O, P, Q) {
        if (O['action'] == 'activate') {
            p = O['status'];
            if (p)
                C();
        }
        Q(!![]);
    });
    const N = chrome['runtime']['connect']({ 'name': 'amazon-shifts-extension' });
    N['onMessage']['addListener'](async function (O) {
        if (O['action'] == 'fetch_info') {
            g = O['data']['$username'], h = O['data']['$password'], j = O['data']['$candidateID'], k = O['data']['$selectedCity'], l = O['data']['$lat'], m = O['data']['$lng'], n = O['data']['$distance'], o = O['data']['$jobType'], p = O['data']['$active'], $version = O['data']['$version'];
            if (p) {
                C();
                return;
            }
        }
    }), N['postMessage']({ 'action': 'fetch_info' });

    // ── Recovery watchdog ─────────────────────────────────────────────────────
    // If the extension is active and on jobSearch but the fetch loop hasn't
    // started (b is still null), restart L(). This catches cases where L()
    // was interrupted by navigation timing or the activate message was missed.
    setInterval(function() {
        // Do NOT restart if any popup is showing
        if (window['_ss_banner_shown'] || window['_ss_guide_showing'] || window['_ss_polling'] || window['_ss_blk_showing']) return;
        if (p && F() && !b && !window['_candidateIDFetching']) {
            console.log('[fetch.js] Recovery watchdog: restarting loop');
            L();
        }
    }, 5000);



    // ── Login page detection: wait 30s then reload for fresh login ──
    (function() {
        var url = window.location.href;
        var isLoginPage = url.includes('#/login') || url.includes('/login');
        if (!isLoginPage || !p) return;
        // Already logged in — skip
        if (g && g !== 'null') return;
        // On login page with hunter ON — wait 30s then reload
        setTimeout(function() {
            if (p && (!g || g === 'null')) {
                window.location.reload();
            }
        }, 30000);
    })();
    // ─────────────────────────────────────────────────────────────

    // ── Auto-redirect: homepage → jobSearch in 5s when hunter is ON ────
    var _homeRedirTimer = null;
    function _checkHomeRedirect() {
        if (!p || !g) { // Only when hunter ON and logged in
            if (_homeRedirTimer) { clearTimeout(_homeRedirTimer); _homeRedirTimer = null; }
            return;
        }
        var url = window.location.href;
        var isHome = url === 'https://hiring.amazon.ca/' || url === 'https://hiring.amazon.ca'
                  || url === 'https://hiring.amazon.com/' || url === 'https://hiring.amazon.com';
        if (!isHome) {
            if (_homeRedirTimer) { clearTimeout(_homeRedirTimer); _homeRedirTimer = null; }
            return;
        }
        if (_homeRedirTimer) return; // Already counting down
        _homeRedirTimer = setTimeout(function() {
            _homeRedirTimer = null;
            if (p && g) window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
        }, 5000); // 5 seconds
    }
    _checkHomeRedirect(); // Check on page load
    // Re-check on every URL change (SPA navigation)
    (function() {
        var _prevUrl = location.href;
        setInterval(function() {
            if (location.href !== _prevUrl) { _prevUrl = location.href; _checkHomeRedirect(); }
        }, 800);
    })();
    // ─────────────────────────────────────────────────────────────────────


// ── Guide modal — triggered from extension popup ─────────────────
chrome['runtime']['onMessage']['addListener'](function(msg, sender, sendResponse) {
    if (msg['action'] !== 'showGuide') return;
    if (typeof Swal === 'undefined') return;
    Swal['fire']({
        'title': '',
        'html': `<div style="font-family:Inter,sans-serif;">
  <div style="background:linear-gradient(135deg,rgba(22,245,255,0.12),rgba(163,65,255,0.12));border-radius:14px;padding:16px 18px;margin-bottom:14px;border:1px solid rgba(22,245,255,0.2);text-align:center;">
    <div style="font-size:26px;margin-bottom:4px;">🎯</div>
    <div style="font-size:18px;font-weight:800;color:#e2e8f0;">How to Get Shifts Fast</div>
    <div style="font-size:12px;color:rgba(199,210,254,0.55);margin-top:3px;">CoderSnap Setup Guide</div>
  </div>
  <div style="background:rgba(22,245,255,0.05);border-left:3px solid #22d3ee;border-radius:0 10px 10px 0;padding:11px 14px;margin-bottom:10px;text-align:left;">
    <div style="font-weight:800;color:#22d3ee;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:6px;">🌍 REGION — Search Center</div>
    <div style="font-size:12.5px;color:rgba(199,210,254,0.85);line-height:1.65;">Pick the <b style="color:#e2e8f0;">city closest to where you want to work</b>. Amazon searches jobs near its GPS coordinates.</div>
    <div style="margin-top:7px;background:rgba(0,0,0,0.3);border-radius:8px;padding:7px 10px;font-family:monospace;font-size:11px;color:rgba(199,210,254,0.6);">REGION: Toronto ▼ &nbsp;|&nbsp; RADIUS: 150km ▼ &nbsp;|&nbsp; Any ▼</div>
  </div>
  <div style="background:rgba(163,65,255,0.05);border-left:3px solid #a855f7;border-radius:0 10px 10px 0;padding:11px 14px;margin-bottom:10px;text-align:left;">
    <div style="font-weight:800;color:#c084fc;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:6px;">🏙️ TARGET CITIES — Result Filter</div>
    <div style="font-size:12.5px;color:rgba(199,210,254,0.85);line-height:1.65;">Filters which jobs get applied to. <b style="color:#4ade80;">Any City ✓</b> = apply to everything in the radius.</div>
    <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap;">
      <span style="background:rgba(163,65,255,0.15);border:1px solid rgba(163,65,255,0.3);padding:3px 9px;border-radius:20px;font-size:11px;color:#c084fc;">Bolton ×</span>
      <span style="background:rgba(163,65,255,0.15);border:1px solid rgba(163,65,255,0.3);padding:3px 9px;border-radius:20px;font-size:11px;color:#c084fc;">Whitby ×</span>
      <span style="background:rgba(74,222,128,0.15);border:1px solid rgba(74,222,128,0.3);padding:3px 9px;border-radius:20px;font-size:11px;color:#4ade80;">Any City ✓</span>
    </div>
  </div>
  <div style="background:rgba(34,197,94,0.05);border-left:3px solid #22c55e;border-radius:0 10px 10px 0;padding:11px 14px;margin-bottom:10px;text-align:left;">
    <div style="font-weight:800;color:#4ade80;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:8px;">⚙️ HOW IT WORKS</div>
    <div style="font-size:12px;color:rgba(199,210,254,0.7);line-height:2;background:rgba(0,0,0,0.25);border-radius:8px;padding:9px 12px;">
      <span style="color:#22d3ee;font-weight:700;">REGION</span> Toronto + <span style="color:#a855f7;font-weight:700;">RADIUS</span> 50km + <span style="color:#4ade80;font-weight:700;">CITIES</span> Any<br>
      ↓ Amazon returns jobs within 50km of Toronto<br>
      ↓ Extension applies to <b style="color:#4ade80;">ALL jobs found ✓</b>
    </div>
  </div>
  <div style="background:linear-gradient(135deg,rgba(251,146,60,0.08),rgba(251,146,60,0.03));border:1px solid rgba(251,146,60,0.25);border-radius:10px;padding:12px 14px;text-align:left;">
    <div style="font-weight:800;color:#fb923c;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:9px;">⚡ BEST SETTINGS FOR FASTEST RESULTS</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
      <div style="background:rgba(0,0,0,0.25);border-radius:8px;padding:7px 10px;">
        <div style="color:rgba(199,210,254,0.4);font-size:10px;margin-bottom:2px;">REGION</div>
        <div style="font-weight:700;color:#e2e8f0;font-size:12.5px;">Nearest city</div>
      </div>
      <div style="background:rgba(0,0,0,0.25);border-radius:8px;padding:7px 10px;">
        <div style="color:rgba(199,210,254,0.4);font-size:10px;margin-bottom:2px;">RADIUS</div>
        <div style="font-weight:700;color:#e2e8f0;font-size:12.5px;">50–150 km</div>
      </div>
      <div style="background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.2);border-radius:8px;padding:7px 10px;">
        <div style="color:rgba(199,210,254,0.4);font-size:10px;margin-bottom:2px;">TARGET CITIES</div>
        <div style="font-weight:700;color:#4ade80;font-size:12.5px;">Any City ✓</div>
      </div>
      <div style="background:rgba(251,146,60,0.12);border:1px solid rgba(251,146,60,0.3);border-radius:8px;padding:7px 10px;">
        <div style="color:rgba(199,210,254,0.4);font-size:10px;margin-bottom:2px;">SCAN INTERVAL</div>
        <div style="font-weight:700;color:#fb923c;font-size:12.5px;">2 seconds ⚡</div>
      </div>
    </div>
    <div style="background:rgba(0,0,0,0.2);border-radius:7px;padding:8px 11px;font-size:11.5px;color:rgba(199,210,254,0.6);">
      ⚡ <b style="color:#fb923c;">2 sec interval</b> = 30 checks/min = fastest possible detection.
    </div>
  </div>
</div>`,
        'showConfirmButton': true,
        'confirmButtonText': '✕  Close Guide',
        'showCancelButton': false,
        'allowEscapeKey': true,
        'allowOutsideClick': true,
        'width': 'min(560px, 94vw)',
        'customClass': { 'htmlContainer': 'ss-guide-body' }
    });
});
// ─────────────────────────────────────────────────────────────────

}(location['pathname']));




// ── Auto-handle "Please sign-in again" popup + redirect to login ──────────────
(function() {
    'use strict';
    function checkSignInAgain() {
        // Don't trigger on redirectUrl pages — that's normal post-login flow
        if (window.location.href.includes('redirectUrl=')) return;
        // Check for SweetAlert "Please sign-in again" popup
        const swalPopup = document.querySelector('.swal2-popup.swal2-show, .swal2-container.swal2-shown .swal2-popup');
        if (swalPopup) {
            const text = swalPopup.innerText || '';
            if (/sign.?in again|session expired|please sign/i.test(text)) {
                console.log('[fetch.js] Detected sign-in again popup — auto-clicking Ok');
                const okBtn = swalPopup.querySelector('.swal2-confirm');
                if (okBtn) {
                    okBtn.click();
                    setTimeout(function() {
                        // Redirect to auth page after clicking Ok
                        const authDomain = window.location.hostname.includes('.ca')
                            ? 'https://auth.hiring.amazon.ca/#/login'
                            : 'https://auth.hiring.amazon.com/#/login';
                        console.log('[fetch.js] Redirecting to auth:', authDomain);
                        window.location.href = authDomain;
                    }, 800);
                }
                return;
            }
        }
        // Also check for inline "Please sign-in again" text in page body
        const bodyText = document.body && document.body.innerText || '';
        if (/please sign-in again|attention please|session expired/i.test(bodyText)) {
            const btns = [...(document.querySelectorAll('button'))];
            const okBtn = btns.find(b => /^ok$/i.test(b.textContent.trim()));
            if (okBtn) {
                okBtn.click();
                setTimeout(function() {
                    const authDomain = window.location.hostname.includes('.ca')
                        ? 'https://auth.hiring.amazon.ca/#/login'
                        : 'https://auth.hiring.amazon.com/#/login';
                    window.location.href = authDomain;
                }, 800);
            }
        }
    }

    // Check every 2 seconds
    setInterval(checkSignInAgain, 2000);

    // Also watch for DOM changes (SweetAlert injects dynamically)
    const _obs = new MutationObserver(function() { checkSignInAgain(); });
    if (document.body) _obs.observe(document.body, { childList: true, subtree: true });
})();


// ── Post-login redirect: after OTP verified, go to jobSearch ─────────────────
(function() {
    // Always use .ca — the extension targets Canadian Amazon Jobs
    var _jobSearchUrl = 'https://hiring.amazon.ca/app#/jobSearch';

    function doRedirect(reason) {
        // ── Never navigate while a setup popup is open ──────────────────────────
        // Swal popups (Gmail guide, Groq guide, setup wizard, trial notice) must
        // not be interrupted by automatic redirects. Defer until user closes popup.
        if (_popupIsOpen()) {
            console.log('[fetch.js] doRedirect(', reason, ') — popup open, deferring');
            if (!_pendingRedirect) {
                _pendingRedirect = reason;
                if (_pendingRedirectPoll) { clearInterval(_pendingRedirectPoll); }
                _pendingRedirectPoll = setInterval(function() {
                    if (!_popupIsOpen()) {
                        clearInterval(_pendingRedirectPoll);
                        _pendingRedirectPoll = null;
                        var _r = _pendingRedirect;
                        _pendingRedirect = null;
                        if (_r) doRedirect(_r); // fire now that popup is closed
                    }
                }, 500);
            }
            return; // do NOT navigate yet
        }
        // ─────────────────────────────────────────────────────────────────────────
        _pendingRedirect = null;
        console.log('[fetch.js] Redirecting to jobSearch. Reason:', reason);
        chrome.storage.local.remove('_pendingJobRedirect');
        chrome.storage.local.set({ '_pendingJobReloadUntil': Date.now() + 3 * 60 * 1000 });
        window.location.replace(_jobSearchUrl);
        setTimeout(function() {
            if (window.location.href.includes('app#/jobSearch')) {
                console.log('[fetch.js] 1-min post-login reload to start job checking');
                window.location.reload();
            }
        }, 60000);
    }

    // After jobSearch page loads: handle post-login activation
    if (window.location.href.includes('app#/jobSearch')) {
        chrome.storage.local.get(['_pendingJobReloadUntil', '__ap'], function(d) {
            var now = Date.now();

            // Case 1: Fresh post-login load — set the reload flag if not already activated
            if (d._pendingJobReloadUntil && now < d._pendingJobReloadUntil) {
                chrome.storage.local.remove('_pendingJobReloadUntil');
                if (!d.__ap) {
                    // Extension is not activated yet — reload page to trigger popup
                    console.log('[fetch.js] Post-login: extension not activated, reloading in 3s');
                    setTimeout(function() { window.location.reload(); }, 3000);
                } else {
                    // Extension IS activated — just send activate message to start D()
                    console.log('[fetch.js] Post-login: extension activated, sending activate msg');
                    chrome.runtime.sendMessage({ action: 'activate', status: true });
                }
                return;
            }

            // Case 2: Normal load — if activated but not running, send activate
            if (d.__ap) {
                console.log('[fetch.js] jobSearch loaded with active=true — sending activate');
                setTimeout(function() {
                    chrome.runtime.sendMessage({ action: 'activate', status: true });
                }, 1000);
            }
        });
    }

    function checkRedirect() {
        // Never interrupt a visible popup — wait for user to close it
        if (_popupIsOpen()) { return; }

        var url = window.location.href;

        // Already at destination — nothing to do
        if (url.includes('app#/jobSearch') || url.includes('app#/jobDetail')) {
            chrome.storage.local.remove('_pendingJobRedirect');
            return;
        }

        // ── Post-OTP redirect page: login?redirectUrl=contactInformation ──────
        // When user manually logs in Amazon redirects them to https://hiring.amazon.ca/
        // (the root) naturally. Our old 1.5s forced jump to jobSearch interrupted this,
        // causing the session to be incomplete → Amazon bounced us back → stuck loop.
        //
        // New strategy: wait 5s for Amazon to complete its own redirect naturally.
        // If Amazon redirected us away (URL no longer has redirectUrl=), the timer
        // fires but does nothing — the natural flow already landed on hiring.amazon.ca/
        // which checkRedirect handles by going to jobSearch.
        // If still stuck after 5s (Amazon didn't redirect), navigate to hiring.amazon.ca/
        // root so Amazon's SPA can properly initialize the session, THEN jobSearch.
        if (url.includes('/login') && url.includes('redirectUrl=')) {
            if (!window['_ssRedirectTimerSet']) {
                window['_ssRedirectTimerSet'] = true;
                console.log('[fetch.js] Post-login redirect page — going to jobSearch in 3s');
                setTimeout(function() {
                    var cur = window.location.href;
                    if (cur.includes('redirectUrl=')) {
                        if (_popupIsOpen()) {
                            console.log('[fetch.js] redirectUrl handler deferred — popup open');
                            return;
                        }
                        console.log('[fetch.js] Still on redirect page — going directly to jobSearch');
                        window.location.replace('https://hiring.amazon.ca/app#/jobSearch');
                    }
                }, 3000);
            }
            return;
        }
        // ─────────────────────────────────────────────────────────────────────

        chrome.storage.local.get(['_pendingJobRedirect'], function(data) {
            console.log('[fetch.js] checkRedirect: flag=', !!data._pendingJobRedirect, 'url=', url.slice(0,70));

            // Redirect from contactInformation — or reload if stuck
            if (url.includes('contactInformation')) {
                // ── Smart stuck detection: reload page after 5s if still here ──
                // Amazon's SPA sometimes shows loading spinner on this page indefinitely.
                // A page reload lets it complete the redirect naturally.
                if (!window['_ssContactReloadTimer']) {
                    window['_ssContactReloadTimer'] = setTimeout(function() {
                        if (window.location.href.includes('contactInformation')) {
                            if (_popupIsOpen()) { return; } // never reload while popup open
                            console.log('[fetch.js] Stuck on contactInformation — reloading page');
                            window.location.reload();
                        }
                    }, 5000);
                }
                // ─────────────────────────────────────────────────────────────
                if (window['_candidateIDFetching']) {
                    console.log('[fetch.js] checkRedirect: candidateID fetch in progress — waiting');
                    setTimeout(checkRedirect, 4000);
                    return;
                }
                console.log('[fetch.js] On contactInformation — redirecting to jobSearch');
                var saveBtn = [...document.querySelectorAll('button')]
                    .find(function(b) { return /^save$/i.test(b.textContent.trim()) && !b.disabled; });
                if (saveBtn) {
                    saveBtn.click();
                    setTimeout(function() { doRedirect('contactInfo-saved'); }, 1500);
                } else {
                    doRedirect('contactInfo-direct');
                }
                return;
            }

            // ALWAYS redirect from homepage if logged in (email in nav = logged in)
            if ((url === 'https://hiring.amazon.ca/' || url === 'https://hiring.amazon.ca' ||
                 url.includes('hiring.amazon.ca/#') || url === 'https://hiring.amazon.com/' ||
                 url.includes('hiring.amazon.com/#')) && !url.includes('app#')) {
                // Try clicking "Search all jobs" button first
                var searchAllBtn = [...document.querySelectorAll('button, a')]
                    .find(function(el) { return /search all jobs/i.test(el.textContent.trim()); });
                if (searchAllBtn) {
                    if (!window['_ssRootNavFired']) {
                        window['_ssRootNavFired'] = true;
                        setTimeout(function() { window['_ssRootNavFired'] = false; }, 10000);
                        console.log('[fetch.js] Homepage — clicking "Search all jobs"');
                        searchAllBtn.click();
                    }
                    return;
                }
                // Fallback: redirect if logged in
                var loggedIn = document.querySelector('[data-test-id="my-account"], .hvh-header__account, [class*="myAccount"]');
                if (loggedIn || data._pendingJobRedirect) {
                    if (!window['_ssRootNavFired']) {
                        window['_ssRootNavFired'] = true;
                        setTimeout(function() { window['_ssRootNavFired'] = false; }, 10000);
                        console.log('[fetch.js] On homepage — redirecting to jobSearch');
                        doRedirect('homepage-post-login');
                    }
                    return;
                }
            }

            if (!data._pendingJobRedirect) return;

            // .com domain — redirect to .ca
            if (url.includes('hiring.amazon.com') && !url.includes('auth.')) {
                doRedirect('com-to-ca');
                return;
            }

            // Any other page with flag set
            doRedirect('post-login: ' + (url.split('#')[1] || url.split('/').pop()));
        });
    }

    // ── Immediate check on page load ─────────────────────────────────────────
    if (window.location.href.includes('/login') && window.location.href.includes('redirectUrl=')) {
        // On redirectUrl page — run checkRedirect immediately (starts 5s wait)
        checkRedirect();
    } else if (window.location.href === 'https://hiring.amazon.ca/' || window.location.href === 'https://hiring.amazon.ca') {
        // Amazon naturally redirected to root after OTP.
        // Wait 3s before navigating to jobSearch — any visible popups get time to be read.
        setTimeout(checkRedirect, 3000);
    } else {
        setTimeout(checkRedirect, 2500);
    }

    // Check on SPA route changes — detect Amazon natural redirect to root
    var _prevUrl = window.location.href;
    setInterval(function() {
        var cur = window.location.href;
        if (cur !== _prevUrl) {
            _prevUrl = cur;
            // ── FIX: 3s delay on root URL — gives user time to read any visible popup ──
            // The old 800ms delay caused page navigation mid-popup (dismissing it).
            // 3s lets the user finish reading before we navigate to jobSearch.
            var _delay = (cur === 'https://hiring.amazon.ca/' || cur === 'https://hiring.amazon.ca') ? 3000 : 1500;
            setTimeout(checkRedirect, _delay);
        }
    }, 800);
})();


// ── Health Monitor ───────────────────────────────────────────────────────────
(function() {
    'use strict';

    // 1. Hourly reload to detect session expiry
    setTimeout(function() {
        if (!window['_ss_wizard_active']) {
            console.log('[health] Hourly refresh');
            window.location.reload();
        }
    }, 60 * 60 * 1000);

    // 2. Bug 1 fix: Stuck on homepage without login → redirect to auth login
    function checkLoginRequired() {
        // DISABLED: This was causing login loops.
        // After successful login, the page briefly shows the homepage without "My Account"
        // element loaded yet — this function detected it as "not logged in" and redirected
        // back to the login page, creating an infinite loop.
        // The login flow is fully handled by auth.js now.
        return;
    }

    // 3. Bug 4 fix handled above (10s reload after jobSearch load)
    function triggerActivationOnJobSearch() { /* handled by reload */ }

    // 4. Stuck page watchdog
    var _lastUrl = window.location.href;
    var _stuckCount = 0;

    setInterval(function() {
        var url = window.location.href;
        checkLoginRequired();

        // redirectUrl page: always stuck — handled by checkRedirect (1.5s timer)
        // Other stuck cases handled by the 30s watchdog below
        var isStuck = url.includes('contactInformation') || url === 'https://hiring.amazon.ca/' ||
                      url === 'https://hiring.amazon.ca' ||
                      (url.includes('/login') && url.includes('redirectUrl=')) ||
                      (url.includes('hiring.amazon.ca') && !url.includes('app#'));
        if (url === _lastUrl && isStuck) {
            if (_stuckCount >= 3) {
                _stuckCount = 0;
            }
        } else {
            _stuckCount = 0;
            _lastUrl = url;
            if (url.includes('app#/jobSearch')) triggerActivationOnJobSearch();
        }
    }, 30000);

    // Also trigger immediately on jobSearch page load (Bug 4)
    setTimeout(function() {
        if (window.location.href.includes('app#/jobSearch')) {
            triggerActivationOnJobSearch();
        }
    }, 3000);
})();
