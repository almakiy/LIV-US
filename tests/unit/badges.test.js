const test = require('node:test');
const assert = require('node:assert');
const B = require('../../src/lib/badges');

const vc = { id: 'https://example.test/badges/credentials/X', issuer: { id: 'https://example.test/badges/issuer.json' }, validFrom: '2026-10-01T00:00:00Z', credentialSubject: { name: 'A B' } };

test('a badge is signed with EdDSA and checks against the published key', () => {
  const jwt = B.sign(vc);
  const head = JSON.parse(Buffer.from(jwt.split('.')[0], 'base64url'));
  assert.strictEqual(head.alg, 'EdDSA');
  assert.ok(head.kid.endsWith('#' + B.jwks().keys[0].kid));
  assert.strictEqual(B.verifyJwt(jwt).credentialSubject.name, 'A B');
});
test('a changed badge fails the check', () => {
  const [h, , s] = B.sign(vc).split('.');
  const forged = Buffer.from(JSON.stringify({ ...vc, credentialSubject: { name: 'C D' } })).toString('base64url');
  assert.strictEqual(B.verifyJwt(`${h}.${forged}.${s}`), null);
});
test('the published key set holds a public key only', () => {
  const k = B.jwks().keys[0];
  assert.strictEqual(k.kty, 'OKP'); assert.strictEqual(k.crv, 'Ed25519'); assert.ok(!('d' in k));
});
test('a completion badge without an end date carries no exp', () => {
  const p = B.verifyJwt(B.sign(vc)); assert.ok(!('exp' in p));
});
test('membership badge tokens are stable per number and differ between numbers', () => {
  assert.strictEqual(B.memberToken('LIVM-AAAA2222'), B.memberToken('LIVM-AAAA2222'));
  assert.notStrictEqual(B.memberToken('LIVM-AAAA2222'), B.memberToken('LIVM-BBBB3333'));
});
test('the issuer profile describes what LIV does and makes no claim either way', () => {
  assert.ok(!/accredit|ISO/i.test(B.issuerProfile().description));
});
