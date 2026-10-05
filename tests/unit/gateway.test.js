const test = require('node:test');
const assert = require('node:assert');
const totp = require('../../src/lib/totp');
const { hasPlaceholder, STARTER_BODY, STARTER_TITLE } = require('../../src/lib/agreements');

const RFC_SECRET = totp.base32Encode(Buffer.from('12345678901234567890')); // RFC 6238 test key (SHA-1)

test('TOTP matches the RFC 6238 test vectors', () => {
  assert.strictEqual(totp.code(RFC_SECRET, Math.floor(59 / 30), 8), '94287082');
  assert.strictEqual(totp.code(RFC_SECRET, Math.floor(1111111109 / 30), 8), '07081804');
  assert.strictEqual(totp.code(RFC_SECRET, Math.floor(20000000000 / 30), 8), '65353130');
});

test('base32 round-trips and rejects junk', () => {
  const b = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
  assert.deepStrictEqual(totp.base32Decode(totp.base32Encode(b)), b);
  assert.throws(() => totp.base32Decode('abc!'), /Invalid/);
  assert.match(totp.generateSecret(), /^[A-Z2-7]{32}$/);
});

test('verification accepts one step of drift, returns the step, and never accepts a step twice', () => {
  const now = 1_700_000_000_000; const step = totp.stepAt(now);
  const c = (s) => totp.code(RFC_SECRET, s);
  assert.strictEqual(totp.verify(RFC_SECRET, c(step), { now }), step);
  assert.strictEqual(totp.verify(RFC_SECRET, c(step - 1), { now }), step - 1);
  assert.strictEqual(totp.verify(RFC_SECRET, c(step + 1), { now }), step + 1);
  assert.strictEqual(totp.verify(RFC_SECRET, c(step + 2), { now }), null);
  assert.strictEqual(totp.verify(RFC_SECRET, c(step), { now, lastStep: step }), null, 'replay of the same step is refused');
  assert.strictEqual(totp.verify(RFC_SECRET, '12345', { now }), null);
  assert.strictEqual(totp.verify(RFC_SECRET, 'abcdef', { now }), null);
  assert.strictEqual(totp.verify(RFC_SECRET, ` ${c(step).slice(0, 3)} ${c(step).slice(3)} `, { now }), step, 'spaces in the typed code are ignored');
});

test('the shared secret is encrypted at rest and tamper-evident', () => {
  const s = totp.generateSecret(); const blob = totp.encryptSecret(s);
  assert.ok(!blob.includes(s));
  assert.strictEqual(totp.decryptSecret(blob), s);
  assert.notStrictEqual(totp.encryptSecret(s), blob, 'random IV per encryption');
  const parts = blob.split('.'); parts[2] = Buffer.from('tampered').toString('base64');
  assert.throws(() => totp.decryptSecret(parts.join('.')));
});

test('recovery codes: unique, formatted, hashed, and matched ignoring case and dashes', () => {
  const codes = totp.newRecoveryCodes(10);
  assert.strictEqual(new Set(codes).size, 10);
  assert.ok(codes.every((c) => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c)));
  assert.strictEqual(totp.hashRecovery(codes[0]), totp.hashRecovery(codes[0].toLowerCase().replace('-', ' ')));
  assert.notStrictEqual(totp.hashRecovery(codes[0]), totp.hashRecovery(codes[1]));
  assert.match(totp.hashRecovery(codes[0]), /^[0-9a-f]{64}$/);
});

test('otpauth URI carries issuer, account and secret', () => {
  const u = totp.otpauthUri('a.b@example.com', 'ABCDEF', 'LIV');
  assert.ok(u.startsWith('otpauth://totp/LIV:a.b%40example.com?secret=ABCDEF&issuer=LIV'));
});

test('the agreement starter outline cannot be activated until placeholders are replaced', () => {
  assert.ok(hasPlaceholder(STARTER_BODY));
  assert.ok(STARTER_TITLE.length > 5);
  assert.ok(!hasPlaceholder(STARTER_BODY.replace(/\[PLACEHOLDER[^\]]*\]/g, 'Final text.')));
});
