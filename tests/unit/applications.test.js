const test = require('node:test');
const assert = require('node:assert');
const { allowedBy, sniff, FINAL } = require('../../src/lib/applications');

test('application states move only along the documented path, by the right party', () => {
  assert.strictEqual(allowedBy('draft', 'submitted'), 'applicant');
  assert.strictEqual(allowedBy('completeness_check', 'technical_review'), 'staff');
  assert.strictEqual(allowedBy('awaiting_decision', 'accepted_pending_activation'), 'staff');
  assert.strictEqual(allowedBy('draft', 'accepted_pending_activation'), null);
  assert.strictEqual(allowedBy('technical_review', 'accepted_pending_activation'), null, 'no decision without awaiting_decision');
  assert.strictEqual(allowedBy('technical_review', 'withdrawn'), 'applicant');
  for (const f of FINAL) assert.strictEqual(allowedBy(f, 'draft'), null, `${f} is final`);
});

test('evidence type is read from the file content, not its name', () => {
  assert.strictEqual(sniff(Buffer.from('%PDF-1.7\n')).type, 'application/pdf');
  assert.strictEqual(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])).type, 'image/png');
  assert.strictEqual(sniff(Buffer.from('<html>%PDF-')), null);
  assert.strictEqual(sniff(Buffer.from('MZ\x90\x00')), null);
});
