const crypto = require('crypto');
const cfg = require('../config');

// Unambiguous alphabet (no 0/O, 1/I/L)
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomCode(len) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHA[bytes[i] % ALPHA.length];
  return s;
}
const newCertNumber = (year = new Date().getUTCFullYear()) => `LIV-${year}-${randomCode(8)}`;

const fmtDate = (d) => (d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : '');

// Canonical string — order and normalization must never change once certificates are issued.
function canonical(c) {
  return [
    'v1',
    c.cert_number,
    c.platform_id,
    String(c.first_name).trim(),
    String(c.last_name).trim(),
    String(c.email).trim().toLowerCase(),
    String(c.course_name).trim(),
    c.grade ? String(c.grade).trim() : '',
    fmtDate(c.completion_date),
    fmtDate(c.issue_date),
    fmtDate(c.expiry_date),
  ].join('|');
}
const certHmac = (c) => crypto.createHmac('sha256', cfg.certHmacSecret).update(canonical(c)).digest('hex');
const qrToken = (hash) => hash.slice(0, 16);

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
function safeEqual(a, b) {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
function newApiKey() {
  const prefix = 'liv_' + crypto.randomBytes(4).toString('hex');
  const key = `${prefix}_${crypto.randomBytes(24).toString('base64url')}`;
  return { key, prefix, hash: sha256(key) };
}
const ipHash = (ip) => sha256(`${cfg.certHmacSecret}:${ip || ''}`);
const randomToken = () => crypto.randomBytes(24).toString('hex');

module.exports = { newCertNumber, certHmac, qrToken, sha256, safeEqual, newApiKey, ipHash, randomToken, fmtDate, randomCode };
