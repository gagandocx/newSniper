#!/usr/bin/env node
/**
 * build_crx.js — CoderSnap Extension Build Script
 * 
 * Obfuscates all JS files and packages the extension as a signed .crx file.
 * NO external dependencies required — uses only Node.js built-in modules.
 * 
 * Usage:
 *   node build_crx.js
 * 
 * Output:
 *   dist/               — Obfuscated extension folder (can be loaded as unpacked)
 *   CoderSnap.crx       — Signed .crx file for distribution
 *   codersnap.pem       — Private signing key (KEEP SECRET — don't share!)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════
const SRC_DIR = path.join(__dirname, 'extension');
const DIST_DIR = path.join(__dirname, 'dist');
const CRX_OUTPUT = path.join(__dirname, 'CoderSnap.crx');
const PEM_FILE = path.join(__dirname, 'codersnap.pem');
const ZIP_FILE = path.join(__dirname, 'dist.zip');

// JS files to obfuscate (these contain your logic)
const JS_TO_OBFUSCATE = [
    'background.js',
    'fetch.js',
    'auth.js',
    'content.js',
    'license.js',
    'notif_block.js',
    'Createapp.js'
];

// JS files to COPY AS-IS (third-party libraries — obfuscating them breaks things)
const JS_COPY_ONLY = [
    'sweetalert.js',
    'bootstrap.min.js'
];

// ══════════════════════════════════════════════════════════════════
// OBFUSCATOR — Pure JS, no dependencies
// ══════════════════════════════════════════════════════════════════

class Obfuscator {
    constructor() {
        this.stringMap = new Map();
        this.stringCounter = 0;
        this.varCounter = 0;
    }

    /**
     * Generate a random variable name
     */
    randomVar() {
        const prefixes = ['_0x', '_$', '__'];
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        return prefix + (this.varCounter++).toString(36) + crypto.randomBytes(2).toString('hex');
    }

    /**
     * Encode a string to hex escape sequences
     */
    encodeString(str) {
        return str.split('').map(ch => {
            const code = ch.charCodeAt(0);
            if (code > 127 || Math.random() > 0.5) {
                return '\\x' + code.toString(16).padStart(2, '0');
            }
            return ch;
        }).join('');
    }

    /**
     * Extract strings and replace with array lookups
     * ONLY replaces strings in safe positions (assignments, arguments, comparisons)
     * Does NOT replace strings used as object property keys
     */
    extractStrings(code) {
        const strings = [];
        const arrayName = '_0xSTR' + crypto.randomBytes(2).toString('hex');
        
        // Find all string literals (single and double quoted)
        const stringRegex = /(?<!\\)(['"])((?:(?!\1|\\).|\\.)*)\1/g;
        let match;
        const replacements = [];
        
        while ((match = stringRegex.exec(code)) !== null) {
            const fullMatch = match[0];
            const content = match[2];
            
            // Skip very short strings (1-2 chars)
            if (content.length < 3) continue;
            // Skip strings inside comments
            if (this.isInComment(code, match.index)) continue;
            
            // Skip strings that are object KEYS (followed by : but not ::)
            const afterStr = code.substring(match.index + fullMatch.length).trimStart();
            if (afterStr.startsWith(':') && !afterStr.startsWith('::')) {
                // Check if this looks like an object key (not a ternary)
                // Object key: { 'key': value } or { key: value }
                // We skip these to avoid syntax errors
                continue;
            }
            
            // Skip strings inside property access brackets that are keys
            // e.g., obj['key'] — these are fine to replace since they're in []
            
            let idx = strings.indexOf(content);
            if (idx === -1) {
                idx = strings.length;
                strings.push(content);
            }
            replacements.push({
                start: match.index,
                end: match.index + fullMatch.length,
                replacement: arrayName + '[' + idx + ']'
            });
        }
        
        // Apply replacements in reverse order to maintain indices
        let result = code;
        replacements.reverse().forEach(r => {
            result = result.substring(0, r.start) + r.replacement + result.substring(r.end);
        });
        
        if (strings.length > 0) {
            // Create the string array with hex-encoded values
            const encodedStrings = strings.map(s => "'" + this.encodeString(s) + "'");
            const header = 'var ' + arrayName + '=[' + encodedStrings.join(',') + '];\n';
            result = header + result;
        }
        
        return result;
    }

    /**
     * Check if position is inside a comment
     */
    isInComment(code, pos) {
        // Simple check — look for // before position on same line
        const lineStart = code.lastIndexOf('\n', pos) + 1;
        const lineContent = code.substring(lineStart, pos);
        if (lineContent.includes('//')) return true;
        
        // Check for block comment
        const lastOpen = code.lastIndexOf('/*', pos);
        if (lastOpen !== -1) {
            const lastClose = code.lastIndexOf('*/', pos);
            if (lastClose < lastOpen) return true;
        }
        return false;
    }

    /**
     * Add dead code blocks
     */
    addDeadCode(code) {
        const deadSnippets = [
            'if(false){console.log(Math.random());}',
            'if(typeof undefined!=="undefined"){void 0;}',
            'var _dead' + crypto.randomBytes(2).toString('hex') + '=function(){return void 0;};',
            'try{if(null===undefined){throw new Error();}}catch(_e){}',
        ];
        
        // Insert dead code after semicolons in random positions
        const lines = code.split('\n');
        const newLines = [];
        for (let i = 0; i < lines.length; i++) {
            newLines.push(lines[i]);
            if (Math.random() < 0.03 && lines[i].trim().endsWith(';')) {
                const snippet = deadSnippets[Math.floor(Math.random() * deadSnippets.length)];
                newLines.push(snippet);
            }
        }
        return newLines.join('\n');
    }

    /**
     * Minify — remove comments, collapse whitespace
     */
    minify(code) {
        // Remove single-line comments (but not URLs with //)
        let result = code.replace(/(?<!:)\/\/(?![\/:]).*$/gm, '');
        // Remove multi-line comments
        result = result.replace(/\/\*[\s\S]*?\*\//g, '');
        // Collapse multiple newlines
        result = result.replace(/\n\s*\n\s*\n/g, '\n');
        // Remove leading whitespace from lines (but keep necessary indentation for readability issues)
        result = result.replace(/^\s+/gm, '');
        // Remove trailing whitespace
        result = result.replace(/\s+$/gm, '');
        // Remove empty lines
        result = result.replace(/^\s*$/gm, '').replace(/\n+/g, '\n');
        return result;
    }

    /**
     * Rename local variables (conservative — only var/let/const declarations)
     */
    renameLocals(code) {
        // Find function-scoped variable declarations and rename them
        // This is conservative to avoid breaking things
        const localVars = new Set();
        const declRegex = /\b(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        let match;
        
        while ((match = declRegex.exec(code)) !== null) {
            const varName = match[1];
            // Don't rename short names (already minified), known globals, or Chrome APIs
            if (varName.length <= 2) continue;
            if (['chrome', 'window', 'document', 'console', 'fetch', 'Promise', 'setTimeout', 
                 'setInterval', 'clearTimeout', 'clearInterval', 'JSON', 'Math', 'Array',
                 'Object', 'String', 'Number', 'Boolean', 'Error', 'RegExp', 'Date',
                 'undefined', 'null', 'true', 'false', 'function', 'return', 'async', 'await',
                 'resolve', 'reject', 'response', 'result', 'data', 'err', 'error'].includes(varName)) continue;
            localVars.add(varName);
        }
        
        let result = code;
        const renameMap = {};
        let counter = 0;
        
        for (const varName of localVars) {
            // Only rename if it appears more than once (likely a real local)
            const occurrences = (result.match(new RegExp('\\b' + varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g')) || []).length;
            if (occurrences < 2) continue;
            
            const newName = '_' + (counter++).toString(36);
            // Use word boundary replacement
            try {
                result = result.replace(new RegExp('\\b' + varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), newName);
            } catch(e) {
                // Skip if regex fails
            }
        }
        
        return result;
    }

    /**
     * Main obfuscation pipeline
     */
    obfuscate(code, filename) {
        console.log(`  Obfuscating: ${filename}`);
        
        let result = code;
        
        // Step 1: Minify (remove comments, whitespace)
        result = this.minify(result);
        
        // Step 2: Add dead code
        result = this.addDeadCode(result);
        
        // Step 3: Rename local variables
        result = this.renameLocals(result);
        
        // Step 4: Extract strings to array
        result = this.extractStrings(result);
        
        // Step 5: Add wrapper IIFE to prevent global scope leakage
        // (Don't wrap background.js or content scripts that need top-level access)
        
        // Step 6: Final minify pass
        result = this.minify(result);
        
        // Add header comment to deter casual readers
        const header = '// CoderSnap v' + getVersion() + ' — Proprietary. Unauthorized copying prohibited.\n';
        result = header + result;
        
        return result;
    }
}

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

function getVersion() {
    const manifest = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'manifest.json'), 'utf8'));
    return manifest.version;
}

function copyRecursive(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            copyRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function cleanDir(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
}

// ══════════════════════════════════════════════════════════════════
// CRX PACKAGING (CRX3 format)
// ══════════════════════════════════════════════════════════════════

function generateKey() {
    if (fs.existsSync(PEM_FILE)) {
        console.log('  Using existing signing key: codersnap.pem');
        return fs.readFileSync(PEM_FILE, 'utf8');
    }
    
    console.log('  Generating new RSA signing key...');
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    
    fs.writeFileSync(PEM_FILE, privateKey);
    console.log('  Saved key to: codersnap.pem (KEEP SECRET!)');
    return privateKey;
}

function buildCRX3(zipBuffer, privateKeyPem) {
    // CRX3 format: https://chromium.googlesource.com/chromium/src/+/main/components/crx_file/crx3.proto
    // Header: Cr24 + version(3) + header_size + header_proto + zip
    
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const publicKeyDer = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    
    // Sign the zip content
    // CRX3 signs: "CRX3 SignedData\x00" + length of signed_data + signed_data + zip
    // signed_data contains the crx_id (SHA-256 of public key, first 16 bytes)
    
    const crxId = crypto.createHash('sha256').update(publicKeyDer).digest().slice(0, 16);
    
    // Build the SignedData protobuf (field 1 = crx_id, bytes)
    const signedDataPayload = Buffer.concat([
        Buffer.from([0x0a, crxId.length]), // field 1, length-delimited
        crxId
    ]);
    
    // Build data to sign: "CRX3 SignedData\x00" + uint32le(signedData.length) + signedData + zip
    const prefix = Buffer.from('CRX3 SignedData\x00', 'ascii');
    const signedDataLen = Buffer.alloc(4);
    signedDataLen.writeUInt32LE(signedDataPayload.length);
    
    const dataToSign = Buffer.concat([prefix, signedDataLen, signedDataPayload, zipBuffer]);
    
    // Create SHA-256 RSA signature
    const sign = crypto.createSign('SHA256');
    sign.update(dataToSign);
    const signature = sign.sign(privateKey);
    
    // Build AsymmetricKeyProof protobuf
    // field 1 (public_key) = bytes, field 2 (signature) = bytes
    const pubKeyField = Buffer.concat([
        Buffer.from([0x0a]), // field 1, wire type 2 (length-delimited)
        encodeVarint(publicKeyDer.length),
        publicKeyDer
    ]);
    const sigField = Buffer.concat([
        Buffer.from([0x12]), // field 2, wire type 2
        encodeVarint(signature.length),
        signature
    ]);
    const asymKeyProof = Buffer.concat([pubKeyField, sigField]);
    
    // Build CrxFileHeader protobuf
    // field 2 (sha256_with_rsa) = repeated AsymmetricKeyProof
    // field 10000 (signed_header_data) = bytes (SignedData)
    const sha256RsaField = Buffer.concat([
        Buffer.from([0x12]), // field 2, wire type 2
        encodeVarint(asymKeyProof.length),
        asymKeyProof
    ]);
    
    // field 10000 encoded: field number 10000 = 10000 << 3 | 2 = 80002 (varint)
    const signedHeaderField = Buffer.concat([
        encodeVarint((10000 << 3) | 2),
        encodeVarint(signedDataPayload.length),
        signedDataPayload
    ]);
    
    const headerProto = Buffer.concat([sha256RsaField, signedHeaderField]);
    
    // Final CRX3 binary
    const magic = Buffer.from('Cr24', 'ascii');
    const version = Buffer.alloc(4);
    version.writeUInt32LE(3);
    const headerSize = Buffer.alloc(4);
    headerSize.writeUInt32LE(headerProto.length);
    
    return Buffer.concat([magic, version, headerSize, headerProto, zipBuffer]);
}

function encodeVarint(value) {
    const bytes = [];
    while (value > 0x7f) {
        bytes.push((value & 0x7f) | 0x80);
        value >>>= 7;
    }
    bytes.push(value & 0x7f);
    return Buffer.from(bytes);
}

// ══════════════════════════════════════════════════════════════════
// MAIN BUILD
// ══════════════════════════════════════════════════════════════════

function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  CoderSnap Extension Builder');
    console.log('  Version: ' + getVersion());
    console.log('═══════════════════════════════════════════════════\n');
    
    // Step 1: Clean dist directory
    console.log('[1/4] Preparing dist directory...');
    cleanDir(DIST_DIR);
    
    // Step 2: Copy all files first
    console.log('[2/4] Copying extension files...');
    copyRecursive(SRC_DIR, DIST_DIR);
    
    // Step 3: Obfuscate JS files
    console.log('[3/4] Obfuscating JavaScript...');
    const obfuscator = new Obfuscator();
    
    for (const jsFile of JS_TO_OBFUSCATE) {
        const filePath = path.join(DIST_DIR, jsFile);
        if (fs.existsSync(filePath)) {
            const code = fs.readFileSync(filePath, 'utf8');
            const obfuscated = obfuscator.obfuscate(code, jsFile);
            fs.writeFileSync(filePath, obfuscated);
            
            const ratio = ((obfuscated.length / code.length) * 100).toFixed(0);
            console.log(`    ${jsFile}: ${code.length} → ${obfuscated.length} bytes (${ratio}%)`);
        } else {
            console.log(`    ${jsFile}: NOT FOUND — skipping`);
        }
    }
    
    // Remove _metadata folder (Chrome generates its own)
    const metaDir = path.join(DIST_DIR, '_metadata');
    if (fs.existsSync(metaDir)) {
        fs.rmSync(metaDir, { recursive: true });
        console.log('  Removed _metadata/ (Chrome regenerates this)');
    }
    
    // Step 4: Package as CRX
    console.log('[4/4] Packaging as .crx...');
    
    // Create zip of dist/
    if (fs.existsSync(ZIP_FILE)) fs.unlinkSync(ZIP_FILE);
    execSync(`cd "${DIST_DIR}" && zip -r -9 "${ZIP_FILE}" . -x ".*"`, { stdio: 'pipe' });
    
    const zipBuffer = fs.readFileSync(ZIP_FILE);
    console.log(`  ZIP size: ${(zipBuffer.length / 1024).toFixed(1)} KB`);
    
    // Generate or load signing key
    const privateKeyPem = generateKey();
    
    // Build CRX3
    const crxBuffer = buildCRX3(zipBuffer, privateKeyPem);
    fs.writeFileSync(CRX_OUTPUT, crxBuffer);
    console.log(`  CRX size: ${(crxBuffer.length / 1024).toFixed(1)} KB`);
    
    // Cleanup
    fs.unlinkSync(ZIP_FILE);
    
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  BUILD COMPLETE!');
    console.log('═══════════════════════════════════════════════════');
    console.log(`\n  Output files:`);
    console.log(`    dist/          — Obfuscated extension (load as unpacked)`);
    console.log(`    CoderSnap.crx  — Signed package for distribution`);
    console.log(`    codersnap.pem  — Signing key (KEEP SECRET!)\n`);
    console.log(`  Distribution:`);
    console.log(`    Send CoderSnap.crx to users.`);
    console.log(`    They drag it into chrome://extensions with Dev Mode ON.\n`);
}

main();
