const { q } = require('../db');
const { certHmac, qrToken, safeEqual, ipHash } = require('./crypto');

const CERT_RE = /^LIV-\d{4}-[A-Z2-9]{8}$/;

/**
 * Returns { result: 'valid'|'revoked'|'not_found'|'tampered'|'invalid_format', cert?, platform? }
 */
async function verifyCertificate(rawNumber, { token, lastName, ip, channel = 'web' } = {}) {
  const certNumber = String(rawNumber || '').trim().toUpperCase();
  let out;
  if (!CERT_RE.test(certNumber)) out = { result: 'invalid_format' };
  else {
    const { rows: [row] } = await q(
      `SELECT c.*, p.company_name, p.logo_path, p.primary_color, p.accreditation_status, p.website
         FROM certificates c JOIN platforms p ON p.id = c.platform_id
        WHERE c.cert_number = $1`,
      [certNumber]
    );
    if (!row) out = { result: 'not_found' };
    else if (lastName && row.recipient_last_name.trim().toLowerCase() !== String(lastName).trim().toLowerCase()) out = { result: 'not_found' };
    else {
      const expected = certHmac({
        cert_number: row.cert_number, platform_id: row.platform_id,
        first_name: row.recipient_first_name, last_name: row.recipient_last_name, email: row.recipient_email,
        course_name: row.course_name, grade: row.grade, completion_date: row.completion_date,
        issue_date: row.issue_date, expiry_date: row.expiry_date,
      });
      const intact = safeEqual(expected, row.verification_hash);
      const tokenOk = !token || safeEqual(String(token).toLowerCase(), qrToken(row.verification_hash));
      let result;
      if (!intact || !tokenOk) result = 'tampered';
      else if (row.status === 'revoked') result = 'revoked';
      else result = 'valid';
      out = { result, cert: row };
    }
  }
  await q(`INSERT INTO verification_logs (cert_number, certificate_id, result, ip_hash, channel) VALUES ($1,$2,$3,$4,$5)`,
    [certNumber.slice(0, 40), out.cert?.id || null, out.result, ipHash(ip), channel]).catch(() => {});
  return out;
}

/** Public-safe projection — never exposes the trainee email or internal ids. */
function publicView(out, baseUrl) {
  if (!out.cert) return { result: out.result };
  const c = out.cert;
  const d = (x) => x || null;
  return {
    result: out.result,
    certificate: {
      cert_number: c.cert_number,
      recipient_name: `${c.recipient_first_name} ${c.recipient_last_name}`,
      course_name: c.course_name,
      completion_date: d(c.completion_date),
      issue_date: d(c.issue_date),
      status: c.status,
      revoked_at: c.revoked_at,
      issuer: { name: c.company_name, accreditation_status: c.accreditation_status, website: c.website },
      verify_url: `${baseUrl}/verify/${c.cert_number}`,
    },
  };
}

module.exports = { verifyCertificate, publicView, CERT_RE };
