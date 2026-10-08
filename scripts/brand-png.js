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
  // Default social card (Open Graph / LinkedIn), 1200x630.
  const cfg = require('../src/config');
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const font = (f) => `data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'public', 'fonts', f)).toString('base64')}`;
  const seal = fs.readFileSync(path.join(ROOT, 'public/brand/liv-seal-reverse.svg'), 'utf8').replace('<svg ', '<svg style="width:400px;height:400px" ');
  await page.setContent(`<html><head><style>
    @font-face{font-family:B;src:url(${font('libre-baskerville-latin-700-normal.woff2')})}
    @font-face{font-family:I;src:url(${font('inter-latin-600-normal.woff2')})}
    body{margin:0;width:1200px;height:630px;background:#0B1F3A;display:flex;align-items:center;gap:56px;padding:0 80px;box-sizing:border-box;border-bottom:10px solid #B08D4C}
    h1{font-family:B;color:#fff;font-size:92px;margin:0;letter-spacing:4px}
    .n{font-family:I;color:#D4B97A;font-size:24px;letter-spacing:5px;text-transform:uppercase;margin:6px 0 34px}
    .l{font-family:B;color:#fff;font-size:34px;line-height:1.3;margin:0}
    .d{font-family:I;color:#C9D3E1;font-size:18px;margin-top:26px}</style></head>
    <body>${seal}<div><h1>${cfg.brand}</h1><div class="n">${cfg.brandLong}</div><p class="l">${cfg.brandLine}</p><div class="d">${cfg.brandDescriptor}</div></div></body></html>`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(ROOT, 'public/brand/og-default.png') });
  console.log('public/brand/og-default.png: 1200x630');
  await browser.close();
})();
