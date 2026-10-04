// Anti-counterfeiting layers for certificate PDFs (LIV's own designs).
// Every pattern is derived from the certificate's verification hash, so each certificate gets a unique
// pattern and re-rendering the same certificate reproduces it. These layers deter casual copying; the
// authoritative check is always the online verification record.
const crypto = require('crypto');
const path = require('path');
const cfg = require('../config');

const SEAL = path.join(__dirname, '..', '..', 'assets', 'brand', 'liv-seal-color.png');
const GUILLOCHE = ['off', 'light', 'dense'];

/** Layers an admin can toggle per template. Defaults for old templates (empty config) are all off. */
const RECOMMENDED = { guilloche: 'light', microtext: true, ghost: true, tiled: false, fingerprint: true, verifyStrip: true };

function normalizeConfig(input = {}) {
  const i = input && typeof input === 'object' ? input : {};
  return {
    guilloche: GUILLOCHE.includes(i.guilloche) ? i.guilloche : 'off',
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
    doc.lineWidth(0.25).strokeColor(col).strokeOpacity(0.11);
    waves.forEach((w, i) => {
      const y0 = 30 + ((H - 60) * i) / (waves.length - 1);
      for (let x = area.x; x <= area.x + area.w; x += 4) {
        const y = y0 + w.a1 * Math.sin(w.f1 * x + w.p1) + w.a2 * Math.sin(w.f2 * x + w.p2);
        if (x === area.x) doc.moveTo(x, y); else doc.lineTo(x, y);
      }
      doc.stroke();
    });
    doc.strokeOpacity(0.1);
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
function drawFrontLayers(doc, { W, H, area, color, seed, data, config, design }) {
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
    const y = design === 'modern' ? H - 18 : H - 25;
    doc.text(`FP ${fp}`, area.x, y, { width: area.w, align: 'center', lineBreak: false });
    doc.restore();
  }

  // The modern theme already prints its own verification line.
  if (c.verifyStrip && design !== 'modern') {
    doc.save();
    doc.font('Sans').fontSize(6.5).fillColor('#6B7280');
    doc.text(`Validity is confirmed only at ${String(data.verify_url).split('?')[0]}`, area.x, H - 42, { width: area.w, align: 'center', lineBreak: false });
    doc.restore();
  }
}

module.exports = { RECOMMENDED, normalizeConfig, patternParams, drawBackLayers, drawFrontLayers };
