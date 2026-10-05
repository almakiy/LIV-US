// Time-based one-time passwords (RFC 6238, HMAC-SHA1, 30 s steps, 6 digits) for authenticator apps. No external dependency.
const crypto = require('crypto');
const cfg = require('../config');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  let bits = 0; let value = 0; const out = [];
  for (const ch of String(str).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '')) {
    const i = B32.indexOf(ch); if (i < 0) throw new Error('Invalid base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
const generateSecret = () => base32Encode(crypto.randomBytes(20));
const stepAt = (ms = Date.now()) => Math.floor(ms / 30000);

function code(secretB32, step, digits = 6) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', base32Decode(secretB32)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, '0');
}
/** Returns the matching time step (so it can be stored and never accepted again), or null. Accepts one step either side for clock drift. */
function verify(secretB32, input, { lastStep = 0, now = Date.now() } = {}) {
  const c = String(input || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const cur = stepAt(now);
  for (const s of [cur - 1, cur, cur + 1]) {
    const expected = code(secretB32, s);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c)) && s > Number(lastStep)) return s;
  }
  return null;
}
const otpauthUri = (email, secretB32, issuer = cfg.brand) => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

// The shared secret is stored encrypted (AES-256-GCM). The key comes from TOTP_ENCRYPTION_KEY, or is derived from CERT_HMAC_SECRET (which must never change).
const key = () => crypto.createHash('sha256').update(`totp|${process.env.TOTP_ENCRYPTION_KEY || cfg.certHmacSecret}`).digest();
function encryptSecret(plain) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decryptSecret(blob) {
  const [iv, tag, enc] = String(blob).split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

// Single-use recovery codes: shown once, stored as SHA-256 hashes.
const RC_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newRecoveryCodes = (n = 10) => Array.from({ length: n }, () => { const b = crypto.randomBytes(8); return `${[...b.subarray(0, 4)].map((x) => RC_ALPHA[x % RC_ALPHA.length]).join('')}-${[...b.subarray(4)].map((x) => RC_ALPHA[x % RC_ALPHA.length]).join('')}`; });
const normRecovery = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashRecovery = (c) => crypto.createHash('sha256').update(`rc|${normRecovery(c)}`).digest('hex');

module.exports = { base32Encode, base32Decode, generateSecret, code, verify, stepAt, otpauthUri, encryptSecret, decryptSecret, newRecoveryCodes, hashRecovery, normRecovery };
