// Invoice PDF (US Letter, portrait) with the standard PDF fonts, so no font files are needed.
const path = require('path');
const PDFDocument = require('pdfkit');
const cfg = require('../config');
const { money, isOverdue } = require('./billing');

const SEAL = path.join(__dirname, '..', '..', 'assets', 'brand', 'liv-seal-color.png');
const NAVY = '#0B1F3A'; const GOLD = '#B08D4C'; const GREY = '#6B7280';

function renderInvoice(inv, lines, payments) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: `Invoice ${inv.number || 'draft'}`, Author: cfg.legalEntity, Creator: `${cfg.brand} billing` } });
  const chunks = []; doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  const W = doc.page.width; const L = 48; const R = W - 48;
  const cur = inv.currency || 'USD';

  try { doc.image(SEAL, L, 44, { width: 52 }); } catch (_) { /* seal is optional */ }
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text(cfg.brand, L + 62, 48);
  doc.font('Helvetica').fontSize(8).fillColor(GOLD).text(cfg.brandLong.toUpperCase(), L + 62, 72, { characterSpacing: 1 });
  doc.fillColor(GREY).fontSize(8).text([cfg.legalEntity, cfg.legalAddress, cfg.billingEmail].filter(Boolean).join('  ·  '), L + 62, 86, { width: 300 });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(24).text(inv.status === 'draft' ? 'DRAFT INVOICE' : 'INVOICE', 0, 48, { width: R, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor('#111827').text(inv.number || 'Not yet issued', 0, 78, { width: R, align: 'right' });

  doc.moveTo(L, 118).lineTo(R, 118).lineWidth(0.6).strokeColor('#D9DEE6').stroke();
  const b = inv.billing && inv.billing.name ? inv.billing : { name: inv.company_name, company: inv.company_name };
  doc.font('Helvetica-Bold').fontSize(8).fillColor(GREY).text('BILLED TO', L, 130);
  doc.font('Helvetica').fontSize(10).fillColor('#111827').text([b.name, b.company && b.company !== b.name ? b.company : null, b.address, b.country, b.email, b.tax_id ? `Tax ID: ${b.tax_id}` : null].filter(Boolean).join('\n'), L, 144, { width: 270 });
  const meta = [['Issue date', inv.issue_date ? String(inv.issue_date).slice(0, 10) : '—'], ['Due date', inv.due_date ? String(inv.due_date).slice(0, 10) : '—'], ['Currency', cur]];
  if (inv.period_start) meta.push(['Plan year', `${String(inv.period_start).slice(0, 10)} to ${String(inv.period_end).slice(0, 10)}`]);
  meta.forEach(([k, v], i) => { doc.font('Helvetica').fontSize(8).fillColor(GREY).text(k.toUpperCase(), 340, 130 + i * 26); doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(v, 340, 141 + i * 26); });

  let y = 262;
  doc.rect(L, y, R - L, 20).fill(NAVY);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
  doc.text('DESCRIPTION', L + 8, y + 6); doc.text('QTY', 350, y + 6, { width: 40, align: 'right' }); doc.text('UNIT', 395, y + 6, { width: 70, align: 'right' }); doc.text('AMOUNT', 470, y + 6, { width: R - 478, align: 'right' });
  y += 26;
  doc.font('Helvetica').fontSize(9).fillColor('#111827');
  for (const l of lines) {
    const h = doc.heightOfString(l.description, { width: 290 });
    if (y + h > 640) { doc.addPage(); y = 60; doc.font('Helvetica').fontSize(9).fillColor('#111827'); }
    doc.text(l.description, L + 8, y, { width: 290 });
    doc.text(String(l.quantity), 350, y, { width: 40, align: 'right' }); doc.text(money(l.unit_amount_cents, cur), 395, y, { width: 70, align: 'right' }); doc.text(money(l.amount_cents, cur), 470, y, { width: R - 478, align: 'right' });
    y += Math.max(h, 12) + 6;
    if (Number(l.discount_cents) > 0) { doc.fillColor(GREY).text(`Discount`, L + 8, y - 2, { width: 290 }); doc.text(`-${money(l.discount_cents, cur)}`, 470, y - 2, { width: R - 478, align: 'right' }); doc.fillColor('#111827'); y += 14; }
    doc.moveTo(L, y - 3).lineTo(R, y - 3).lineWidth(0.3).strokeColor('#E5E7EB').stroke();
  }
  const row = (k, v, bold) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5).fillColor('#111827').text(k, 340, y, { width: 120 }); doc.text(v, 460, y, { width: R - 460, align: 'right' }); y += bold ? 20 : 16; };
  y += 8;
  const credit = Number(inv.discount_cents) - lines.reduce((s, l) => s + Number(l.discount_cents), 0);
  row('Subtotal', money(inv.subtotal_cents, cur));
  if (Number(inv.discount_cents) > 0) row(credit > 0 ? 'Discounts and credits' : 'Discounts', `-${money(inv.discount_cents, cur)}`);
  if (Number(inv.tax_rate_bps) > 0 || Number(inv.tax_cents) > 0) row(`${inv.tax_label} (${(inv.tax_rate_bps / 100).toFixed(2)}%)`, money(inv.tax_cents, cur));
  row('Total', money(inv.total_cents, cur), true);
  if (payments.length) { payments.forEach((p) => row(`Paid ${String(p.received_on).slice(0, 10)} (${p.method.replace('_', ' ')})`, `-${money(p.amount_cents, cur)}`)); row('Balance due', money(Number(inv.total_cents) - Number(inv.amount_paid_cents), cur), true); }

  y = Math.max(y + 18, 560);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(GREY).text('PAYMENT', L, y);
  doc.font('Helvetica').fontSize(9).fillColor('#111827').text(cfg.bankDetails ? `Bank transfer (the payer bears bank charges). Please quote ${inv.number || 'the invoice number'}.\n${cfg.bankDetails}` : `Please contact ${cfg.billingEmail || 'LIV billing'} for payment details and quote ${inv.number || 'the invoice number'}.`, L, y + 12, { width: 320 });
  if (inv.notes) doc.font('Helvetica').fontSize(8.5).fillColor(GREY).text(inv.notes, 380, y + 12, { width: R - 380 });
  doc.fontSize(7.5).fillColor(GREY).text(`${cfg.legalEntity} is a private professional credentialing and verification organization based in the United States and is not a government agency. Fees are exclusive of taxes unless shown. Payment terms are set in the partner agreement.`, L, 735, { width: R - L, align: 'center' });
  if (inv.status === 'paid') { doc.save().rotate(-20, { origin: [300, 400] }).fontSize(70).fillColor('#16A34A').fillOpacity(0.14).font('Helvetica-Bold').text('PAID', 190, 360).restore(); }
  if (inv.status === 'void') { doc.save().rotate(-20, { origin: [300, 400] }).fontSize(70).fillColor('#B91C1C').fillOpacity(0.14).font('Helvetica-Bold').text('VOID', 190, 360).restore(); }
  if (isOverdue(inv)) doc.fontSize(9).fillColor('#B91C1C').font('Helvetica-Bold').text('OVERDUE', L, 118 - 12);
  doc.end();
  return done;
}
module.exports = { renderInvoice };
