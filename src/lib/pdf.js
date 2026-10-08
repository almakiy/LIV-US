const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const { drawBackLayers, drawFrontLayers, drawQrBadge, normalizeConfig } = require('./pdf-security');
const { drawSecurityStrip } = require('./pdf-strip');

const W = 792, H = 612; // US Letter landscape
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const FONT = (f) => path.join(ASSETS, 'fonts', f);
const SEAL = path.join(ASSETS, 'brand', 'liv-seal-color.png');
function registerFonts(doc) {
  doc.registerFont('Serif', FONT('libre-baskerville-latin-400-normal.woff'));
  doc.registerFont('Serif-Bold', FONT('libre-baskerville-latin-700-normal.woff'));
  doc.registerFont('Serif-Italic', FONT('libre-baskerville-latin-400-italic.woff'));
  doc.registerFont('Display', FONT('cinzel-latin-700-normal.woff'));
  doc.registerFont('Sans', FONT('inter-latin-400-normal.woff'));
  doc.registerFont('Sans-Bold', FONT('inter-latin-600-normal.woff'));
}

function longDate(d, month = 'long') {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(String(d).slice(0, 10) + 'T00:00:00Z');
  return dt.toLocaleDateString('en-US', { year: 'numeric', month, day: 'numeric', timeZone: 'UTC' });
}
/** US numeric date: MM/DD/YYYY */
function usDate(d) {
  if (!d) return '';
  const s = d instanceof Date ? d.toISOString() : String(d);
  const [y, m, day] = s.slice(0, 10).split('-');
  return `${m}/${day}/${y}`;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = parseInt(m ? m[1] : '0B2545', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function tint(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => Math.round(c + (255 - c) * amt);
  return [f(r), f(g), f(b)];
}

function drawSeal(doc, cx, cy) {
  const d = 104;
  // The seal alone: individual credentials carry no "accredited by" wording (the seal's own text names LIV).
  doc.image(SEAL, cx - d / 2, cy - d / 2, { width: d });
}

function logoOrName(doc, platform, x, y, maxW, maxH, color) {
  const p = platform.logo_path && path.join(cfg.storageDir, platform.logo_path);
  if (p && fs.existsSync(p)) {
    try {
      doc.image(p, x, y, { fit: [maxW, maxH] });
      return;
    } catch (_) { /* fall through to text */ }
  }
  doc.fillColor(color).font('Sans-Bold').fontSize(14).text(platform.company_name, x, y + maxH / 2 - 8, { width: maxW });
}

/** One short, official statement of LIV's role, as printed on certificates (keep in sync with the website copy). */
const accreditationNote = () => `Issued by ${cfg.brand} on the basis of the completion report of an Authorized Education Partner.`; // legacy function name, see docs/LEGACY-NAMING.md

// ---- Themes: each draws the certificate content; security layers are added around it by renderCertificate.
// ctx = { doc, data, platform, template, color, qr, name }
function drawModern({ doc, data, platform, template, color, qr, name, config }) {
  doc.rect(0, 0, 230, H).fill(color);
  doc.rect(230, 0, 6, H).fill(tint(color, 0.55));
  doc.fillColor('#FFFFFF').font('Display').fontSize(25).text('CERTIFICATE', 34, 72, { width: 190, characterSpacing: 0.5 });
  doc.font('Serif-Italic').fontSize(14).text('of Completion', 34, 106, { width: 180 });
  if (config.qrBadge) {
    drawQrBadge(doc, qr, { x: 43, y: 312, size: 144, color });
    doc.font('Sans-Bold').fontSize(9).fillColor('#FFFFFF').text(data.cert_number, 34, 470, { width: 162, align: 'center' });
  } else {
    doc.image(qr, 50, 330, { width: 130 });
    doc.font('Sans').fontSize(8).fillColor('#FFFFFF')
      .text('Scan to verify', 34, 466, { width: 162, align: 'center' })
      .font('Sans-Bold').fontSize(9).text(data.cert_number, 34, 480, { width: 162, align: 'center' });
  }

  const x = 280, w = W - x - 60;
  logoOrName(doc, platform, x, 50, 200, 60, color);
  doc.fillColor('#5A6474').font('Sans').fontSize(12).text('This is to certify that', x, 160, { width: w });
  doc.fillColor('#111827').font('Sans-Bold').fontSize(34).text(name, x, 182, { width: w });
  doc.fillColor('#5A6474').font('Sans').fontSize(12).text('has successfully completed', x, doc.y + 8, { width: w });
  doc.fillColor(color).font('Sans-Bold').fontSize(20).text(data.course_name, x, doc.y + 6, { width: w });
  const metaY = Math.max(doc.y + 24, 360);
  const meta = [['Completed', longDate(data.completion_date, 'short')], ['Issued', longDate(data.issue_date, 'short')]];
  meta.forEach(([k, v], i) => {
    const mx = x + i * (w / meta.length);
    doc.fillColor('#8A93A3').font('Sans').fontSize(8).text(k.toUpperCase(), mx, metaY);
    doc.fillColor('#111827').font('Sans-Bold').fontSize(11).text(v, mx, metaY + 12, { width: w / meta.length - 8 });
  });
  doc.fillColor('#6B7280').font('Sans').fontSize(7.6).text(accreditationNote(), x, metaY + 46, { width: w, align: 'left', lineGap: 2 });
  doc.moveTo(x, 500).lineTo(x + 200, 500).lineWidth(0.8).strokeColor('#9CA3AF').stroke();
  doc.fillColor('#111827').font('Sans-Bold').fontSize(10).text(template?.signatory_name || platform.company_name, x, 506, { width: 220 });
  doc.fillColor('#5A6474').font('Sans').fontSize(9).text(template?.signatory_title || 'Authorized Signatory', x, 520, { width: 220 });
  drawSeal(doc, W - 112, 486);
  if (!config.legalNote) {
    doc.fillColor('#8A93A3').font('Sans').fontSize(7)
      .text(`Verify at ${data.verify_url.split('?')[0]}`, x, H - 30, { width: w });
  }
}

function drawClassic({ doc, data, platform, template, color, qr, name, config }) {
  doc.rect(18, 18, W - 36, H - 36).lineWidth(3).strokeColor(color).stroke();
  doc.rect(28, 28, W - 56, H - 56).lineWidth(1).strokeColor('#B08D4C').stroke();
  logoOrName(doc, platform, W / 2 - 100, 48, 200, 56, color);
  doc.fillColor(color).font('Display').fontSize(34).text('Certificate of Training Completion', 0, 130, { width: W, align: 'center', characterSpacing: 0.5 });
  doc.fillColor('#4B5563').font('Serif-Italic').fontSize(14).text('This is to certify that', 0, 196, { width: W, align: 'center' });
  doc.fillColor('#111827').font('Serif-Bold').fontSize(32).text(name, 80, 222, { width: W - 160, align: 'center' });
  const ly = doc.y + 4;
  doc.moveTo(W / 2 - 180, ly).lineTo(W / 2 + 180, ly).lineWidth(0.6).strokeColor('#C7CBD1').stroke();
  doc.fillColor('#4B5563').font('Serif-Italic').fontSize(14).text('has successfully completed the course', 0, ly + 12, { width: W, align: 'center' });
  doc.fillColor(color).font('Serif-Bold').fontSize(20).text(data.course_name, 90, doc.y + 6, { width: W - 180, align: 'center' });
  doc.fillColor('#374151').font('Serif').fontSize(12).text(`Completed ${longDate(data.completion_date)}`, 0, doc.y + 10, { width: W, align: 'center' });
  doc.fillColor('#6B7280').font('Serif').fontSize(8.2).text(accreditationNote(), (W - 520) / 2, doc.y + 18, { width: 520, align: 'center', lineGap: 2 });

  if (config.qrBadge) {
    drawQrBadge(doc, qr, { x: 52, y: H - 176, size: 112, color });
    doc.fillColor('#111827').font('Sans-Bold').fontSize(7.5).text(data.cert_number, 46, H - 60, { width: 124, align: 'center' });
  } else {
    doc.image(qr, 60, H - 160, { width: 92 });
    doc.fillColor('#6B7280').font('Sans').fontSize(7).text('Scan to verify', 52, H - 64, { width: 108, align: 'center' });
    doc.fillColor('#111827').font('Sans-Bold').fontSize(8).text(data.cert_number, 46, H - 54, { width: 120, align: 'center' });
  }
  doc.moveTo(W / 2 - 110, H - 100).lineTo(W / 2 + 110, H - 100).lineWidth(0.8).strokeColor('#9CA3AF').stroke();
  doc.fillColor('#111827').font('Sans-Bold').fontSize(10).text(template?.signatory_name || platform.company_name, W / 2 - 150, H - 94, { width: 300, align: 'center' });
  doc.fillColor('#6B7280').font('Sans').fontSize(9).text(template?.signatory_title || 'Authorized Signatory', W / 2 - 150, H - 80, { width: 300, align: 'center' });
  doc.text(`Issued ${longDate(data.issue_date)}`, W / 2 - 150, H - 66, { width: 300, align: 'center' });
  drawSeal(doc, W - 124, H - 120);
}

// ---- Executive (landscape, US Letter): formal layout with accent bars, double frame, details row,
// signature, LIV seal and a framed QR badge. Original design.
function drawExecutive({ doc, data, platform, template, color, qr, name, config }) {
  const gold = '#B08D4C';
  // Left margin: the holographic security strip (same height as the gold frame, 9pt wide), or plain accent bars
  if (config.strip) drawSecurityStrip(doc, { x: 14, w: 9, y0: 28, y1: H - 28, seed: data.verification_hash || data.cert_number, text: data.cert_number });
  else { doc.rect(14, 36, 9, 150).fill(color); doc.rect(14, 186, 9, 80).fill(gold); doc.rect(14, 266, 9, 310).fill('#5B6B7F'); }
  // Double frame
  doc.rect(34, 28, W - 68, H - 56).lineWidth(0.8).strokeColor(gold).stroke();
  doc.rect(38.5, 32.5, W - 77, H - 65).lineWidth(0.3).strokeColor(color).stroke();

  // Header: LIV mark on the left, certificate number on the right
  doc.image(SEAL, 58, 46, { width: 46 });
  doc.fillColor(color).font('Display').fontSize(22).text(cfg.brand, 112, 50, { lineBreak: false });
  doc.fillColor(gold).font('Sans-Bold').fontSize(5.8).text(cfg.brandLong.toUpperCase(), 112, 76, { characterSpacing: 1.2, lineBreak: false });
  doc.fillColor('#6B7280').font('Sans').fontSize(5.6).text('PROFESSIONAL CREDENTIALING & VERIFICATION · VIRGINIA, UNITED STATES OF AMERICA', 112, 85, { characterSpacing: 0.7, lineBreak: false });
  doc.fillColor('#8A93A3').font('Sans').fontSize(6.6).text('CERTIFICATE NO.', 0, 50, { width: W - 60, align: 'right', characterSpacing: 1, lineBreak: false });
  doc.fillColor('#111827').font('Sans-Bold').fontSize(12.5).text(data.cert_number, 0, 60, { width: W - 60, align: 'right', lineBreak: false });
  doc.fillColor('#6B7280').font('Sans').fontSize(7.8).text(`Issued ${longDate(data.issue_date)}`, 0, 77, { width: W - 60, align: 'right', lineBreak: false });
  doc.moveTo(58, 100).lineTo(W - 58, 100).lineWidth(0.5).strokeColor('#D9DEE6').stroke();

  // Title
  doc.fillColor(color).font('Display').fontSize(27).text('CERTIFICATE', 0, 112, { width: W, align: 'center', characterSpacing: 2.4, lineBreak: false });
  doc.fillColor(gold).font('Sans-Bold').fontSize(8.5).text('OF TRAINING COMPLETION', 0, 146, { width: W, align: 'center', characterSpacing: 3.4, lineBreak: false });
  doc.moveTo(W / 2 - 70, 170).lineTo(W / 2 - 8, 170).moveTo(W / 2 + 8, 170).lineTo(W / 2 + 70, 170).lineWidth(0.6).strokeColor(gold).stroke();
  doc.polygon([W / 2, 166], [W / 2 + 4, 170], [W / 2, 174], [W / 2 - 4, 170]).fill(gold);

  // Recipient and course
  doc.fillColor('#4B5563').font('Serif-Italic').fontSize(11.5).text('This is to certify that', 0, 186, { width: W, align: 'center', lineBreak: false });
  let fs = 30; doc.font('Serif-Bold');
  while (fs > 16 && doc.fontSize(fs).widthOfString(name) > 600) fs -= 1;
  doc.fillColor('#111827').fontSize(fs).text(name, 60, 206, { width: W - 120, align: 'center', lineBreak: false });
  const ny = 206 + fs + 8;
  doc.moveTo(170, ny).lineTo(W - 170, ny).lineWidth(0.5).strokeColor('#C7CBD1').stroke();
  doc.fillColor('#4B5563').font('Serif-Italic').fontSize(11.5).text('has successfully completed the training course', 0, ny + 12, { width: W, align: 'center', lineBreak: false });
  doc.fillColor(color).font('Serif-Bold').fontSize(18).text(data.course_name, 90, ny + 34, { width: W - 180, align: 'center', lineGap: 2 });

  // Details row
  const dy = Math.max(doc.y + 14, 318);
  const meta = [['COMPLETED', longDate(data.completion_date, 'short')], ['ISSUED', longDate(data.issue_date, 'short')]];
  const cw = (W - 260) / meta.length;
  meta.forEach(([k, v], i) => {
    const mx = 130 + i * cw;
    doc.fillColor('#8A93A3').font('Sans').fontSize(6.6).text(k, mx, dy, { width: cw, align: 'center', characterSpacing: 1.1, lineBreak: false });
    doc.fillColor('#111827').font('Sans-Bold').fontSize(11).text(v, mx, dy + 12, { width: cw, align: 'center', lineBreak: false });
  });
  doc.moveTo(130, dy + 34).lineTo(W - 130, dy + 34).lineWidth(0.4).strokeColor('#E2E5EA').stroke();
  doc.fillColor('#374151').font('Serif').fontSize(8.4).text(
    accreditationNote(), 110, dy + 44, { width: W - 220, align: 'center' });

  // Bottom row (same places as the Classic design): QR badge left | signature center | LIV seal right
  const sy = 512;
  drawQrBadge(doc, qr, { x: 62, y: 434, size: 104, color });
  doc.moveTo(W / 2 - 100, sy).lineTo(W / 2 + 100, sy).lineWidth(0.8).strokeColor('#9CA3AF').stroke();
  doc.fillColor('#8A93A3').font('Sans').fontSize(6.2).text('AUTHORISED BY', W / 2 - 100, sy - 12, { width: 200, align: 'center', characterSpacing: 1.1, lineBreak: false });
  doc.fillColor('#111827').font('Sans-Bold').fontSize(9.5).text(template?.signatory_name || platform.company_name, W / 2 - 130, sy + 6, { width: 260, align: 'center', lineBreak: false });
  doc.fillColor('#6B7280').font('Sans').fontSize(8).text(template?.signatory_title || 'Authorized Signatory', W / 2 - 130, sy + 19, { width: 260, align: 'center', lineBreak: false });
  drawSeal(doc, W - 62 - 52, 486);
}

/** Theme registry. `size` is the page size; `area` the region security patterns may fill; layout hints place the legal note and fingerprint. */
const THEMES = {
  classic: { label: 'Classic (landscape, bordered)', size: [W, H], area: { x: 0, w: W }, draw: drawClassic, layout: { legal: { x: 176, y: H - 46, w: 440 }, fpY: H - 22 } },
  modern: { label: 'Modern (landscape, color side panel)', size: [W, H], area: { x: 236, w: W - 236 }, draw: drawModern, layout: { legal: { x: 280, y: H - 56, w: W - 340 }, fpY: H - 18 } },
  executive: { label: 'Executive (landscape, accent bars)', size: [W, H], area: { x: 36, w: W - 72 }, draw: drawExecutive, layout: { legal: { x: 110, y: H - 56, w: W - 220 }, fpY: H - 22 } },
};

/**
 * data: { cert_number, first_name, last_name, course_name, completion_date, issue_date, verify_url, verification_hash }
 * platform: { company_name, logo_path, primary_color }
 * template: { design, signatory_name, signatory_title, security_config }
 */
async function renderCertificate(data, platform, template) {
  const design = THEMES[template?.design] ? template.design : 'classic';
  const theme = THEMES[design];
  const [pw, ph] = theme.size;
  const doc = new PDFDocument({ size: [pw, ph], margin: 0, info: {
    Title: `Certificate ${data.cert_number}`, Author: cfg.legalEntity, Subject: data.course_name, Creator: `${cfg.brand} (${cfg.brandLong}) Credential Platform`,
  } });
  registerFonts(doc);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  const color = platform.primary_color || '#0B1F3A';
  const qr = await QRCode.toBuffer(data.verify_url, { margin: 1, width: 300, errorCorrectionLevel: 'M' });
  const name = `${data.first_name} ${data.last_name}`.trim();
  const config = normalizeConfig(template?.security_config);
  const sec = { W: pw, H: ph, area: theme.area, color, seed: data.verification_hash || data.cert_number, data, config, design, layout: theme.layout };

  drawBackLayers(doc, sec);
  theme.draw({ doc, data, platform, template, color, qr, name, config });
  drawFrontLayers(doc, sec);

  doc.end();
  return done;
}

module.exports = { renderCertificate, longDate, usDate, THEMES, accreditationNote };
