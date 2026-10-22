// Individuals portal (M1): accounts for people, email verification, and the safe link between a person and their credentials.
// A credential is linked only when its privately recorded recipient email is one of the person's verified addresses, or after
// a LIV staff review with a recorded reason. The certificate number or a name match alone is never enough. A link never
// changes the certificate row, its record hash or its PDF.
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { sha256, randomToken } = require('./crypto');

class IndividualError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CERT_RE = /^LIV-\d{4}-[A-Z2-9]{8}$/;
const TOKEN_HOURS = { verify_email: 72, extra_email: 72, password_reset: 1 };
const hasNonLatin = (v) => [...String(v ?? '')].some((ch) => /\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch));
const normEmail = (e) => String(e || '').trim().toLowerCase();

/** Sign-up form rules. Returns a list of messages (empty when valid). */
function validateSignup({ full_name, email, password, confirm, terms }) {
  const errors = [];
  const name = String(full_name || '').trim();
  if (name.length < 2 || name.length > 200) errors.push('Enter your full name (2 to 200 characters).');
  else if (hasNonLatin(name)) errors.push('Write your name in English (Latin letters). The platform does not translate or convert names.');
  if (!EMAIL_RE.test(normEmail(email))) errors.push('Enter a valid email address.');
  if (String(password || '').length < 10) errors.push('The password must be at least 10 characters.');
  else if (password !== confirm) errors.push('The passwords do not match.');
  if (!terms) errors.push('Confirm that you have read the privacy notice.');
  return errors;
}

async function newToken(userId, purpose, email) {
  const raw = randomToken();
  await q(`INSERT INTO individual_tokens (user_id, purpose, email, token_hash, expires_at) VALUES ($1,$2,$3,$4, now() + make_interval(hours => $5))`,
    [userId, purpose, normEmail(email), sha256(raw), TOKEN_HOURS[purpose]]);
  return raw;
}

/** Uses a token once. Returns its row, or null when unknown, used or expired. */
async function consumeToken(raw, purpose) {
  if (!/^[a-f0-9]{48}$/.test(String(raw || ''))) return null;
  const { rows: [t] } = await q(`UPDATE individual_tokens SET used_at = now() WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now() RETURNING *`,
    [sha256(raw), purpose]);
  return t || null;
}

/** Every address the person has proved they control. */
async function verifiedEmails(userId) {
  const { rows } = await q(`SELECT lower(email) AS email FROM users WHERE id = $1 AND role = 'individual' AND email_verified_at IS NOT NULL
    UNION SELECT lower(email) FROM individual_emails WHERE user_id = $1 AND verified_at IS NOT NULL`, [userId]);
  return rows.map((r) => r.email);
}

const CERT_COLS = `c.id, c.cert_number, c.verification_hash, c.course_name, c.completion_date, c.issue_date, c.status, c.record_type, p.company_name, p.is_preview`;

async function linked(userId) {
  const { rows } = await q(`SELECT cl.id AS claim_id, cl.method, cl.claimed_at, ${CERT_COLS}
    FROM credential_claims cl JOIN certificates c ON c.id = cl.certificate_id JOIN platforms p ON p.id = c.platform_id
    WHERE cl.user_id = $1 AND cl.released_at IS NULL ORDER BY c.issue_date DESC, c.cert_number`, [userId]);
  return rows;
}

/** Credentials recorded under one of the person's verified addresses and not linked to anyone. */
async function claimable(userId) {
  const emails = await verifiedEmails(userId);
  if (!emails.length) return [];
  const { rows } = await q(`SELECT ${CERT_COLS} FROM certificates c JOIN platforms p ON p.id = c.platform_id
    WHERE lower(c.recipient_email) = ANY($1) AND NOT EXISTS (SELECT 1 FROM credential_claims cl WHERE cl.certificate_id = c.id AND cl.released_at IS NULL)
    ORDER BY c.issue_date DESC, c.cert_number`, [emails]);
  return rows;
}

