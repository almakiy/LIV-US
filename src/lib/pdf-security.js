// Anti-counterfeiting layers for certificate PDFs (LIV's own designs).
// Every pattern is derived from the certificate's verification hash, so each certificate gets a unique
// pattern and re-rendering the same certificate reproduces it. These layers deter casual copying; the
// authoritative check is always the online verification record.
const crypto = require('crypto');
const path = require('path');
const cfg = require('../config');

const SEAL = path.join(__dirname, '..', '..', 'assets', 'brand', 'liv-seal-color.png');
const GUILLOCHE = ['off', 'light', 'dense'];
const COLORS = ['brand', 'iris'];
// "Iris" print: passport-style blend of colors across the guilloche lines.
const IRIS = ['#1E5AA8', '#17A2A2', '#4CAF50', '#E6B422', '#E8742E', '#C2437A'];

/** Layers an admin can toggle per template. Defaults for old templates (empty config) are all off. */
const RECOMMENDED = { guilloche: 'light', colors: 'iris', microtext: true, ghost: false, tiled: false, fingerprint: true, verifyStrip: true, qrBadge: true, legalNote: true };

function normalizeConfig(input = {}) {
  const i = input && typeof input === 'object' ? input : {};
  return {
    guilloche: GUILLOCHE.includes(i.guilloche) ? i.guilloche : 'off',
    colors: COLORS.includes(i.colors) ? i.colors : 'brand',
    qrBadge: i.qrBadge === true,
    legalNote: i.legalNote === true,
    microtext: i.microtext === true,
    ghost: i.ghost === true,
    tiled: i.tiled === true,
    fingerprint: i.fingerprint === true,
    verifyStrip: i.verifyStrip === true,
  };
}

