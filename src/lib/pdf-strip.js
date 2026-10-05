// LIV holographic security strip (Executive design, left margin). Original artwork: spectrum foil, banknote-style
// mesh, scattered curls, the LIV seal, a padlock, micro-text with the certificate number, and gold edges.
// Every random choice is drawn from the certificate's verification hash, so each certificate has its own weave;
// the same hash always redraws the same strip. It is a printed visual deterrent, not a physical hologram:
// the online verification record stays the authoritative check.
const crypto = require('crypto');
const path = require('path');

const SEAL = path.join(__dirname, '..', '..', 'assets', 'brand', 'liv-seal-color.png');

/** Deterministic stream of numbers in [0,1) from a seed (hash chain). */
function stream(seed) {
  let buf = Buffer.alloc(0); let ctr = 0; let pos = 0;
  return () => {
    if (pos >= buf.length) { buf = crypto.createHash('sha256').update(`${seed}:${ctr++}`).digest(); pos = 0; }
    return buf[pos++] / 256;
  };
}

/**
 * Draws the strip at x..x+w, y0..y1. The same opacity applies along every horizontal line: tone is uniform across the
 * width and the white fade is a pure vertical ramp, so the strip emerges from the page (0%) to full strength (100%).
 */
function drawSecurityStrip(doc, { x, w, y0, y1, seed, text }) {
  const len = y1 - y0; const rnd = stream(seed); const cx = x + w / 2;
  doc.save(); doc.rect(x, y0, w, len).clip();
  // 1. spectrum foil
  const g = doc.linearGradient(x, y0, x, y1);
  [[0, '#1A2A66'], [0.14, '#2A4A96'], [0.3, '#4468AE'], [0.44, '#6A74B4'], [0.55, '#A99A66'], [0.66, '#5A66A6'], [0.82, '#2E3C86'], [1, '#16205A']].forEach(([o, c]) => g.stop(o, c));
  doc.rect(x, y0, w, len).fill(g);
  // 2. banknote mesh: two dense families of sine lines
  doc.lineWidth(0.1);
  for (const [col, op, per, cnt] of [['#C4D3F2', 0.2, 9, 14], ['#F1DA9A', 0.15, 15, 9]]) {
    doc.strokeColor(col).strokeOpacity(op);
    for (let i = 0; i < cnt; i++) {
      const mid = x + (w * (i + 0.5)) / cnt; const ph = rnd() * 6.28;
      for (let t = y0, f = true; t <= y1; t += 1.1, f = false) { const xx = mid + w * 0.18 * Math.sin((2 * Math.PI * t) / per + ph); if (f) doc.moveTo(xx, t); else doc.lineTo(xx, t); }
      doc.stroke();
    }
  }
  // 3. flowing bundle of waves at the head and tail
  for (const [yy0, yy1] of [[y0, y0 + len * 0.1], [y1 - len * 0.07, y1]]) {
    for (let i = 0; i < 14; i++) {
      const ph = i * 0.22 + rnd() * 0.3; const a = w * (0.18 + i * 0.012); doc.lineWidth(0.14).strokeColor(i % 2 ? '#F4E3A6' : '#D3DFF7').strokeOpacity(0.55);
      for (let t = yy0, f = true; t <= yy1; t += 1, f = false) { const k = (t - yy0) / (yy1 - yy0); const xx = cx + a * Math.sin((2 * Math.PI * (t - yy0)) / 26 + ph) * (0.6 + 0.4 * Math.sin(k * 3 + i)); if (f) doc.moveTo(xx, t); else doc.lineTo(xx, t); }
      doc.stroke();
    }
  }
  // 4. scattered curls (C arcs and S curves) in gold and ice, mixed strength and size
  const gold = doc.linearGradient(x, y0, x, y1); [[0, '#FBEBB8'], [0.5, '#D9A93A'], [1, '#FBEBB8']].forEach(([o, c]) => gold.stop(o, c));
  const ice = doc.linearGradient(x, y0, x, y1); [[0, '#E6EEFC'], [0.5, '#9DB4E6'], [1, '#E6EEFC']].forEach(([o, c]) => ice.stop(o, c));
  const sealY = y0 + len * 0.58;
  const curls = Math.round(len / 8);
  for (let n = 0; n < curls; n++) {
    const yy = y0 + 8 + rnd() * (len - 16); if (Math.abs(yy - sealY) < 14 || Math.abs(yy - (sealY + 24)) < 7) continue;
    const xx = x + 2.6 + rnd() * (w - 5.2); const r = 0.8 + rnd() * (w * 0.14); const rot = rnd() * 6.28;
    doc.strokeColor(rnd() < 0.6 ? gold : ice).strokeOpacity([0.3, 0.5, 0.7, 0.9][Math.floor(rnd() * 4)]).lineWidth([0.28, 0.4, 0.55][Math.floor(rnd() * 3)]).lineCap('round');
    if (rnd() < 0.62) { for (let k = 0; k <= 16; k++) { const a = rot + (k / 16) * Math.PI * 1.45; const px = xx + r * Math.cos(a); const py = yy + r * Math.sin(a); if (!k) doc.moveTo(px, py); else doc.lineTo(px, py); } }
    else { for (let k = 0; k <= 20; k++) { const u = k / 20; const px = xx + r * 1.4 * (u - 0.5) * Math.cos(rot) - r * 0.8 * Math.sin(u * Math.PI * 2) * Math.sin(rot); const py = yy + r * 1.4 * (u - 0.5) * Math.sin(rot) + r * 0.8 * Math.sin(u * Math.PI * 2) * Math.cos(rot); if (!k) doc.moveTo(px, py); else doc.lineTo(px, py); } }
    doc.stroke();
  }
  // micro-text on both lanes (left reads upward, right downward) so the two sides carry the same tone
  { const unit = `LIV VERIFIED • CERTIFICATE ${text} • SECURE ORIGINAL • UNITED STATES • DO NOT COPY • `;
    for (const left of [true, false]) {
      doc.save(); doc.translate(left ? x + 2.1 : x + w - 2.1, left ? y1 - 3 : y0 + 3); doc.rotate(left ? -90 : 90); doc.font('Sans-Bold').fontSize(1.5);
      doc.fillColor('#D7E8FF').fillOpacity(0.62).text(unit.repeat(Math.ceil(len / doc.widthOfString(unit)) + 1), 0, -0.75, { lineBreak: false, characterSpacing: 0.25 });
      doc.restore();
    } }
  // 5. LIV seal medallion with a rosette ring
  const R = w * 0.39;
  doc.save(); doc.lineWidth(0.14).strokeColor('#F1DA9A').strokeOpacity(0.7);
  { const k = 7; const rr = 2; const d = 4.2; const sc = (R * 1.55) / (k + d); for (let t = 0, f = true; t <= Math.PI * 2 * 2; t += 0.03, f = false) { const px = cx + sc * (k * Math.cos(t) + d * Math.cos((k / rr) * t)); const py = sealY + sc * (k * Math.sin(t) - d * Math.sin((k / rr) * t)); if (f) doc.moveTo(px, py); else doc.lineTo(px, py); } doc.stroke(); }
  doc.circle(cx, sealY, R * 1.18).lineWidth(0.4).strokeColor('#F1DA9A').strokeOpacity(0.95).stroke();
  doc.restore();
  doc.save(); doc.circle(cx, sealY, R).clip(); doc.image(SEAL, cx - R, sealY - R, { width: R * 2 }); doc.restore();
  // 6. padlock under the seal
  { const lx = cx; const ly = sealY + R * 1.18 + 7; const bw = w * 0.3; const bh = bw * 0.78;
    doc.lineWidth(0.5).strokeColor('#DDF1FF').strokeOpacity(0.9);
    for (let k = 0, f = true; k <= 12; k++, f = false) { const a = Math.PI + (k / 12) * Math.PI; const px = lx + bw * 0.32 * Math.cos(a); const py = ly + bh * 0.1 + bw * 0.32 * Math.sin(a); if (f) doc.moveTo(px, py); else doc.lineTo(px, py); } doc.stroke();
    doc.roundedRect(lx - bw / 2, ly + bh * 0.1, bw, bh, 0.8).fillColor('#DDF1FF').fillOpacity(0.92).fill();
    doc.circle(lx, ly + bh * 0.1 + bh * 0.42, 0.45).fillColor('#22398C').fillOpacity(1).fill(); }
  const edge = doc.linearGradient(x, y0, x, y1); [[0, '#F7E4A2'], [0.3, '#C9972C'], [0.55, '#F7E4A2'], [0.8, '#B98623'], [1, '#F7E4A2']].forEach(([o, c]) => edge.stop(o, c));
  doc.rect(x, y0, 0.9, len).fill(edge); doc.rect(x + w - 0.9, y0, 0.9, len).fill(edge);
  doc.restore();
  // fade: the strip emerges from the page (0%) and reaches full strength (100%) over ~70pt at both ends
  const FADE = 70; const ease = [[0, 1], [0.2, 0.86], [0.4, 0.6], [0.6, 0.33], [0.8, 0.12], [1, 0]];
  for (const top of [true, false]) {
    const fy0 = top ? y0 - 1 : y1 + 1; const fy1 = top ? y0 + FADE : y1 - FADE;
    const fg = doc.linearGradient(0, fy0, 0, fy1); ease.forEach(([o, a]) => fg.stop(o, '#FFFFFF', a));
    doc.rect(x - 1, top ? y0 - 1 : y1 - FADE, w + 2, FADE + 2).fill(fg);
  }
}

module.exports = { drawSecurityStrip, stream };
