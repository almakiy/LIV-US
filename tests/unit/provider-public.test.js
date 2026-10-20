// Public provider details and ATP verification (October 20, 2026): English-only fields, number format, and the answer's contents.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../../src/lib/provider-public');

test('provider details are optional, trimmed and English only', () => {
  const ok = P.readFields({ public_city: '  Doha  ', public_domain: '', public_delivery: 'Blended   learning' });
  assert.deepStrictEqual(ok.values, { public_city: 'Doha', public_domain: null, public_delivery: 'Blended learning' });
  assert.deepStrictEqual(ok.errors, []);
  assert.strictEqual(P.readFields({ public_city: 'الدوحة' }).errors.length, 1, 'non-Latin text is refused, never converted');
});

test('an ATP number is normalized and must have the issued format', () => {
  assert.strictEqual(P.normalizeNumber(' atp-0012 '), 'ATP-0012');
  assert.strictEqual(P.normalizeNumber('ATP-12345678'), null);
  assert.strictEqual(P.normalizeNumber('0012'), null);
  assert.strictEqual(P.normalizeNumber(undefined), null);
});

test('verification shows status, level and active scope titles only', () => {
  const today = '2026-10-20';
  const scopes = [
    { title: 'Fire Safety', status: 'active', ends_on: null, decision_note: 'internal' },
    { title: 'Old Course', status: 'active', ends_on: '2025-01-01' },
    { title: 'Suspended Course', status: 'suspended', ends_on: null },
  ];
  const out = P.verifyPayload({ public_number: 'ATP-0001', accreditation_status: 'active', level: 'silver' }, scopes, today);
  assert.deepStrictEqual(out, { atp_number: 'ATP-0001', status: 'active', level: 'silver', active_scopes: ['Fire Safety'] });
  assert.strictEqual(Object.keys(out).join(','), 'atp_number,status,level,active_scopes', 'no other fields leave the server');
});
