// Regression: the certificate face is LIV's credential identity. No design may draw the Education Partner's name,
// logo or brand color on a newly issued credential (owner decision, Oct 8, 2026).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const cfg = require('../../src/config');
const { renderCertificate, THEMES } = require('../../src/lib/pdf');
const { RECOMMENDED } = require('../../src/lib/pdf-security');

const PARTNER = 'Zephyr Partner Academy';
const logoRel = path.join('tmp', `partner-logo-${process.pid}.png`);
const logoAbs = path.join(cfg.storageDir, logoRel);
fs.mkdirSync(path.dirname(logoAbs), { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', '..', 'assets', 'brand', 'liv-seal-color.png'), logoAbs);
test.after(() => fs.rmSync(logoAbs, { force: true }));

const platform = { company_name: PARTNER, logo_path: logoRel, primary_color: '#C2185B' };
const data = {
  cert_number: 'LIV-2026-FACE0001', first_name: 'Jane', last_name: 'Doe', course_name: 'Test Course',
  completion_date: '2026-09-01', issue_date: '2026-09-02', verify_url: 'http://localhost:3000/verify/LIV-2026-FACE0001?t=abc',
  verification_hash: crypto.createHash('sha256').update('face').digest('hex'),
};

/** Renders while recording every string drawn, every image placed and every fill color used. */
async function record(template) {
  const texts = []; const images = []; const fills = [];
  const { text, image, fillColor } = PDFDocument.prototype;
  PDFDocument.prototype.text = function (t, ...a) { texts.push(String(t)); return text.call(this, t, ...a); };
  PDFDocument.prototype.image = function (src, ...a) { images.push(typeof src === 'string' ? src : '<buffer>'); return image.call(this, src, ...a); };
  PDFDocument.prototype.fillColor = function (c, ...a) { fills.push(String(c)); return fillColor.call(this, c, ...a); };
  try { const pdf = await renderCertificate(data, platform, template); return { pdf, texts, images, fills }; }
  finally { Object.assign(PDFDocument.prototype, { text, image, fillColor }); }
}

for (const design of Object.keys(THEMES)) {
  test(`${design}: a new credential never prints the partner name, logo or color`, async () => {
    const r = await record({ design, signatory_name: 'Dr. Ann Lee', signatory_title: 'Director of Training', security_config: RECOMMENDED });
    assert.ok(r.pdf.slice(0, 4).toString() === '%PDF');
    assert.ok(!r.texts.some((t) => t.includes(PARTNER)), 'partner name drawn');
    assert.ok(!r.images.some((p) => p.includes('partner-logo')), 'partner logo drawn');
    assert.ok(!r.fills.some((c) => c.toUpperCase() === '#C2185B'), 'partner color used');
    assert.ok(r.texts.includes('Dr. Ann Lee'), 'signatory still printed');
    assert.ok(!r.pdf.toString('latin1').includes(PARTNER), 'partner name in the PDF bytes or metadata');
  });

  test(`${design}: a template cannot smuggle the partner name in through the signatory`, async () => {
    const r = await record({ design, signatory_name: `${PARTNER} Team`, signatory_title: `CEO, ${PARTNER.toUpperCase()}`, security_config: {} });
    assert.ok(!r.texts.some((t) => t.toLowerCase().includes(PARTNER.toLowerCase())));
    assert.ok(r.texts.includes(cfg.legalEntity) && r.texts.includes('Authorized Signatory'), 'falls back to LIV signatory lines');
  });
}

test('metadata: LIV LLC author, institute as creator, record classification as subject, credential and holder as title', async () => {
  const s = (await record({ design: 'executive', security_config: {} })).pdf.toString('latin1');
  const info = (k) => { const n = (s.match(new RegExp(`/${k} (\\d+) 0 R`)) || [])[1]; return n ? (s.match(new RegExp(`\\n${n} 0 obj\\n\\((.*)\\)\\n`)) || [])[1] : undefined; };
  assert.strictEqual(info('Author'), cfg.legalEntity);
  assert.strictEqual(info('Creator'), cfg.brandLong);
  assert.match(info('Subject'), /^Training Completion Credential\./);
  assert.strictEqual(info('Title'), 'Training Completion Credential: Test Course \\(Jane Doe\\)');
  assert.ok(!/accredit|certified|certification/i.test([info('Title'), info('Subject'), info('Keywords')].join(' ')), 'no accreditation or certification claim in metadata');
});

test('only available record types can be rendered', async () => {
  await assert.rejects(renderCertificate({ ...data, record_type: 'professional_certification' }, platform, { design: 'executive' }), /cannot be issued yet/);
  await assert.rejects(renderCertificate({ ...data, record_type: 'external_pathway' }, platform, { design: 'executive' }), /cannot be issued yet/);
});