/** Deterministic PRNG (mulberry32) seeded from the certificate hash. */
function prng(seed) {
  let a = crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE(0);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** Pure function: pattern parameters for a seed. Same seed → same parameters. */
function patternParams(seed, density = 'light') {
  const rnd = prng(seed);
  const between = (lo, hi) => lo + rnd() * (hi - lo);
  const waves = Array.from({ length: density === 'dense' ? 26 : 14 }, () => ({
    f1: between(0.006, 0.02), p1: between(0, 6.28), a1: between(6, 22),
    f2: between(0.02, 0.05), p2: between(0, 6.28), a2: between(2, 8),
  }));
  const rosettes = Array.from({ length: density === 'dense' ? 2 : 1 }, (_, i) => {
    const R = Math.round(between(90, 130)); const r = Math.round(between(7, 31));
    return { R, r, d: between(r * 0.6, r * 1.6), scale: i ? 0.55 : 1, rot: between(0, 6.28) };
  });
  return { waves, rosettes };
}

function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = parseInt(m ? m[1] : '0B1F3A', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Layers drawn behind the certificate content. area = region the pattern may fill. */
function drawBackLayers(doc, { W, H, area, color, seed, data, config }) {
  const c = normalizeConfig(config);
  const cx = area.x + area.w / 2; const cy = H / 2;
  const col = rgb(color);

  if (c.guilloche !== 'off') {
    const { waves, rosettes } = patternParams(seed, c.guilloche);
    doc.save();
    doc.rect(area.x, 0, area.w, H).clip();
    let ink = col;
    if (c.colors === 'iris') {
      ink = doc.linearGradient(area.x, 0, area.x + area.w, H * 0.35);
      IRIS.forEach((hex, i) => ink.stop(i / (IRIS.length - 1), hex));
    }
    doc.lineWidth(c.colors === 'iris' ? 0.32 : 0.25).strokeColor(ink).strokeOpacity(c.colors === 'iris' ? 0.2 : 0.11);
    waves.forEach((w, i) => {
      const y0 = 30 + ((H - 60) * i) / (waves.length - 1);
      for (let x = area.x; x <= area.x + area.w; x += 4) {
        const y = y0 + w.a1 * Math.sin(w.f1 * x + w.p1) + w.a2 * Math.sin(w.f2 * x + w.p2);
        if (x === area.x) doc.moveTo(x, y); else doc.lineTo(x, y);
      }
      doc.stroke();
    });
    doc.strokeOpacity(c.colors === 'iris' ? 0.16 : 0.1);
    rosettes.forEach(({ R, r, d, scale, rot }) => {
      const k = R - r; const turns = r / gcd(R, r); const s = (190 * scale) / (k + d);
      for (let t = 0, first = true; t <= Math.PI * 2 * turns; t += 0.02, first = false) {
        const x = k * Math.cos(t) + d * Math.cos((k / r) * t);
        const y = k * Math.sin(t) - d * Math.sin((k / r) * t);
        const px = cx + s * (x * Math.cos(rot) - y * Math.sin(rot));
        const py = cy + s * (x * Math.sin(rot) + y * Math.cos(rot));
        if (first) doc.moveTo(px, py); else doc.lineTo(px, py);
      }
      doc.stroke();
    });
    doc.restore();
  }

  if (c.tiled) {
    doc.save();
    doc.rect(area.x, 0, area.w, H).clip();
    doc.rotate(-30, { origin: [cx, cy] });
    doc.font('Sans-Bold').fontSize(8).fillColor(col).fillOpacity(0.05);
    const label = `${cfg.brand} · ${data.cert_number}`;
    for (let row = -2; row < 16; row++) {
      for (let colI = -2; colI < 9; colI++) {
        doc.text(label, area.x - 200 + colI * 150 + (row % 2 ? 75 : 0), row * 44 - 120, { lineBreak: false });
      }
    }
    doc.restore();
  }

  if (c.ghost) {
    doc.save();
    doc.opacity(0.06);
    doc.image(SEAL, cx - 170, cy - 170, { width: 340 });
    doc.restore();
  }
}

/** Layers drawn over the content: microtext, fingerprint, verify strip. */
function drawFrontLayers(doc, { W, H, area, color, seed, data, config, design, layout }) {
  const c = normalizeConfig(config);
  const col = rgb(color);

  if (c.microtext) {
    const unit = `${cfg.brand} VERIFIED · ${data.cert_number} · `;
    doc.save();
    doc.font('Sans').fontSize(2.4).fillColor(col).fillOpacity(0.75);
    const reps = Math.ceil(W / doc.widthOfString(unit)) + 1;
    const line = unit.repeat(reps);
    doc.text(line, 0, 9, { lineBreak: false });
    doc.text(line, 0, H - 12, { lineBreak: false });
    doc.restore();
  }

  if (c.fingerprint) {
    const fp = String(seed).slice(0, 32).toUpperCase().match(/.{1,4}/g).join(' ');
    doc.save();
    doc.font('Sans').fontSize(5).fillColor('#8A93A3');
    const y = (layout && layout.fpY) || (design === 'modern' ? H - 18 : H - 25);
    doc.text(`FP ${fp}`, area.x, y, { width: area.w, align: 'center', lineBreak: false });
    doc.restore();
  }

  const legal = layout && layout.legal;
  if (c.legalNote && legal) {
    doc.save();
    doc.font('Sans').fontSize(6.3).fillColor('#6B7280');
    doc.text(`The authenticity of this document can be verified at ${String(data.verify_url).split('?')[0]}. Unauthorized alteration, copying or falsification of its content or appearance is unlawful and may result in legal action.`,
      legal.x, legal.y, { width: legal.w, align: 'center', lineGap: 1.2 });
    doc.restore();
  } else if (c.verifyStrip && design === 'classic') {
    doc.save();
    doc.font('Sans').fontSize(6.5).fillColor('#6B7280');
    doc.text(`Validity is confirmed only at ${String(data.verify_url).split('?')[0]}`, area.x, H - 42, { width: area.w, align: 'center', lineBreak: false });
    doc.restore();
  }
}

/** Framed QR "verify" badge: the QR code inside a rounded frame with labels around it. */
function drawQrBadge(doc, qr, { x, y, size, color }) {
  const gold = '#B08D4C';
  doc.save();
  doc.roundedRect(x, y, size, size, size * 0.09).fillColor('#FFFFFF').fill();
  doc.roundedRect(x + 0.6, y + 0.6, size - 1.2, size - 1.2, size * 0.09).lineWidth(1.1).strokeColor(color).stroke();
  doc.roundedRect(x + 4, y + 4, size - 8, size - 8, size * 0.07).lineWidth(0.35).strokeColor(gold).stroke();
  const q = size * 0.56; const qx = x + (size - q) / 2; const qy = y + (size - q) / 2;
  doc.image(qr, qx, qy, { width: q });
  const fs = Math.max(4.2, size * 0.056);
  doc.fillColor(color).font('Sans-Bold').fontSize(fs);
  doc.text(`${cfg.brand} VERIFIED`, x, y + size * 0.085, { width: size, align: 'center', characterSpacing: 0.9, lineBreak: false });
  doc.fillColor(gold).text(`${cfg.brand} VERIFY`, x, y + size - size * 0.085 - fs, { width: size, align: 'center', characterSpacing: 1.2, lineBreak: false });
  doc.fillColor(color);
  for (const dir of [-1, 1]) {
    doc.save();
    doc.translate(x + (dir < 0 ? size * 0.105 : size - size * 0.105), y + size / 2);
    doc.rotate(dir < 0 ? -90 : 90);
    doc.text('SCAN TO VERIFY', -size / 2, -fs / 2, { width: size, align: 'center', characterSpacing: 0.9, lineBreak: false });
    doc.restore();
  }
  // Corner marks (a small check in a circle) echo the verification theme.
  const r = size * 0.042; const m = size * 0.1;
  for (const [cx, cy] of [[x + m, y + m], [x + size - m, y + m], [x + m, y + size - m], [x + size - m, y + size - m]]) {
    doc.circle(cx, cy, r).fillColor(gold).fill();
    doc.moveTo(cx - r * 0.5, cy).lineTo(cx - r * 0.1, cy + r * 0.45).lineTo(cx + r * 0.55, cy - r * 0.4).lineWidth(0.7).strokeColor('#FFFFFF').stroke();
  }
  doc.restore();
}

module.exports = { drawQrBadge, RECOMMENDED, normalizeConfig, patternParams, drawBackLayers, drawFrontLayers };
