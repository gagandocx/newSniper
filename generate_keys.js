#!/usr/bin/env node
/**
 * CoderSnap — License Key Generator
 * 
 * Usage:
 *   node generate_keys.js              → Generate 1 key
 *   node generate_keys.js 5            → Generate 5 keys
 *   node generate_keys.js 10 --hashes  → Generate 10 keys + their hashes (for embedding)
 * 
 * Keys use algorithmic validation (CS prefix + checksum).
 * No need to embed hashes — the extension validates keys mathematically.
 * 
 * Format: CSXXX-XXXXX-XXXXX-XXXCC (starts with CS, ends with checksum)
 */

const crypto = require('crypto');

const LICENSE_SALT = 'CS2026-GAGAN-ULTRA-SECRET-SALT-X9K2';
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomChars(length) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += CHARSET[crypto.randomInt(0, CHARSET.length)];
    }
    return result;
}

function computeChecksum(payload) {
    // Sum of char codes * position, mod 676, converted to 2-char base36 uppercase
    let sum = 0;
    for (let i = 0; i < payload.length; i++) {
        sum = (sum + payload.charCodeAt(i) * (i + 1)) & 0xFFFF;
    }
    return ((sum % 676) + 10).toString(36).toUpperCase().padStart(2, '0');
}

function generateKey() {
    // Format: CS + 16 random chars + 2 checksum chars = 20 total
    const prefix = 'CS';
    const random = randomChars(16);
    const payload = prefix + random; // 18 chars
    const checksum = computeChecksum(payload);
    const full = payload + checksum; // 20 chars
    
    // Format with dashes: XXXXX-XXXXX-XXXXX-XXXXX
    return full.match(/.{1,5}/g).join('-');
}

function sha256(message) {
    return crypto.createHash('sha256').update(message).digest('hex');
}

// ── Main ──
const count = parseInt(process.argv[2]) || 1;
const showHashes = process.argv.includes('--hashes');

console.log('');
console.log('═══════════════════════════════════════════');
console.log('  CoderSnap — License Key Generator');
console.log('═══════════════════════════════════════════');
console.log('');

const keys = [];
for (let i = 0; i < count; i++) {
    const key = generateKey();
    const normalized = key.replace(/-/g, '');
    const hash = sha256(normalized + LICENSE_SALT);
    keys.push({ key, hash });
}

console.log('Generated Keys:');
console.log('─────────────────────────────────────────');
keys.forEach((k, i) => {
    console.log(`  ${i + 1}. ${k.key}`);
});

if (showHashes) {
    console.log('');
    console.log('Hashes (for VALID_KEY_HASHES in license.js):');
    console.log('─────────────────────────────────────────');
    keys.forEach((k, i) => {
        console.log(`  '${k.hash}',`);
    });
}

console.log('');
console.log('─────────────────────────────────────────');
console.log(`  Total: ${count} key(s) generated`);
console.log('  Validation: Algorithmic (no hash embedding needed)');
console.log('  Keys start with CS and have built-in checksum.');
console.log('═══════════════════════════════════════════');
console.log('');
