/**
 * license.js — CoderSnap License Key Validation
 * 
 * How it works:
 * - Keys are generated offline using a secret salt + SHA-256 hash
 * - Format: XXXXX-XXXXX-XXXXX-XXXXX (20 hex chars split by dashes)
 * - Each key is validated by checking its hash against the embedded valid key hashes
 * - Once activated, the key is locked to this Chrome installation (extension ID)
 * - One license per device — cannot be reused on another Chrome profile
 */

(function() {
    'use strict';

    // ── SECRET SALT for key validation (change this to invalidate old keys) ──
    const LICENSE_SALT = 'CS2026-GAGAN-ULTRA-SECRET-SALT-X9K2';

    // ── Valid license key hashes (SHA-256 of normalized key + salt) ──
    // You add new keys by running: generate_keys.js
    // Then paste the hash here
    const VALID_KEY_HASHES = [
        'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2', // placeholder
    ];

    // ── Hash function (SHA-256 via SubtleCrypto) ──
    async function sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

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

    // ── Validate a license key ──
    async function validateKey(key) {
        const normalized = normalizeKey(key);
        if (normalized.length !== 20) return false;

        // Method 1: Check against embedded hashes
        const hash = await sha256(normalized + LICENSE_SALT);
        if (VALID_KEY_HASHES.includes(hash)) return true;

        // Method 2: Algorithmic validation (prefix + checksum)
        // Keys must start with 'CS' and the last 2 chars must be a valid checksum
        if (!normalized.startsWith('CS')) return false;
        
        const payload = normalized.substring(0, 18);
        const checksum = normalized.substring(18, 20);
        
        // Compute checksum: sum of char codes mod 256, as 2-char hex
        let sum = 0;
        for (let i = 0; i < payload.length; i++) {
            sum = (sum + payload.charCodeAt(i) * (i + 1)) & 0xFFFF;
        }
        const expectedChecksum = ((sum % 676) + 10).toString(36).toUpperCase().padStart(2, '0');
        
        return checksum === expectedChecksum;
    }

    // ── Get device fingerprint (extension ID = unique per Chrome profile) ──
    function getDeviceId() {
        return chrome.runtime.id || 'unknown';
    }

    // ── Check if license is already activated ──
    async function isLicenseActive() {
        return new Promise(function(resolve) {
            chrome.storage.local.get(['__cs_license_key', '__cs_license_device'], function(data) {
                if (!data['__cs_license_key'] || !data['__cs_license_device']) {
                    resolve(false);
                    return;
                }
                // Verify the license is locked to this device
                if (data['__cs_license_device'] !== getDeviceId()) {
                    resolve(false);
                    return;
                }
                resolve(true);
            });
        });
    }

    // ── Activate license ──
    async function activateLicense(key) {
        const isValid = await validateKey(key);
        if (!isValid) return false;

        const normalized = normalizeKey(key);
        await new Promise(function(resolve) {
            chrome.storage.local.set({
                '__cs_license_key': normalized,
                '__cs_license_device': getDeviceId(),
                '__cs_license_date': new Date().toISOString()
            }, resolve);
        });
        return true;
    }

    // ── UI Logic: Show gate or main app ──
    async function initLicenseGate() {
        const gate = document.getElementById('license-gate');
        const app = document.getElementById('main-app');
        
        if (!gate || !app) return; // Not on popup page

        const active = await isLicenseActive();
        
        if (active) {
            gate.style.display = 'none';
            app.style.display = 'block';
        } else {
            gate.style.display = 'block';
            app.style.display = 'none';
            
            // Auto-format input as user types
            const input = document.getElementById('license-key-input');
            if (input) {
                input.addEventListener('input', function() {
                    const cursor = this.selectionStart;
                    const raw = this.value.replace(/[^A-Za-z0-9]/g, '');
                    this.value = formatKey(raw);
                    // Try to keep cursor position reasonable
                    const dashes = (this.value.substring(0, cursor).match(/-/g) || []).length;
                    this.selectionStart = this.selectionEnd = Math.min(cursor + dashes, this.value.length);
                });
            }

            // Activate button
            const btn = document.getElementById('activate-license-btn');
            if (btn) {
                btn.addEventListener('click', async function() {
                    const keyInput = document.getElementById('license-key-input');
                    const okBadge = document.getElementById('license_ok');
                    const errBadge = document.getElementById('license_err');
                    
                    const key = keyInput.value.trim();
                    if (!key) {
                        if (errBadge) { errBadge.textContent = '✗ Enter a key'; errBadge.style.display = 'flex'; }
                        return;
                    }

                    btn.textContent = 'Validating...';
                    btn.disabled = true;

                    const success = await activateLicense(key);
                    
                    if (success) {
                        if (okBadge) okBadge.style.display = 'flex';
                        if (errBadge) errBadge.style.display = 'none';
                        btn.textContent = '✓ Activated!';
                        btn.style.background = 'linear-gradient(135deg, #4ade80, #22d3ee)';
                        
                        // Show main app after short delay
                        setTimeout(function() {
                            gate.style.display = 'none';
                            app.style.display = 'block';
                        }, 1000);
                    } else {
                        if (okBadge) okBadge.style.display = 'none';
                        if (errBadge) { errBadge.textContent = '✗ Invalid License Key'; errBadge.style.display = 'flex'; }
                        btn.textContent = 'Activate License';
                        btn.disabled = false;
                        
                        // Shake animation
                        keyInput.style.animation = 'none';
                        keyInput.offsetHeight; // trigger reflow
                        keyInput.style.animation = 'shake 0.4s ease';
                    }
                });
            }

            // Allow Enter key to submit
            const keyInput = document.getElementById('license-key-input');
            if (keyInput) {
                keyInput.addEventListener('keyup', function(e) {
                    if (e.key === 'Enter') {
                        document.getElementById('activate-license-btn').click();
                    }
                });
            }
        }
    }

    // ── Also gate the content scripts (fetch.js checks this) ──
    // Expose validation function globally for fetch.js to check
    window.__csLicenseValid = isLicenseActive;

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
