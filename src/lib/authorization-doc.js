// Authorization scope document (October 20, 2026). A downloadable PDF that states one active scope of one active provider.
// It is produced from the same records that the issuance check uses. Until the template is approved, every page carries a
// draft mark; set AUTH_DOC_TEMPLATE_APPROVED=true after approval to issue the official version.
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const cfg = require('../config');
const { q } = require('../db');
const D = require('./directory');

const APPROVED = String(process.env.AUTH_DOC_TEMPLATE_APPROVED || '').toLowerCase() === 'true';
const NAVY = '#0B1F3A'; const GREY = '#4B5563';
const today = () => new Date().toISOString().slice(0, 10);

/** The data for one scope document, or null when the scope is not currently authorized for a public document. Pure checks live in eligible(). */
function eligible(platform, scope, day = today()) {
  if (!platform || platform.accreditation_status !== 'active') return false;
  if (!scope || scope.status !== 'active') return false;
  if (scope.ends_on && String(scope.ends_on).slice(0, 10) < day) return false;
  return true;
}

async function documentData(platformSlug, scopeId) {
  const { rows: [p] } = await q(`SELECT id, company_name, public_number, level, accreditation_status FROM platforms WHERE public_slug = $1`, [platformSlug]);
  if (!p) return null;
  const { rows: [s] } = await q(`SELECT * FROM partner_scopes WHERE id = $1 AND platform_id = $2`, [scopeId, p.id]);
  if (!eligible(p, s)) return null;
  const branches = (await D.publicBranches(p.id)).filter((b) => b.scopes.some((x) => x.id === s.id))
    .map((b) => ({ ...b, scopes: b.scopes.filter((x) => x.id === s.id) }));
  return { platform: p, scope: s, branches, courses: await D.coursesFor(s.id) };
}

const docNumber = (d) => `${d.platform.public_number || 'ATP'}-${d.scope.scope_number || `S${d.scope.id.slice(0, 8).toUpperCase()}`}`;

function row(doc, label, value) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GREY).text(label, { continued: false });
  doc.font('Helvetica').fontSize(11).fillColor('#111827').text(value || 'Not set', { paragraphGap: 8 });
}

/** Renders the PDF to a buffer. verifyUrl is the public check address for this document. */
async function renderAuthorization(d, verifyUrl) {
  const qr = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 240, errorCorrectionLevel: 'M' });
  const doc = new PDFDocument({ size: 'A4', margin: 52, info: { Title: `Scope of authorization ${docNumber(d)}`, Author: cfg.legalEntity, Creator: `${cfg.brand} authorization` } });
  const chunks = []; doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const draftMark = () => {
    if (APPROVED) return;
    doc.save(); doc.rotate(-30, { origin: [300, 420] }).fontSize(54).fillColor('#D9DEE5').opacity(0.45).text('DRAFT FOR REVIEW', 60, 380, { width: 480, align: 'center' }); doc.restore();
  };
  draftMark();
  doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY).text(cfg.legalEntity || cfg.brandLong);
  doc.font('Helvetica').fontSize(10).fillColor(GREY).text('LIV Authorized Training Provider (ATP) · Scope of authorization');
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY).text('Scope of authorization', { paragraphGap: 6 });
  doc.font('Helvetica').fontSize(10).fillColor(GREY).text(`Document ${docNumber(d)} · Version ${d.scope.revision} · Issued ${today()}`, { paragraphGap: 14 });
  row(doc, 'Training provider', d.platform.company_name);
  row(doc, 'ATP number', d.platform.public_number);
  row(doc, 'Partnership level', d.platform.level ? d.platform.level.charAt(0).toUpperCase() + d.platform.level.slice(1) : null);
  row(doc, 'Authorized scope', d.scope.title);
  row(doc, 'Scope number', d.scope.scope_number);
  row(doc, 'Domain', d.scope.domain);
  row(doc, 'Boundaries of the authorization', d.scope.boundaries);
  row(doc, 'Restrictions', d.scope.restrictions);
  row(doc, 'Delivery methods authorized', d.scope.delivery_methods);
  row(doc, 'Granted on', String(d.scope.granted_on).slice(0, 10));
  row(doc, 'Ends on', d.scope.ends_on ? String(d.scope.ends_on).slice(0, 10) : 'Not set');
  row(doc, 'Status', 'Active');
  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('Approved branches and sites', { paragraphGap: 4 });
  if (d.branches.length) d.branches.forEach((b) => { doc.font('Helvetica').fontSize(10).fillColor('#111827').text(`${b.name}${b.address ? ', ' + b.address : ''}${b.city ? ', ' + b.city : ''}${b.country ? ', ' + b.country : ''}${b.scopes[0].delivery_methods ? ' · methods: ' + b.scopes[0].delivery_methods : ''}`, { paragraphGap: 4 }); });
  else doc.font('Helvetica').fontSize(10).fillColor(GREY).text('No branch is approved for this scope.', { paragraphGap: 8 });
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('Authorized courses under this scope', { paragraphGap: 4 });
  if (d.courses.length) d.courses.forEach((c) => { doc.font('Helvetica').fontSize(10).fillColor('#111827').text(`${c.title} · reference ${c.reference} · version ${c.revision}`, { paragraphGap: 3 }); });
  else doc.font('Helvetica').fontSize(10).fillColor(GREY).text('No course is recorded under this scope yet.', { paragraphGap: 3 });
  doc.moveDown(1);
  const y = doc.y;
  doc.image(qr, 52, y, { width: 96 });
  doc.font('Helvetica').fontSize(9).fillColor(GREY).text('Scan to check this document on the LIV public register. The check shows the current status and active scope of the provider.', 160, y + 4, { width: 330 });
  doc.text(verifyUrl, 160, doc.y + 4, { width: 330, link: verifyUrl, underline: true });
  doc.moveDown(4);
  doc.font('Helvetica').fontSize(8).fillColor(GREY).text(`${cfg.legalEntity} · Authorization is a private, voluntary program. It is not a government approval. Authorization reflects that the provider met LIV criteria at the time of review.`, 52, 760, { width: 490, align: 'left' });
  doc.end();
  return done;
}

module.exports = { APPROVED, eligible, documentData, docNumber, renderAuthorization };
