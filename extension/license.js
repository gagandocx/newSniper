/**
 * license.js — CoderSnap License Key + Email Binding
 * 
 * How it works:
 * - User enters a license key + their Amazon email
 * - Key is validated algorithmically (CS prefix + checksum)
 * - Key gets permanently bound to that email address
 * - If the extension detects a DIFFERENT email being used, it blocks scanning
 * - One key = one Amazon account forever
 */

(function() {
    'use strict';

    // ── Normalize key format ──
    function normalizeKey(key) {
        return key.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    // ── Format key with dashes ──
    function formatKey(raw) {
        const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const parts = [];
        for (let i = 0; i < clean.length; i += 5) {
            parts.push(clean.substring(i, i + 5));
        }
        return parts.join('-');
    }

    // ── Validate a license key algorithmically ──
    function validateKeySync(key) {
        const normalized = normalizeKey(key);
        if (normalized.length !== 20) return false;
        if (!normalized.startsWith('CS')) return false;
        
        const payload = normalized.substring(0, 18);
        const checksum = normalized.substring(18, 20);
        
        let sum = 0;
        for (let i = 0; i < payload.length; i++) {
            sum = (sum + payload.charCodeAt(i) * (i + 1)) & 0xFFFF;
        }
        const expected = ((sum % 676) + 10).toString(36).toUpperCase().padStart(2, '0');
        
        return checksum === expected;
    }

    // ── Check if license is already activated (with email) ──
    async function getLicenseData() {
        return new Promise(function(resolve) {
            chrome.storage.local.get(['__cs_license_key', '__cs_license_email', '__cs_license_date'], function(data) {
                resolve(data);
            });
        });
    }

    // ── Check if license is active and bound to an email ──
    async function isLicenseActive() {
        const data = await getLicenseData();
        if (!data['__cs_license_key'] || !data['__cs_license_email']) {
            return false;
        }
        // Re-validate the key
        return validateKeySync(data['__cs_license_key']);
    }

    // ── Get the licensed email ──
    async function getLicensedEmail() {
        const data = await getLicenseData();
        return data['__cs_license_email'] || null;
    }

    // ── Activate license with email binding ──
    async function activateLicense(key, email) {
        if (!validateKeySync(key)) return { success: false, error: 'Invalid license key' };
        if (!email || !email.includes('@')) return { success: false, error: 'Enter a valid email' };

        const normalized = normalizeKey(key);
        const normalizedEmail = email.trim().toLowerCase();

        await new Promise(function(resolve) {
            chrome.storage.local.set({
                '__cs_license_key': normalized,
                '__cs_license_email': normalizedEmail,
                '__cs_license_date': new Date().toISOString()
            }, resolve);
        });
        return { success: true };
    }

    // ── UI Logic: Show gate or main app ──
    async function initLicenseGate() {
        const gate = document.getElementById('license-gate');
        const app = document.getElementById('main-app');
        
        if (!gate || !app) return;

        const active = await isLicenseActive();
        
        if (active) {
            gate.style.display = 'none';
            app.style.display = 'block';
        } else {
            gate.style.display = 'block';
            app.style.display = 'none';
            
            // Auto-format key input as user types
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
                    const keyEl = document.getElementById('license-key-input');
                    const emailEl = document.getElementById('license-email-input');
                    const okBadge = document.getElementById('license_ok');
                    const errBadge = document.getElementById('license_err');
                    
                    const key = (keyEl ? keyEl.value.trim() : '');
                    const email = (emailEl ? emailEl.value.trim() : '');

                    if (!key) {
                        showError(errBadge, okBadge, 'Enter your license key');
                        return;
                    }
                    if (!email || !email.includes('@')) {
                        showError(errBadge, okBadge, 'Enter your Amazon email');
                        return;
                    }

                    btn.textContent = 'Validating...';
                    btn.disabled = true;

                    const result = await activateLicense(key, email);
                    
                    if (result.success) {
                        if (okBadge) okBadge.style.display = 'flex';
                        if (errBadge) errBadge.style.display = 'none';
                        btn.textContent = '✓ Activated!';
                        btn.style.background = 'linear-gradient(135deg, #4ade80, #22d3ee)';
                        
                        // Also store the email as the Amazon account email
                        chrome.storage.local.set({ '__un': email.trim().toLowerCase() });

                        setTimeout(function() {
                            gate.style.display = 'none';
                            app.style.display = 'block';
                        }, 1000);
                    } else {
                        showError(errBadge, okBadge, result.error || 'Invalid License Key');
                        btn.textContent = 'Activate License';
                        btn.disabled = false;
                        
                        // Shake animation
                        if (keyEl) {
                            keyEl.style.animation = 'none';
                            keyEl.offsetHeight;
                            keyEl.style.animation = 'shake 0.4s ease';
                        }
                    }
                });
            }

            // Allow Enter key to submit
            const inputs = document.querySelectorAll('#license-key-input, #license-email-input');
            inputs.forEach(function(el) {
                el.addEventListener('keyup', function(e) {
                    if (e.key === 'Enter') {
                        document.getElementById('activate-license-btn').click();
                    }
                });
            });
        }
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
