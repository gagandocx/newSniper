#!/usr/bin/env node
/**
 * Generate the CoderSnap brush circle logo programmatically.
 * Creates icon16.png, icon48.png, icon128.png, and images/logo.png
 * 
 * The logo is a circular brush stroke with gradient: blue → teal → green → yellow
 * on a transparent background.
 */

const path = require('path');
const fs = require('fs');
const pw = require('/root/.nvm/versions/node/v22.23.1/lib/node_modules/@playwright/mcp/node_modules/playwright');

const OUT_DIR = path.join(__dirname, 'extension');

const SIZES = [
    { name: 'icon16.png', size: 16 },
    { name: 'icon48.png', size: 48 },
    { name: 'icon128.png', size: 128 },
    { name: 'images/logo.png', size: 256 },
];

(async () => {
    const browser = await pw.chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();

    // First generate a high-res version (512x512), then resize for each icon
    const hiResBase64 = await page.evaluate(() => {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const cx = size / 2;
        const cy = size / 2;
        const outerR = size * 0.44;
        const innerR = size * 0.28;
        const strokeWidth = outerR - innerR;

        // Draw the circular brush stroke with color gradient
        // Colors: deep blue → blue → cyan/teal → green → yellow-green → golden yellow
        const segments = 72;
        const startAngle = -Math.PI * 0.15; // Start slightly before top-right
        const endAngle = startAngle + Math.PI * 1.92; // Almost full circle with gap

        for (let i = 0; i < segments; i++) {
            const t = i / segments;
            const t2 = (i + 1.5) / segments;
            const angle1 = startAngle + t * (endAngle - startAngle);
            const angle2 = startAngle + t2 * (endAngle - startAngle);

            // Color gradient: blue(0) → cyan(0.25) → green(0.5) → yellow(0.75) → gold(1.0)
            let r, g, b;
            if (t < 0.2) {
                // Deep blue to blue
                const p = t / 0.2;
                r = Math.round(30 + p * 20);
                g = Math.round(40 + p * 80);
                b = Math.round(180 + p * 60);
            } else if (t < 0.4) {
                // Blue to cyan/teal
                const p = (t - 0.2) / 0.2;
                r = Math.round(50 - p * 30);
                g = Math.round(120 + p * 80);
                b = Math.round(240 - p * 60);
            } else if (t < 0.6) {
                // Teal to green
                const p = (t - 0.4) / 0.2;
                r = Math.round(20 + p * 60);
                g = Math.round(200 - p * 20);
                b = Math.round(180 - p * 120);
            } else if (t < 0.8) {
                // Green to yellow-green
                const p = (t - 0.6) / 0.2;
                r = Math.round(80 + p * 100);
                g = Math.round(180 - p * 10);
                b = Math.round(60 - p * 40);
            } else {
                // Yellow-green to golden
                const p = (t - 0.8) / 0.2;
                r = Math.round(180 + p * 40);
                g = Math.round(170 - p * 20);
                b = Math.round(20 + p * 10);
            }

            // Vary the stroke width for brush effect
            const widthVariation = 1 + 0.2 * Math.sin(t * Math.PI * 6) + 0.1 * Math.sin(t * Math.PI * 13);
            const currentStroke = strokeWidth * widthVariation;

            // Add some edge roughness for painterly feel
            const midR = (outerR + innerR) / 2;
            const jitterOuter = 2 * Math.sin(i * 7.3) + 1.5 * Math.cos(i * 11.1);
            const jitterInner = 2 * Math.sin(i * 5.7) + 1.5 * Math.cos(i * 9.3);

            ctx.beginPath();
            ctx.arc(cx, cy, midR + currentStroke / 2 + jitterOuter, angle1, angle2);
            ctx.arc(cx, cy, midR - currentStroke / 2 + jitterInner, angle2, angle1, true);
            ctx.closePath();

            // Slight alpha variation for depth
            const alpha = 0.85 + 0.15 * Math.sin(t * Math.PI * 4);
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.fill();
        }

        // Add some paint splatter/brush texture effect
        for (let i = 0; i < 200; i++) {
            const t = Math.random();
            const angle = startAngle + t * (endAngle - startAngle);
            const midR2 = (outerR + innerR) / 2;
            const radiusOffset = (Math.random() - 0.5) * strokeWidth * 1.3;
            const x = cx + Math.cos(angle) * (midR2 + radiusOffset);
            const y = cy + Math.sin(angle) * (midR2 + radiusOffset);

            // Match the color at this position
            let r2, g2, b2;
            if (t < 0.2) {
                r2 = 40; g2 = 80; b2 = 220;
            } else if (t < 0.4) {
                r2 = 30; g2 = 160; b2 = 200;
            } else if (t < 0.6) {
                r2 = 50; g2 = 180; b2 = 80;
            } else if (t < 0.8) {
                r2 = 140; g2 = 175; b2 = 40;
            } else {
                r2 = 200; g2 = 160; b2 = 25;
            }

            ctx.beginPath();
            ctx.arc(x, y, 1 + Math.random() * 2.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r2},${g2},${b2},${0.3 + Math.random() * 0.4})`;
            ctx.fill();
        }

        // Add highlight streaks for that painted/glossy look
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < segments; i += 3) {
            const t = i / segments;
            const angle = startAngle + t * (endAngle - startAngle);
            const midR3 = (outerR + innerR) / 2;
            const x = cx + Math.cos(angle) * midR3;
            const y = cy + Math.sin(angle) * midR3;

            const grad = ctx.createRadialGradient(x, y, 0, x, y, strokeWidth * 0.3);
            grad.addColorStop(0, 'rgba(255,255,255,0.12)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(x - strokeWidth * 0.3, y - strokeWidth * 0.3, strokeWidth * 0.6, strokeWidth * 0.6);
        }
        ctx.globalCompositeOperation = 'source-over';

        return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
    });

    // Save hi-res version temporarily
    const hiResBuffer = Buffer.from(hiResBase64, 'base64');

    // Now resize for each target size
    for (const { name, size } of SIZES) {
        const outPath = path.join(OUT_DIR, name);
        const outDir = path.dirname(outPath);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const resizedBase64 = await page.evaluate(async ({ imgBase64, size }) => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = 'data:image/png;base64,' + imgBase64;
            });

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, size, size);

            return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
        }, { imgBase64: hiResBase64, size });

        fs.writeFileSync(outPath, Buffer.from(resizedBase64, 'base64'));
        const fileSize = fs.statSync(outPath).size;
        console.log(`  Generated: ${name} (${size}x${size}, ${(fileSize / 1024).toFixed(1)}KB)`);
    }

    await browser.close();
    console.log('\nDone! All icons generated.');
})();
