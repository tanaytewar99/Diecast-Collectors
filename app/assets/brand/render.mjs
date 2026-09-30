// Renders the brand mark into the PNG assets Expo needs.
// Run: NODE_PATH=$(npm root -g) node assets/brand/render.mjs   (needs Playwright + Chromium)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const mark = readFileSync(path.join(here, 'mark.svg'), 'utf8').replace('<svg ', '<svg width="100%" height="100%" ');
const RED = '#E10600';

const targets = [
  // [file, size, background, markScale, rounded]
  ['icon.png', 1024, RED, 1, false],
  ['favicon.png', 48, RED, 1.1, true],
  ['splash-icon.png', 1024, RED, 1, true],
  ['android-icon-foreground.png', 1024, 'transparent', 0.66, false],
  ['android-icon-background.png', 1024, RED, 0, false],
  ['android-icon-monochrome.png', 1024, 'transparent', 0.66, false],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
for (const [file, size, bg, scale, rounded] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const inner = scale
    ? `<div style="width:${scale * 100}%;height:${scale * 100}%;${file.includes('monochrome') ? 'filter:brightness(0) invert(1)' : ''}">${mark}</div>`
    : '';
  await page.setContent(`<html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${bg};border-radius:${rounded ? size * 0.22 : 0}px">${inner}</div>
  </body></html>`);
  await page.screenshot({ path: path.join(here, '..', file), omitBackground: true });
  console.log('wrote', file);
}
await browser.close();
