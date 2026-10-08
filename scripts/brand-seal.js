// Rewrites the ring text of the LIV seal SVGs (public/brand/liv-seal-*.svg) from the brand config, as outlined glyphs
// (no font needed to display them). Run: node scripts/brand-seal.js   Then re-render the PNG used in PDFs (see docs/BRAND.md).
// The ring-text paths carry id="ring-top" / id="ring-bottom"; on the first run the two white text paths are replaced.
const fs = require('fs');
const path = require('path');
const fontkit = require('fontkit');
const cfg = require('../src/config');

const FONT = fontkit.openSync(path.join(__dirname, '..', 'assets', 'fonts', 'cinzel-latin-700-normal.woff'));
const SANS = fontkit.openSync(path.join(__dirname, '..', 'assets', 'fonts', 'inter-latin-600-normal.woff'));
let CX = 256; let CY = 256; let SC = 1; const MID = 212; // seal geometry in a 512 box; ring band is between r=179 and r=245

function arcText(text, { size, tracking, top, fill, id }) {
  const k = size / FONT.unitsPerEm;
  const run = FONT.layout(text);
  const capH = (FONT.capHeight || FONT.unitsPerEm * 0.7) * k;
  const widths = run.positions.map((p) => p.xAdvance * k + tracking);
  const total = widths.reduce((a, b) => a + b, 0) - tracking;
  const rBase = top ? MID - capH / 2 : MID + capH / 2;
  const rArc = top ? rBase + capH / 2 : rBase - capH / 2; // measure the arc at the middle of the letters
  let s = -total / 2; const parts = [];
  run.glyphs.forEach((g, i) => {
    const gw = run.positions[i].xAdvance * k;
    const centre = s + gw / 2; s += widths[i];
    if (!g.path.commands.length) return;
    const a = ((top ? 1 : -1) * centre / rArc) * 180 / Math.PI;
    const ty = top ? -rBase : rBase;
    parts.push(`<path transform="translate(${CX} ${CY}) scale(${SC}) rotate(${a.toFixed(3)}) translate(${(-gw / 2).toFixed(3)} ${ty.toFixed(3)}) scale(${k.toFixed(6)} ${(-k).toFixed(6)})" d="${g.path.toSVG()}"/>`);
  });
  const spanDeg = (total / rArc) * 180 / Math.PI;
  return { svg: `<g id="${id}" fill="${fill}">${parts.join('')}</g>`, spanDeg };
}

function fit(text, top, maxDeg, tracking, max = 40) {
  for (let size = max; size > 14; size -= 0.5) {
    const r = arcText(text, { size, tracking, top, fill: '#000', id: 'x' });
    if (r.spanDeg <= maxDeg) return size;
  }
  return 14;
}

const TOP = cfg.sealTop; const BOTTOM = cfg.sealBottom;
const TOP_TRACK = 1.6; const BOTTOM_TRACK = 2.2;
const topSize = fit(TOP, true, 214, TOP_TRACK, 31); // stays clear of the side stars
const bottomSize = fit(BOTTOM, false, 104, BOTTOM_TRACK, 31); // fits between the side stars

for (const f of fs.readdirSync(path.join(__dirname, '..', 'public', 'brand')).filter((n) => /^liv-seal-.*\.svg$/.test(n))) {
  const file = path.join(__dirname, '..', 'public', 'brand', f);
  let svg = fs.readFileSync(file, 'utf8');
  const fills = [];
  if (/id="ring-top"/.test(svg)) {
    svg = svg.replace(/<g id="ring-(top|bottom)" fill="([^"]+)">[\s\S]*?<\/g>/g, (m, which, fill) => { fills.push(fill); return `@@RING_${which.toUpperCase()}@@`; });
  } else {
    // First run: the 5th and 6th elements after the background rings are the outlined top and bottom texts.
    let n = 0;
    svg = svg.replace(/<path d="[^"]{2000,}" fill="([^"]+)"\/>/g, (m, fill) => { n++; fills.push(fill); return n === 1 ? '@@RING_TOP@@' : n === 2 ? '@@RING_BOTTOM@@' : m; });
    if (n < 2) throw new Error(`${f}: ring text not found`);
  }
  const fill = fills[0];
  svg = svg.replace('@@RING_TOP@@', arcText(TOP, { size: topSize, tracking: TOP_TRACK, top: true, fill, id: 'ring-top' }).svg)
    .replace('@@RING_BOTTOM@@', arcText(BOTTOM, { size: bottomSize, tracking: BOTTOM_TRACK, top: false, fill, id: 'ring-bottom' }).svg);
  fs.writeFileSync(file, svg);
  console.log(`${f}: top ${topSize}px, bottom ${bottomSize}px`);
}

