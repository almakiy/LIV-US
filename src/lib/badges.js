// Digital badges as Open Badges 3.0 credentials (W3C Verifiable Credentials), hosted by LIV (owner decision, October 25, 2026).
// Each badge is served as JSON and as a VC-JWT signed with an Ed25519 key; the public key is published as a JWKS so anyone
// can check a badge outside this site. A badge exists only while its record is valid: a revoked credential, an ended
// membership or a preview record has no badge. A Training Completion Credential has no end date, so its badge has none.
const crypto = require('crypto');
const cfg = require('../config');
const { q } = require('../db');
const { qrToken, safeEqual } = require('./crypto');
const { verifyCertificate } = require('./verify');
const { RECORD_TYPES } = require('./schemes');

const CONTEXT = ['https://www.w3.org/ns/credentials/v2', 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'];

// The signing key comes from BADGE_SIGNING_KEY (an Ed25519 private key in PEM) or, when absent, is derived from
// CERT_HMAC_SECRET so every deployment has a stable key without a new secret. Changing either changes the key id.
let KEY;
function key() {
  if (KEY) return KEY;
  let priv;
  if (process.env.BADGE_SIGNING_KEY) priv = crypto.createPrivateKey(process.env.BADGE_SIGNING_KEY.replace(/\\n/g, '\n'));
  else {
    const seed = Buffer.from(crypto.hkdfSync('sha256', cfg.certHmacSecret, 'liv-badges', 'ed25519-signing-key', 32));
    priv = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  }
  const jwk = crypto.createPublicKey(priv).export({ format: 'jwk' });
  const kid = crypto.createHash('sha256').update(jwk.x).digest('base64url').slice(0, 16);
  KEY = { priv, jwk: { ...jwk, kid, alg: 'EdDSA', use: 'sig' }, kid };
  return KEY;
}

const issuerId = () => `${cfg.baseUrl}/badges/issuer.json`;
function issuerProfile() {
  return {
    '@context': CONTEXT, id: issuerId(), type: ['Profile'], name: 'LIV', url: cfg.baseUrl,
    description: 'LIV issues and verifies training records and memberships.',
    publicKeys: `${cfg.baseUrl}/badges/jwks.json`,
  };
}
const jwks = () => ({ keys: [key().jwk] });

function sign(vc) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = { alg: 'EdDSA', typ: 'vc+jwt', kid: `${cfg.baseUrl}/badges/jwks.json#${key().kid}` };
  const payload = { ...vc, iss: vc.issuer.id, jti: vc.id, sub: vc.credentialSubject.id || undefined, nbf: Math.floor(Date.parse(vc.validFrom) / 1000), ...(vc.validUntil ? { exp: Math.floor(Date.parse(vc.validUntil) / 1000) } : {}) };
  const input = `${b64(header)}.${b64(payload)}`;
  return `${input}.${crypto.sign(null, Buffer.from(input), key().priv).toString('base64url')}`;
}
/** Checks a VC-JWT against our key; returns the payload or null. */
function verifyJwt(jwt) {
  const [h, p, s] = String(jwt || '').split('.');
  if (!h || !p || !s) return null;
  const ok = crypto.verify(null, Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: key().jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
  return ok ? JSON.parse(Buffer.from(p, 'base64url').toString()) : null;
}

// The recipient is identified by a salted hash of the email, so the badge proves who holds it without publishing the address.
function identity(email, salt) {
  return { type: 'IdentityObject', identityType: 'emailAddress', hashed: true, salt, identityHash: 'sha256$' + crypto.createHash('sha256').update(String(email).trim().toLowerCase() + salt).digest('hex') };
}
const isoDay = (d) => `${(d instanceof Date ? d.toISOString() : String(d)).slice(0, 10)}T00:00:00Z`;
const isoEnd = (d) => `${(d instanceof Date ? d.toISOString() : String(d)).slice(0, 10)}T23:59:59Z`;

/** Badge for a credential, served only with the token printed in its QR code (as for the PDF). */
async function credentialBadge(number, token) {
  const out = await verifyCertificate(number, { token, channel: 'badge' });
  if (!token || out.result === 'tampered' || out.result === 'not_found' || out.result === 'invalid_format' || out.result === 'preview') return { status: 404 };
  if (out.result === 'unavailable') return { status: 503 };
  const c = out.cert;
  if (!safeEqual(String(token).toLowerCase(), qrToken(c.verification_hash))) return { status: 404 };
  if (out.result === 'revoked') return { status: 410, body: { status: 'revoked', id: c.cert_number } };
  const rt = RECORD_TYPES[c.record_type || 'training_completion'] || RECORD_TYPES.training_completion;
  const verifyUrl = `${cfg.baseUrl}/verify/${c.cert_number}`;
  const vc = {
    '@context': CONTEXT,
    id: `${cfg.baseUrl}/badges/credentials/${c.cert_number}`,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: { id: issuerId(), type: ['Profile'], name: 'LIV', url: cfg.baseUrl },
    name: `${rt.label}: ${c.course_name}`,
    validFrom: isoDay(c.issue_date),
    ...(c.expiry_date && rt.expires !== false ? { validUntil: isoEnd(c.expiry_date) } : {}),
    credentialSubject: {
      type: ['AchievementSubject'],
      name: `${c.recipient_first_name} ${c.recipient_last_name}`,
      identifier: [identity(c.recipient_email, c.cert_number)],
      activityEndDate: isoDay(c.completion_date),
      achievement: {
        id: `${verifyUrl}#achievement`, type: ['Achievement'],
        achievementType: rt.assessed ? 'Certification' : 'CertificateOfCompletion',
        name: c.course_name,
        description: rt.disclosure,
        criteria: { narrative: `Completed the training course "${c.course_name}" delivered by ${c.company_name}, an Authorized Training Provider of LIV.${rt.assessed ? '' : ' No examination. This record confirms completion of training only; it is not a professional qualification or certification.'}` },
        creator: { id: issuerId(), type: ['Profile'], name: 'LIV' },
      },
    },
    evidence: [{ id: verifyUrl, type: ['Evidence'], name: 'Public verification page' }],
  };
  return { status: 200, body: vc };
}

const memberToken = (number) => crypto.createHmac('sha256', cfg.certHmacSecret).update('membership-badge:' + number).digest('hex').slice(0, 16);
/** Badge for a membership that is active today. It states membership only, never a qualification. */
async function membershipBadge(number, token) {
  const n = String(number || '').trim().toUpperCase();
  if (!/^LIVM-[A-Z2-9]{8}$/.test(n) || !token || !safeEqual(String(token).toLowerCase(), memberToken(n))) return { status: 404 };
  const { rows: [m] } = await q(`SELECT m.member_number, m.starts_on, m.ends_on, m.terms->>'plan_name' AS plan, m.is_preview, u.email, u.full_name, u.card_show_name
    FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.member_number = $1 AND m.status = 'active' AND m.starts_on <= current_date AND m.ends_on >= current_date ORDER BY m.ends_on DESC LIMIT 1`, [n]);
  if (!m) {
    const { rows: [any] } = await q('SELECT is_preview FROM memberships WHERE member_number = $1 LIMIT 1', [n]);
    return any && !any.is_preview ? { status: 410, body: { status: 'not_active', id: n } } : { status: 404 };
  }
  if (m.is_preview) return { status: 404 };
  const vc = {
    '@context': CONTEXT,
    id: `${cfg.baseUrl}/badges/memberships/${n}/${String(m.ends_on instanceof Date ? m.ends_on.toISOString() : m.ends_on).slice(0, 10)}`,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: { id: issuerId(), type: ['Profile'], name: 'LIV', url: cfg.baseUrl },
    name: `${m.plan} (membership)`,
    validFrom: isoDay(m.starts_on), validUntil: isoEnd(m.ends_on),
    credentialSubject: {
      type: ['AchievementSubject'],
      ...(m.card_show_name ? { name: m.full_name } : {}),
      identifier: [identity(m.email, n)],
      achievement: {
        id: `${cfg.baseUrl}/membership#${encodeURIComponent(m.plan)}`, type: ['Achievement'], achievementType: 'Membership', name: m.plan,
        description: 'Membership of the LIV professional community. It is not a professional qualification, a certification or an accreditation.',
        criteria: { narrative: 'Holds a LIV membership for the period stated.' },
        creator: { id: issuerId(), type: ['Profile'], name: 'LIV' },
      },
    },
    evidence: [{ id: `${cfg.baseUrl}/membership/verify/${n}`, type: ['Evidence'], name: 'Public membership check' }],
  };
  return { status: 200, body: vc };
}

module.exports = { issuerProfile, jwks, sign, verifyJwt, credentialBadge, membershipBadge, memberToken };
