#!/usr/bin/env node
/**
 * Generate resized icon PNGs from a source image using Playwright headless browser.
 * 
 * Usage: node generate_icons.js <source_image_path>
 * 
 * Generates: icon16.png, icon48.png, icon128.png, images/logo.png
 */

const path = require('path');
const fs = require('fs');
const pw = require('/root/.nvm/versions/node/v22.23.1/lib/node_modules/@playwright/mcp/node_modules/playwright');

const SOURCE = process.argv[2] || path.join(__dirname, 'source_logo.png');
const OUT_DIR = path.join(__dirname, 'extension');

const SIZES = [
    { name: 'icon16.png', size: 16 },
    { name: 'icon48.png', size: 48 },
    { name: 'icon128.png', size: 128 },
    { name: 'images/logo.png', size: 256 },
];

(async () => {
    if (!fs.existsSync(SOURCE)) {
        console.error('Source image not found:', SOURCE);
        process.exit(1);
    }

    const imgBase64 = fs.readFileSync(SOURCE).toString('base64');
    const dataUrl = 'data:image/png;base64,' + imgBase64;

    const browser = await pw.chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();

    for (const { name, size } of SIZES) {
        const outPath = path.join(OUT_DIR, name);
        const outDir = path.dirname(outPath);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        // Create a page with a canvas, draw the image resized, export as PNG
        const pngBase64 = await page.evaluate(async ({ dataUrl, size }) => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = dataUrl;
            });

            // Draw with high quality scaling
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, size, size);

            // Return as base64 PNG (strip data:image/png;base64, prefix)
            return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
        }, { dataUrl, size });

        fs.writeFileSync(outPath, Buffer.from(pngBase64, 'base64'));
        console.log(`  Generated: ${name} (${size}x${size})`);
    }

    await browser.close();
    console.log('\nDone! Icons generated in extension/');
})();