// Logo lockups: the seal inside each logo (same ring text, scaled) and the name line(s) beside the LIV wordmark.
function lineText(text, { x, baseline, size, tracking, fill, id }) {
  const k = size / SANS.unitsPerEm; const run = SANS.layout(text); let cx = x; const parts = [];
  run.glyphs.forEach((g, i) => {
    if (g.path.commands.length) parts.push(`<path transform="translate(${cx.toFixed(3)} ${baseline}) scale(${k.toFixed(6)} ${(-k).toFixed(6)})" d="${g.path.toSVG()}"/>`);
    cx += run.positions[i].xAdvance * k + tracking;
  });
  return { svg: `<g id="${id}" fill="${fill}">${parts.join('')}</g>`, end: cx - tracking };
}
const NAME = cfg.brandLong.toUpperCase();
const LOGOS = {
  'liv-logo-horizontal': { seal: [100, 200], lines: (() => { const w = NAME.split(' '); const cut = Math.ceil(w.length / 2); return [w.slice(0, cut).join(' '), w.slice(cut).join(' ')]; })(), x: 264, baselines: [156, 184], size: 22, maxW: 270 },
  'liv-logo-nav': { seal: [60, 120], lines: [NAME], x: 145, baselines: [100], size: 15, maxW: 336 },
};
for (const f of fs.readdirSync(path.join(__dirname, '..', 'public', 'brand')).filter((n) => /^liv-logo-.*\.svg$/.test(n))) {
  const L = LOGOS[f.replace(/-reverse/, '').replace(/\.svg$/, '')]; if (!L) continue;
  const file = path.join(__dirname, '..', 'public', 'brand', f);
  let svg = fs.readFileSync(file, 'utf8');
  [CX, CY] = [L.seal[0], L.seal[0]]; SC = L.seal[1] / 512;
  const fills = {};
  if (/id="ring-top"/.test(svg)) {
    svg = svg.replace(/<g id="(ring-top|ring-bottom|name-\d)" fill="([^"]+)">[\s\S]*?<\/g>/g, (m, id, fill) => { fills[id] = fill; return `@@${id}@@`; });
  } else {
    let n = 0;
    svg = svg.replace(/<path d="[^"]{7000,}" fill="#FFFFFF"\/>/g, (m) => { n++; fills[n === 1 ? 'ring-top' : 'ring-bottom'] = '#FFFFFF'; return n === 1 ? '@@ring-top@@' : '@@ring-bottom@@'; });
    let j = 0; // name line(s): the long paths after the seal group that are not the LIV wordmark
    const i = svg.indexOf('</g>');
    svg = svg.slice(0, i) + svg.slice(i).replace(/<path d="[^"]{4000,}" fill="([^"]+)"\/>/g, (m, fill) => { j++; fills[`name-${j}`] = fill; return `@@name-${j}@@`; });
    if (n < 2 || j < 1) throw new Error(`${f}: logo parts not found`);
  }
  svg = svg.replace('@@ring-top@@', arcText(TOP, { size: topSize, tracking: TOP_TRACK, top: true, fill: fills['ring-top'], id: 'ring-top' }).svg)
    .replace('@@ring-bottom@@', arcText(BOTTOM, { size: bottomSize, tracking: BOTTOM_TRACK, top: false, fill: fills['ring-bottom'], id: 'ring-bottom' }).svg);
  const nameFill = fills['name-1'];
  L.lines.forEach((t, li) => {
    let tracking = 3.2; let r;
    do { r = lineText(t, { x: L.x, baseline: L.baselines[li], size: L.size, tracking, fill: nameFill, id: `name-${li + 1}` }); tracking -= 0.2; } while (r.end - L.x > L.maxW && tracking > 0);
    svg = svg.includes(`@@name-${li + 1}@@`) ? svg.replace(`@@name-${li + 1}@@`, r.svg) : svg.replace('</svg>', `${r.svg}</svg>`);
  });
  svg = svg.replace(/@@name-\d@@/g, '');
  fs.writeFileSync(file, svg);
  console.log(`${f}: rewritten`);
}
