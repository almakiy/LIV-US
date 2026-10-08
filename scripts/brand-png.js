// Renders the PNG copies of the brand SVGs that PDFs embed (assets/brand/*.png). Needs the Playwright dev dependency
// and a Chromium (set CHROMIUM_PATH if Playwright cannot find one). Run after scripts/brand-seal.js.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const JOBS = [
  ['public/brand/liv-seal-color.svg', 'assets/brand/liv-seal-color.png', 1024, 1024],
  ['public/brand/liv-logo-horizontal.svg', 'assets/brand/liv-logo-horizontal.png', 900, 334], // printed about 200pt wide on credentials
];
(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const [src, out, w, h] of JOBS) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const svg = fs.readFileSync(path.join(ROOT, src), 'utf8').replace('<svg ', `<svg style="width:${w}px;height:${h}px;display:block" `);
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.screenshot({ path: path.join(ROOT, out), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    await page.close();
    console.log(`${out}: ${w}x${h}`);
  }
  await browser.close();
})();
