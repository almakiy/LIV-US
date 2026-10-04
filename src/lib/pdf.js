const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const cfg = require('../config');

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
  doc.image(SEAL, cx - d / 2, cy - d / 2, { width: d });
  doc.fillColor('#0B1F3A').font('Sans-Bold').fontSize(6.5)
    .text(`ACCREDITED BY ${cfg.brand}`, cx - 70, cy + d / 2 + 6, { width: 140, align: 'center', characterSpacing: 1 });
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

/**
 * data: { cert_number, first_name, last_name, course_name, grade, completion_date, issue_date, expiry_date, verify_url }
 * platform: { company_name, logo_path, primary_color }
 * template: { design, signatory_name, signatory_title }
 */
async function renderCertificate(data, platform, template) {
  const doc = new PDFDocument({ size: [W, H], margin: 0, info: {
    Title: `Certificate ${data.cert_number}`, Author: platform.company_name, Subject: data.course_name, Creator: `${cfg.brand} (${cfg.brandLong}) Certification Platform`,
  } });
  registerFonts(doc);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  const color = platform.primary_color || '#0B1F3A';
  const qr = await QRCode.toBuffer(data.verify_url, { margin: 1, width: 300, errorCorrectionLevel: 'M' });
  const name = `${data.first_name} ${data.last_name}`.trim();
  const design = template?.design || 'classic';

  if (design === 'modern') {
    // Left color panel
    doc.rect(0, 0, 230, H).fill(color);
    doc.rect(230, 0, 6, H).fill(tint(color, 0.55));
    doc.fillColor('#FFFFFF').font('Display').fontSize(25).text('CERTIFICATE', 34, 72, { width: 190, characterSpacing: 0.5 });
    doc.font('Serif-Italic').fontSize(14).text('of Completion', 34, 106, { width: 180 });
    doc.image(qr, 50, 330, { width: 130 });
    doc.font('Sans').fontSize(8).fillColor('#FFFFFF')
      .text('Scan to verify', 34, 466, { width: 162, align: 'center' })
      .font('Sans-Bold').fontSize(9).text(data.cert_number, 34, 480, { width: 162, align: 'center' });

    const x = 280, w = W - x - 60;
    logoOrName(doc, platform, x, 50, 200, 60, color);
    doc.fillColor('#5A6474').font('Sans').fontSize(12).text('This is to certify that', x, 160, { width: w });
    doc.fillColor('#111827').font('Sans-Bold').fontSize(34).text(name, x, 182, { width: w });
    doc.fillColor('#5A6474').font('Sans').fontSize(12).text('has successfully completed', x, doc.y + 8, { width: w });
    doc.fillColor(color).font('Sans-Bold').fontSize(20).text(data.course_name, x, doc.y + 6, { width: w });
    const metaY = Math.max(doc.y + 24, 360);
    const meta = [['Completed', longDate(data.completion_date, 'short')], ['Issued', longDate(data.issue_date, 'short')]];
    if (data.expiry_date) meta.push(['Valid until', longDate(data.expiry_date, 'short')]);
    if (data.grade) meta.push(['Grade', data.grade]);
    meta.forEach(([k, v], i) => {
      const mx = x + i * (w / meta.length);
      doc.fillColor('#8A93A3').font('Sans').fontSize(8).text(k.toUpperCase(), mx, metaY);
      doc.fillColor('#111827').font('Sans-Bold').fontSize(11).text(v, mx, metaY + 12, { width: w / meta.length - 8 });
    });
    // Signature
    doc.moveTo(x, 500).lineTo(x + 200, 500).lineWidth(0.8).strokeColor('#9CA3AF').stroke();
    doc.fillColor('#111827').font('Sans-Bold').fontSize(10).text(template?.signatory_name || platform.company_name, x, 506, { width: 220 });
    doc.fillColor('#5A6474').font('Sans').fontSize(9).text(template?.signatory_title || 'Authorized Signatory', x, 520, { width: 220 });
    drawSeal(doc, W - 112, 486);
    doc.fillColor('#8A93A3').font('Sans').fontSize(7)
      .text(`Verify at ${data.verify_url.split('?')[0]}`, x, H - 30, { width: w });
  } else {
    // Classic: double border, centered
    doc.rect(18, 18, W - 36, H - 36).lineWidth(3).strokeColor(color).stroke();
    doc.rect(28, 28, W - 56, H - 56).lineWidth(1).strokeColor('#B08D4C').stroke();
    logoOrName(doc, platform, W / 2 - 100, 48, 200, 56, color);
    doc.fillColor(color).font('Display').fontSize(34).text('Certificate of Completion', 0, 130, { width: W, align: 'center', characterSpacing: 0.5 });
    doc.fillColor('#4B5563').font('Serif-Italic').fontSize(14).text('This is to certify that', 0, 196, { width: W, align: 'center' });
    doc.fillColor('#111827').font('Serif-Bold').fontSize(32).text(name, 80, 222, { width: W - 160, align: 'center' });
    const ly = doc.y + 4;
    doc.moveTo(W / 2 - 180, ly).lineTo(W / 2 + 180, ly).lineWidth(0.6).strokeColor('#C7CBD1').stroke();
    doc.fillColor('#4B5563').font('Serif-Italic').fontSize(14).text('has successfully completed the course', 0, ly + 12, { width: W, align: 'center' });
    doc.fillColor(color).font('Serif-Bold').fontSize(20).text(data.course_name, 90, doc.y + 6, { width: W - 180, align: 'center' });
    const parts = [`Completed ${longDate(data.completion_date)}`];
    if (data.grade) parts.push(`Grade: ${data.grade}`);
    if (data.expiry_date) parts.push(`Valid until ${longDate(data.expiry_date)}`);
    doc.fillColor('#374151').font('Serif').fontSize(12).text(parts.join('   •   '), 0, doc.y + 10, { width: W, align: 'center' });

    // Bottom row: QR | signature | seal
    doc.image(qr, 60, H - 160, { width: 92 });
    doc.fillColor('#6B7280').font('Sans').fontSize(7).text('Scan to verify', 52, H - 64, { width: 108, align: 'center' });
    doc.fillColor('#111827').font('Sans-Bold').fontSize(8).text(data.cert_number, 46, H - 54, { width: 120, align: 'center' });
    doc.moveTo(W / 2 - 110, H - 100).lineTo(W / 2 + 110, H - 100).lineWidth(0.8).strokeColor('#9CA3AF').stroke();
    doc.fillColor('#111827').font('Sans-Bold').fontSize(10).text(template?.signatory_name || platform.company_name, W / 2 - 150, H - 94, { width: 300, align: 'center' });
    doc.fillColor('#6B7280').font('Sans').fontSize(9).text(template?.signatory_title || 'Authorized Signatory', W / 2 - 150, H - 80, { width: 300, align: 'center' });
    doc.text(`Issued ${longDate(data.issue_date)}`, W / 2 - 150, H - 66, { width: 300, align: 'center' });
    drawSeal(doc, W - 124, H - 120);
  }
  doc.end();
  return done;
}

module.exports = { renderCertificate, longDate, usDate };
