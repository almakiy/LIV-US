// Public directory rules (October 20, 2026): proposed details, links, English only, document eligibility and the PDF itself.
const test = require('node:test');
const assert = require('node:assert');
const D = require('../../src/lib/directory');
const AD = require('../../src/lib/authorization-doc');

test('proposed details are checked: links must be web addresses, at most five, and text in English', () => {
  const good = D.readProfile({ website: 'https://example.com', public_social: 'https://a.example https://b.example', public_about: '  Workplace   safety training. ' });
  assert.deepStrictEqual(good.errors, []);
  assert.strictEqual(good.fields.public_about, 'Workplace safety training.');
  assert.strictEqual(good.fields.public_city, null, 'empty values are stored as null, never invented');
  assert.match(D.readProfile({ website: 'example.com' }).errors.join(' '), /https:\/\//);
  assert.match(D.readProfile({ public_social: 'ftp://x.example' }).errors.join(' '), /https:\/\/ or http:\/\//);
  assert.match(D.readProfile({ public_social: 'https://1.example https://2.example https://3.example https://4.example https://5.example https://6.example' }).errors.join(' '), /at most five/);
  assert.match(D.readProfile({ public_about: 'التدريب' }).errors.join(' '), /English/);
});

test('a document is issued only for an active scope of an active provider that has not ended', () => {
  const active = { accreditation_status: 'active' };
  assert.strictEqual(AD.eligible(active, { status: 'active', ends_on: null }), true);
  assert.strictEqual(AD.eligible(active, { status: 'active', ends_on: '2020-01-01' }, '2026-10-20'), false, 'an ended scope has no current document');
  assert.strictEqual(AD.eligible(active, { status: 'suspended', ends_on: null }), false);
  assert.strictEqual(AD.eligible({ accreditation_status: 'suspended' }, { status: 'active', ends_on: null }), false);
  assert.strictEqual(AD.eligible(null, { status: 'active' }), false);
});

test('the scope document is a PDF with its own number', async () => {
  const pdf = await AD.renderAuthorization({
    platform: { company_name: 'Test Co', public_number: 'ATP-0001', level: 'silver', accreditation_status: 'active' },
    scope: { id: '0a22475a-ae9e-4caa-9402-5def9e3ea683', title: 'Fire Safety', scope_number: 'S-1', domain: 'Safety', boundaries: '', restrictions: '', delivery_methods: 'Online', granted_on: '2026-01-01', ends_on: null, revision: 2 },
    branches: [], courses: [{ title: 'Fire Safety', reference: 'T-ABC', revision: 1 }],
  }, 'https://example.com/partners/verify?number=ATP-0001');
  assert.strictEqual(pdf.slice(0, 5).toString(), '%PDF-');
  assert.strictEqual(AD.docNumber({ platform: { public_number: 'ATP-0001' }, scope: { scope_number: 'S-1', id: 'x' } }), 'ATP-0001-S-1');
  assert.strictEqual(AD.APPROVED, false, 'the official version waits for the template approval');
});