/** Links a credential by email match. The check is repeated inside the transaction; a second link is refused by the database. */
async function claimByEmail(user, certificateId) {
  return tx(async (c) => {
    const { rows: [u] } = await c.query(`SELECT id, email, email_verified_at FROM users WHERE id = $1 AND role = 'individual' AND disabled_at IS NULL`, [user.id]);
    if (!u) throw new IndividualError('Not available.', 403);
    const { rows: em } = await c.query(`SELECT lower(email) AS email FROM users WHERE id = $1 AND email_verified_at IS NOT NULL
      UNION SELECT lower(email) FROM individual_emails WHERE user_id = $1 AND verified_at IS NOT NULL`, [u.id]);
    if (!em.length) throw new IndividualError('Verify your email address first.', 403);
    const { rows: [cert] } = await c.query(`SELECT id, cert_number, lower(recipient_email) AS email FROM certificates WHERE id = $1 FOR UPDATE`, [certificateId]);
    // Same answer whether the credential does not exist or belongs to another address: nothing is revealed.
    if (!cert || !em.some((e) => e.email === cert.email)) throw new IndividualError('This credential cannot be linked to your account from here. Send a request instead.', 404);
    const { rows: [taken] } = await c.query(`SELECT user_id FROM credential_claims WHERE certificate_id = $1 AND released_at IS NULL`, [cert.id]);
    if (taken) throw new IndividualError(taken.user_id === u.id ? 'This credential is already in your account.' : 'This credential is linked to another account. Contact LIV support.', 409);
    const { rows: [cl] } = await c.query(`INSERT INTO credential_claims (certificate_id, user_id, method) VALUES ($1,$2,'email_match') RETURNING id`, [cert.id, u.id]);
    await audit({ user: u, action: 'credential.claim', target: cert.cert_number, metadata: { method: 'email_match' } }, c);
    return { id: cl.id, cert_number: cert.cert_number };
  });
}

async function requestClaim(user, { cert_number, statement }) {
  const num = String(cert_number || '').trim().toUpperCase();
  const text = String(statement || '').trim();
  if (!CERT_RE.test(num)) throw new IndividualError('Enter the credential number as printed, for example LIV-2026-ABCD2345.');
  if (text.length < 20 || text.length > 2000) throw new IndividualError('Explain in 20 to 2000 characters why this credential is yours (for example, the email you used with the training provider).');
  if (hasNonLatin(text)) throw new IndividualError('Write the explanation in English (Latin letters).');
  const { rows: [{ n }] } = await q(`SELECT count(*)::int AS n FROM credential_claim_requests WHERE user_id = $1 AND created_at > now() - interval '1 day'`, [user.id]);
  if (n >= 5) throw new IndividualError('You have sent the maximum number of requests for today. Try again tomorrow.', 429);
  try {
    const { rows: [r] } = await q(`INSERT INTO credential_claim_requests (user_id, cert_number, statement) VALUES ($1,$2,$3) RETURNING id`, [user.id, num, text]);
    await audit({ user, action: 'credential.claim_request', target: num });
    return r;
  } catch (e) {
    if (e.code === '23505') throw new IndividualError('You already have an open request for this credential.', 409);
    throw e;
  }
}

