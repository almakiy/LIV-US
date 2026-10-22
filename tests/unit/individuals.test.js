const test = require('node:test');
const assert = require('node:assert');
const I = require('../../src/lib/individuals');

const ok = { full_name: 'Maria Lopez', email: 'maria@example.com', password: 'long-enough-1', confirm: 'long-enough-1', terms: true };

test('a complete sign-up is valid', () => assert.deepStrictEqual(I.validateSignup(ok), []));
test('names must be in Latin letters and are never converted', () => {
  assert.ok(I.validateSignup({ ...ok, full_name: 'محمد علي' }).some((e) => /English/.test(e)));
  assert.deepStrictEqual(I.validateSignup({ ...ok, full_name: 'José Núñez' }), []);
});
test('email, password, confirmation and privacy notice are required', () => {
  assert.ok(I.validateSignup({ ...ok, email: 'not-an-email' }).length);
  assert.ok(I.validateSignup({ ...ok, password: 'short', confirm: 'short' }).length);
  assert.ok(I.validateSignup({ ...ok, confirm: 'different-1234' }).length);
  assert.ok(I.validateSignup({ ...ok, terms: false }).length);
});
test('marketing consent is not part of the required fields', () => assert.deepStrictEqual(I.validateSignup({ ...ok, marketing: false }), []));
test('credential numbers follow the issued format only', () => {
  assert.ok(I.CERT_RE.test('LIV-2026-ABCD2345'));
  assert.ok(!I.CERT_RE.test('LIV-2026-abcd2345'));
  assert.ok(!I.CERT_RE.test('LIV-2026-ABCD0001'));
});
test('emails are compared in lower case', () => assert.strictEqual(I.normEmail('  Maria@Example.COM '), 'maria@example.com'));
