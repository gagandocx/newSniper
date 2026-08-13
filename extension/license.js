/**
 * license.js — CoderSnap Online License Verification
 * 
 * Flow:
 * 1. User enters license key + Amazon email in popup
 * 2. Extension calls Google Apps Script API to ACTIVATE (binds key + email + device)
 * 3. On every popup open, extension calls API to VERIFY (checks key/email/device match)
 * 4. If verification fails → extension is locked
 * 5. One key = one email = one device = forever
 * 
 * YOU MUST SET THE LICENSE_SERVER_URL below after deploying the Google Apps Script.
 */

(function() {
    'use strict';

    // ══════════════════════════════════════════════════════════════════
    // ██  PASTE YOUR GOOGLE APPS SCRIPT DEPLOYED URL HERE  ██
    // ══════════════════════════════════════════════════════════════════
    const LICENSE_SERVER_URL = 'https://script.google.com/macros/s/AKfycbziX_IPp8afiwz7-4Cj3QisI1dz6W0IZQAqP7vpsBrBbq0yLB-vl42HNnL4hyFYxeJEMQ/exec';
    // ══════════════════════════════════════════════════════════════════

    // ── ANTI-DEBUGGING: DISABLED ────────────────────────────────────────────
    // Was causing false positives that set __cs_license_valid=false
    // especially when browser is under load (100ms timing threshold too sensitive)
    // The license server verification is sufficient protection
    // ─────────────────────────────────────────────────────────────────────────

    // ── Device fingerprint: unique per Chrome profile ──
    function getDeviceId() {
        // Combine extension ID + screen + hardware for uniqueness
        var parts = [
            chrome.runtime.id || 'x',
            screen.width + 'x' + screen.height,
            screen.colorDepth || 0,
            navigator.hardwareConcurrency || 0,
            navigator.language || 'en'
        ];
        // Simple hash
        var str = parts.join('|');
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash; // Convert to 32bit int
        }
        return 'D' + Math.abs(hash).toString(36).toUpperCase();
    }

    // ── Format key with dashes as user types ──
    function formatKey(raw) {
        const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const parts = [];
        for (let i = 0; i < clean.length; i += 5) {
            parts.push(clean.substring(i, i + 5));
        }
        return parts.join('-');
    }

    // ── Call the license server (via background service worker) ──
    async function callServer(action, key, email) {
        const deviceId = getDeviceId();
        const cleanKey = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const cleanEmail = email.toLowerCase().trim();
        
        const url = LICENSE_SERVER_URL
            + '?action=' + encodeURIComponent(action)
            + '&key=' + encodeURIComponent(cleanKey)
            + '&email=' + encodeURIComponent(cleanEmail)
            + '&device=' + encodeURIComponent(deviceId);

        console.log('[license] callServer:', action, '→', url.substring(0, 80) + '...');

        try {
            // Route through background.js service worker (no CORS/redirect issues)
            const result = await new Promise(function(resolve, reject) {
                console.log('[license] Sending message to background...');
                chrome.runtime.sendMessage({ action: 'licenseRequest', url: url }, function(response) {
                    console.log('[license] Got response from background:', JSON.stringify(response));
                    if (chrome.runtime.lastError) {
                        console.error('[license] runtime.lastError:', chrome.runtime.lastError.message);
                        resolve({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        resolve(response || { success: false, error: 'No response from background' });
                    }
                });
            });
            console.log('[license] callServer result:', JSON.stringify(result));
            return result;
        } catch (err) {
            console.error('[license] callServer exception:', err);
            return { success: false, error: err.message || 'Network error' };
        }
    }

    // ── Check stored license against server ──
    async function verifyStoredLicense() {
        return new Promise(function(resolve) {
            chrome.storage.local.get(['__cs_license_key', '__cs_license_email'], async function(data) {
                if (!data['__cs_license_key'] || !data['__cs_license_email']) {
                    resolve({ valid: false, error: 'No license stored' });
                    return;
                }
                
                const result = await callServer('verify', data['__cs_license_key'], data['__cs_license_email']);
                
                if (result.success && result.valid) {
                    // Store the actual days remaining from server
                    var daysLeft = result.daysRemaining || null;
                    if (daysLeft !== null) {
                        chrome.storage.local.set({ '__cs_license_days_remaining': daysLeft });
                    }
                    resolve({ valid: true, daysRemaining: daysLeft });
                } else {
                    resolve({ valid: false, error: result.error || 'Verification failed' });
                }
            });
        });
    }

    // ── Activate a new license ──
    async function activateLicense(key, email) {
        const result = await callServer('activate', key, email);
        
        if (result.success) {
            // Store locally
            const cleanKey = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const cleanEmail = email.toLowerCase().trim();
            
            await new Promise(function(resolve) {
                chrome.storage.local.set({
                    '__cs_license_key': cleanKey,
                    '__cs_license_email': cleanEmail,
                    '__cs_license_device': getDeviceId(),
                    '__cs_license_date': new Date().toISOString(),
                    '__cs_license_valid': true,
                    '__cs_license_days_remaining': result.daysRemaining || 365
                }, resolve);
            });
            
            // ── BACKUP: Also save to localStorage (survives chrome.storage wipes) ──
            try {
                localStorage.setItem('__cs_bk_key', cleanKey);
                localStorage.setItem('__cs_bk_email', cleanEmail);
            } catch(e) {}
            
            // Also set the Amazon email for the extension
            await new Promise(function(resolve) {
                chrome.storage.local.set({ '__un': cleanEmail }, resolve);
            });
            
            return { success: true, daysRemaining: result.daysRemaining || 365 };
        } else {
            return { success: false, error: result.error || 'Activation failed' };
        }
    }

    // ── UI Logic: Show gate or main app ──
    async function initLicenseGate() {
        const gate = document.getElementById('license-gate');
        const app = document.getElementById('main-app');
        
        if (!gate || !app) return;

        // Check if we have a stored license
        const stored = await new Promise(function(resolve) {
            chrome.storage.local.get(['__cs_license_key', '__cs_license_email'], resolve);
        });

        // ── BACKUP RECOVERY: If keys missing from chrome.storage, try localStorage backup ──
        if (!stored['__cs_license_key'] || !stored['__cs_license_email']) {
            try {
                var _backupKey = localStorage.getItem('__cs_bk_key');
                var _backupEmail = localStorage.getItem('__cs_bk_email');
                if (_backupKey && _backupEmail) {
                    console.log('[license] Keys missing from chrome.storage — restoring from localStorage backup');
                    await new Promise(function(r) {
                        chrome.storage.local.set({
                            '__cs_license_key': _backupKey,
                            '__cs_license_email': _backupEmail,
                            '__cs_license_valid': true
                        }, r);
                    });
                    stored['__cs_license_key'] = _backupKey;
                    stored['__cs_license_email'] = _backupEmail;
                }
            } catch(e) {}
        }

        if (stored['__cs_license_key'] && stored['__cs_license_email']) {
            // Has stored license — verify online
            gate.style.display = 'none';
            app.style.display = 'block';

            // Show a brief "verifying..." state
            const badge = document.getElementById('access-badge');
            if (badge) {
                badge.style.display = 'inline-block';
                badge.innerHTML = '&#8635; Verifying...';
                badge.style.cssText = 'display:inline-block;background:rgba(59,130,246,0.12);'
                    + 'color:#93c5fd;border:1px solid rgba(59,130,246,0.25);font-size:8px;font-weight:600;'
                    + 'letter-spacing:1px;padding:2px 8px;border-radius:10px;';
            }

            const verification = await verifyStoredLicense();
            
            if (verification.valid) {
                // Show LICENSED badge with days remaining
                if (badge) {
                    var daysText = verification.daysRemaining ? ' (' + verification.daysRemaining + 'd left)' : '';
                    badge.innerHTML = '&#10024; LICENSED' + daysText;
                    badge.style.cssText = 'display:inline-block;background:linear-gradient(135deg,#22d3a8,#3b82f6);'
                        + 'color:#fff;font-size:8px;font-weight:900;letter-spacing:1.5px;padding:2px 8px;'
                        + 'border-radius:10px;text-transform:uppercase;box-shadow:0 0 8px rgba(34,211,168,0.4);';
                }
                // Mark as valid for fetch.js
                chrome.storage.local.set({ '__cs_license_valid': true });
                // ── BACKUP: Save to localStorage as safety net ──
                try {
                    localStorage.setItem('__cs_bk_key', stored['__cs_license_key']);
                    localStorage.setItem('__cs_bk_email', stored['__cs_license_email']);
                } catch(e) {}
            } else {
                // License verification failed — but DON'T show gate for transient errors
                var errorMsg = verification.error || '';
                var isHardFailure = errorMsg === 'License revoked' || 
                                    errorMsg === 'License expired' ||
                                    errorMsg === 'License expired — 1 year has passed since activation' ||
                                    errorMsg === 'Email mismatch — key bound to different account' ||
                                    errorMsg === 'Device mismatch — key activated on different device' ||
                                    errorMsg === 'Email mismatch' ||
                                    errorMsg === 'Device mismatch';
                
                if (isHardFailure) {
                    // Genuine license problem — show error badge, clear keys, show gate
                    if (badge) {
                        badge.innerHTML = '&#128274; ' + errorMsg;
                        badge.style.cssText = 'display:inline-block;background:rgba(239,68,68,0.15);'
                            + 'color:#f87171;border:1px solid rgba(239,68,68,0.35);font-size:8px;font-weight:800;'
                            + 'letter-spacing:1px;padding:2px 8px;border-radius:10px;';
                    }
                    chrome.storage.local.set({ '__cs_license_valid': false });
                    chrome.storage.local.remove(['__cs_license_key', '__cs_license_email', '__cs_license_device', '__cs_license_valid', '__cs_license_days_remaining']);
                    gate.style.display = 'block';
                    app.style.display = 'none';
                } else {
                    // Transient error (network issue, Google redirect, timeout) — keep license active
                    // Show a warning badge but DON'T clear keys or show gate
                    console.warn('[license] Verify failed (transient):', errorMsg, '— keeping license active');
                    if (badge) {
                        badge.innerHTML = '&#10024; LICENSED (offline)';
                        badge.style.cssText = 'display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);'
                            + 'color:#fff;font-size:8px;font-weight:900;letter-spacing:1.5px;padding:2px 8px;'
                            + 'border-radius:10px;text-transform:uppercase;';
                    }
                    // Keep scanning — don't invalidate on transient failures
                    chrome.storage.local.set({ '__cs_license_valid': true });
                }
            }
        } else {
            // No license — show activation gate
            gate.style.display = 'block';
            app.style.display = 'none';
        }
        
        // ── Gate UI event handlers ──
        setupGateUI(gate, app);
    }

    function setupGateUI(gate, app) {
        // Auto-format key input
        const keyInput = document.getElementById('license-key-input');
        if (keyInput) {
            keyInput.addEventListener('input', function() {
                const raw = this.value.replace(/[^A-Za-z0-9]/g, '');
                this.value = formatKey(raw);
            });
        }

        // Activate button
        const btn = document.getElementById('activate-license-btn');
        if (btn) {
            btn.addEventListener('click', async function() {
                console.log('[license] Activate button clicked!');
                const keyEl = document.getElementById('license-key-input');
                const emailEl = document.getElementById('license-email-input');
                const okBadge = document.getElementById('license_ok');
                const errBadge = document.getElementById('license_err');
                
                const key = (keyEl ? keyEl.value.trim() : '');
                const email = (emailEl ? emailEl.value.trim() : '');

                if (!key || key.replace(/-/g, '').length < 5) {
                    showError(errBadge, okBadge, 'Enter your license key');
                    return;
                }
                if (!email || !email.includes('@')) {
                    showError(errBadge, okBadge, 'Enter your Amazon email');
                    return;
                }

                btn.textContent = 'Verifying online...';
                btn.disabled = true;
                if (errBadge) errBadge.style.display = 'none';

                const result = await activateLicense(key, email);
                
                if (result.success) {
                    if (okBadge) okBadge.style.display = 'flex';
                    if (errBadge) errBadge.style.display = 'none';
                    btn.textContent = '✓ Activated!';
                    btn.style.background = 'linear-gradient(135deg, #4ade80, #22d3a8)';
                    
                    setTimeout(function() {
                        gate.style.display = 'none';
                        app.style.display = 'block';
                        // Show licensed badge with days remaining
                        const badge = document.getElementById('access-badge');
                        if (badge) {
                            badge.style.display = 'inline-block';
                            badge.innerHTML = '&#10024; LICENSED (365d left)';
                            badge.style.cssText = 'display:inline-block;background:linear-gradient(135deg,#22d3a8,#3b82f6);'
                                + 'color:#fff;font-size:8px;font-weight:900;letter-spacing:1.5px;padding:2px 8px;'
                                + 'border-radius:10px;text-transform:uppercase;box-shadow:0 0 8px rgba(34,211,168,0.4);';
                        }
                    }, 1200);
                } else {
                    showError(errBadge, okBadge, result.error || 'Activation failed');
                    btn.textContent = 'Activate License';
                    btn.disabled = false;
                    
                    // Shake
                    if (keyEl) {
                        keyEl.style.animation = 'none';
                        keyEl.offsetHeight;
                        keyEl.style.animation = 'shake 0.4s ease';
                    }
                }
            });
        }

        // Enter key to submit
        const inputs = document.querySelectorAll('#license-key-input, #license-email-input');
        inputs.forEach(function(el) {
            el.addEventListener('keyup', function(e) {
                if (e.key === 'Enter') {
                    document.getElementById('activate-license-btn').click();
                }
            });
        });
    }

    function showError(errBadge, okBadge, msg) {
        if (okBadge) okBadge.style.display = 'none';
        if (errBadge) { errBadge.textContent = '✗ ' + msg; errBadge.style.display = 'flex'; }
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLicenseGate);
    } else {
        initLicenseGate();
    }

    // Add shake animation CSS
    const style = document.createElement('style');
    style.textContent = '@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}';
    document.head.appendChild(style);
})();