/** A LIV staff decision on a claim request. Approval links the credential; both outcomes need a reason. */
async function decideRequest(staff, requestId, { approve, reason }) {
  const why = String(reason || '').trim();
  if (why.length < 5) throw new IndividualError('Record a reason for the decision.');
  return tx(async (c) => {
    const { rows: [r] } = await c.query(`SELECT * FROM credential_claim_requests WHERE id = $1 FOR UPDATE`, [requestId]);
    if (!r) throw new IndividualError('Request not found.', 404);
    if (r.status !== 'submitted') throw new IndividualError('This request has already been decided.', 409);
    let certId = null;
    if (approve) {
      const { rows: [cert] } = await c.query(`SELECT id FROM certificates WHERE cert_number = $1`, [r.cert_number]);
      if (!cert) throw new IndividualError('No credential has this number. Refuse the request instead.');
      const { rows: [taken] } = await c.query(`SELECT 1 FROM credential_claims WHERE certificate_id = $1 AND released_at IS NULL`, [cert.id]);
      if (taken) throw new IndividualError('This credential is already linked to an account. Refuse, or release the existing link first.', 409);
      await c.query(`INSERT INTO credential_claims (certificate_id, user_id, method, request_id) VALUES ($1,$2,'staff_review',$3)`, [cert.id, r.user_id, r.id]);
      certId = cert.id;
    }
    await c.query(`UPDATE credential_claim_requests SET status = $1, decided_by = $2, decided_at = now(), decision_reason = $3 WHERE id = $4`,
      [approve ? 'approved' : 'refused', staff.id, why.slice(0, 2000), r.id]);
    await audit({ user: staff, action: approve ? 'credential.claim_approve' : 'credential.claim_refuse', target: r.cert_number, metadata: { request: r.id, reason: why.slice(0, 500) } }, c);
    return { ...r, approved: Boolean(approve), certificate_id: certId };
  });
}

async function withdrawRequest(user, requestId) {
  const { rowCount } = await q(`UPDATE credential_claim_requests SET status = 'withdrawn' WHERE id = $1 AND user_id = $2 AND status = 'submitted'`, [requestId, user.id]);
  if (!rowCount) throw new IndividualError('Request not found.', 404);
}

/** The person removes a credential from their account. The credential itself is unchanged. */
async function release(user, claimId) {
  const { rows: [cl] } = await q(`UPDATE credential_claims SET released_at = now(), released_reason = 'released by the account holder'
    WHERE id = $1 AND user_id = $2 AND released_at IS NULL RETURNING certificate_id`, [claimId, user.id]);
  if (!cl) throw new IndividualError('Not found.', 404);
  const { rows: [c] } = await q('SELECT cert_number FROM certificates WHERE id = $1', [cl.certificate_id]);
  await audit({ user, action: 'credential.release', target: c?.cert_number });
}

/** Everything the platform holds about the person's account, for a data export. Secrets and hashes are left out. */
async function exportData(userId) {
  const one = async (sql, p) => (await q(sql, p)).rows;
  const [account] = await one(`SELECT id, full_name, email, email_verified_at, marketing_opt_in, marketing_opt_in_at, totp_enabled, created_at, last_login_at, closure_requested_at
    FROM users WHERE id = $1`, [userId]);
  return {
    exported_at: new Date().toISOString(),
    account,
    extra_emails: await one('SELECT email, verified_at, created_at FROM individual_emails WHERE user_id = $1 ORDER BY created_at', [userId]),
    linked_credentials: (await linked(userId)).map((c) => ({ cert_number: c.cert_number, course_name: c.course_name, provider: c.company_name, issue_date: c.issue_date, status: c.status, linked_at: c.claimed_at, method: c.method })),
    claim_requests: await one('SELECT cert_number, statement, status, decision_reason, created_at, decided_at FROM credential_claim_requests WHERE user_id = $1 ORDER BY created_at', [userId]),
    memberships: await one(`SELECT member_number, status, source, terms->>'plan_name' AS plan, starts_on, ends_on, renewal_declined_at, created_at FROM memberships WHERE user_id = $1 AND status <> 'void' ORDER BY created_at`, [userId]),
    invoices: await one(`SELECT number, status, issue_date, total_cents, amount_paid_cents, currency FROM invoices WHERE user_id = $1 AND status <> 'draft' ORDER BY created_at`, [userId]),
    support_messages: await one('SELECT topic, message, created_at FROM contact_messages WHERE user_id = $1 ORDER BY created_at', [userId]),
  };
}

module.exports = { IndividualError, EMAIL_RE, CERT_RE, normEmail, hasNonLatin, validateSignup, newToken, consumeToken, verifiedEmails, linked, claimable, claimByEmail, requestClaim, decideRequest, withdrawRequest, release, exportData };
