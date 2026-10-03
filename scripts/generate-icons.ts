/**
 * Render public/icon.svg to the PNG sizes the web app manifest needs, using the
 * Playwright Chromium already installed for e2e tests (no image library needed).
 *
 *   npx tsx scripts/generate-icons.ts   (or: node --experimental-strip-types …)
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch();
try {
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<html><body style="margin:0;background:#1f4f8a">${svg.replace('<svg', `<svg width="${size}" height="${size}"`)}</body></html>`,
    );
    await page.screenshot({ path: `public/icon-${size}.png`, omitBackground: false });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('Wrote public/icon-192.png and public/icon-512.png');
