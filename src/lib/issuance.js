const fs = require('fs');
const path = require('path');
const { q, tx } = require('../db');
const cfg = require('../config');
const { newCertNumber, certHmac, qrToken, fmtDate, normalizeId, idHash, idLast4 } = require('./crypto');
const { renderCertificate } = require('./pdf');
const { audit } = require('./audit');
const { putFile } = require('./files');

const FIELDS = ['serial_no', 'full_name', 'first_name', 'last_name', 'national_id', 'email', 'course_name', 'completion_date'];
// email, course and date are always required; the name comes either as full_name or as first_name + last_name.
const REQUIRED = ['email', 'course_name', 'completion_date'];
const FIELD_LABELS = {
  serial_no: 'Serial / reference no.', full_name: 'Full name', first_name: 'First name', last_name: 'Last name', national_id: 'National / ID number',
  email: 'Email', course_name: 'Course name', completion_date: 'Completion date',
};
const hasName = (mapping) => !!(mapping.full_name || (mapping.first_name && mapping.last_name));

// Header names are normalized (case and punctuation) before matching. The platform is English-only for now.
const norm = (h) => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const SYNONYMS = Object.fromEntries(Object.entries({
  serial_no: ['serial_no', 'serial', 'serial_number', 'no', 'number', 'ref', 'ref_no', 'reference', 'reference_no', 'trainee_no'],
  full_name: ['full_name', 'fullname', 'name', 'trainee', 'trainee_name', 'student', 'student_name', 'participant', 'participant_name'],
  first_name: ['first_name', 'firstname', 'first', 'given_name', 'fname'],
  last_name: ['last_name', 'lastname', 'last', 'surname', 'family_name', 'lname'],
  national_id: ['national_id', 'id_number', 'id_no', 'id', 'identity', 'identity_number', 'iqama', 'nid', 'government_id'],
  email: ['email', 'e_mail', 'email_address', 'mail'],
  course_name: ['course_name', 'course', 'coursename', 'program', 'training', 'course_title'],
  completion_date: ['completion_date', 'completed', 'completed_on', 'date', 'completion', 'date_completed'],
}).map(([k, v]) => [k, v.map(norm)]));

function autoMap(headers) {
  const map = {}; const used = new Set();
  for (const f of FIELDS) {
    const hit = headers.find((h) => !used.has(h) && SYNONYMS[f].includes(norm(h)));
    map[f] = hit || '';
    if (hit) used.add(hit);
  }
  // When first/last name columns exist, they win over a generic "name" column.
  if (map.first_name && map.last_name) map.full_name = '';
  return map;
}

/** Template the provider downloads: UTF-8 with BOM so Excel opens it correctly. */
const TEMPLATE_HEADER = ['serial_no', 'full_name', 'national_id', 'email', 'course_name', 'completion_date'];
const TEMPLATE_ROWS = [
  ['1', 'Jane Doe', '1234567890', 'jane.doe@example.com', 'Construction Site Safety Fundamentals', '2026-09-15'],
  ['2', 'John Smith', '2987654321', 'john.smith@example.com', 'ISO 45001 Lead Auditor', '09/20/2026'],
];
const sampleCsv = () => '\uFEFF' + [TEMPLATE_HEADER, ...TEMPLATE_ROWS].map((r) => r.join(',')).join('\r\n') + '\r\n';

// The platform is English-only for now: letters and digits must be Latin script (accents such as in "Jose" are fine).
const hasNonLatin = (v) => [...String(v || '')].some((ch) => /[\p{L}\p{N}]/u.test(ch) && !/[0-9]/.test(ch) && !/\p{Script=Latin}/u.test(ch));

const maskId = (last4) => (last4 ? `•••• ${last4}` : '');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Accepts YYYY-MM-DD or M/D/YYYY (US). Returns 'YYYY-MM-DD' or null. */
function parseDate(v) {
  const s = String(v || '').trim();
  let y, m, d;
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (mt) [y, m, d] = [mt[1], mt[2], mt[3]].map(Number);
  else if ((mt = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) [m, d, y] = [mt[1], mt[2], mt[3]].map(Number);
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function addMonths(isoDate, months) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, last));
  return dt.toISOString().slice(0, 10);
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

/** rows: array of objects keyed by canonical FIELDS. Returns [{index, data, errors}] */
async function validateRows(rows, platformId) {
  const today = todayUtc();
  const seen = new Map();
  const out = rows.map((r, i) => {
    const data = {};
    for (const f of FIELDS) data[f] = r[f] == null ? '' : String(r[f]).trim();
    data.email = data.email.toLowerCase();
    const errors = [];
    // Name: use first/last when both are given, otherwise split full_name (last word = last name).
    if (!(data.first_name && data.last_name) && data.full_name) {
      const words = data.full_name.split(/\s+/).filter(Boolean);
      if (words.length >= 2) { data.first_name = words.slice(0, -1).join(' '); data.last_name = words[words.length - 1]; }
      else errors.push('full_name must include at least a first and a last name');
    }
    if (!errors.length && !(data.first_name && data.last_name)) errors.push('name is required (a full name, or first and last name)');
    for (const f of REQUIRED) if (!data[f]) errors.push(`${f} is required`);
    data.full_name = `${data.first_name} ${data.last_name}`.trim();
    if (data.first_name.length > 100 || data.last_name.length > 100) errors.push('name too long (max 100)');
    if (data.serial_no.length > 50) errors.push('serial_no too long (max 50)');
    for (const f of ['first_name', 'last_name', 'course_name', 'serial_no', 'email']) {
      if (hasNonLatin(data[f])) errors.push(`${f} must use English (Latin) letters only`);
    }
    if (data.national_id) {
      data.national_id = normalizeId(data.national_id);
      if (!/^[A-Z0-9]{5,20}$/.test(data.national_id)) errors.push('national_id must be 5–20 letters or digits');
    }
    if (data.email && !EMAIL_RE.test(data.email)) errors.push('invalid email');
    if (data.course_name.length > 255) errors.push('course_name too long (max 255)');
    if (data.completion_date) {
      const p = parseDate(data.completion_date);
      if (!p) errors.push('completion_date must be YYYY-MM-DD or MM/DD/YYYY');
      else if (p > today) errors.push('completion_date is in the future');
      else if (p < '1990-01-01') errors.push('completion_date is too old');
      else data.completion_date = p;
    }
    if (!errors.length) {
      const key = `${data.email}|${data.course_name.toLowerCase()}|${data.completion_date}`;
      if (seen.has(key)) errors.push(`duplicate of line ${seen.get(key) + 2} in this file`);
      else seen.set(key, i);
    }
    return { index: i, data, errors };
  });

  // Existing active certificates for the same person + course + date
  const candidates = out.filter((r) => !r.errors.length);
  if (candidates.length) {
    const { rows: existing } = await q(
      `SELECT recipient_email, lower(course_name) AS course, completion_date::text AS d, cert_number
         FROM certificates
        WHERE platform_id = $1 AND status = 'active' AND recipient_email = ANY($2::text[])`,
      [platformId, [...new Set(candidates.map((r) => r.data.email))]]
    );
    const ex = new Map(existing.map((e) => [`${e.recipient_email}|${e.course}|${e.d}`, e.cert_number]));
    for (const r of candidates) {
      const k = `${r.data.email}|${r.data.course_name.toLowerCase()}|${r.data.completion_date}`;
      if (ex.has(k)) r.errors.push(`already issued (${ex.get(k)})`);
    }
  }
  return out;
}

const verifyUrl = (certNumber, hash) => `${cfg.baseUrl}/verify/${certNumber}?t=${qrToken(hash)}`;
const pdfRelPath = (platformId, certNumber) => path.posix.join('pdfs', platformId, `${certNumber}.pdf`);

/**
 * Issues certificates for already-validated rows inside one transaction.
 * Returns { batch, certificates: [{cert_number, email, verify_url, ...}] }
 */
async function issue({ rows, platform, template, user, source = 'csv', fileName, totalRows, idempotencyKey, actorLabel }) {
  if (platform.accreditation_status !== 'active') throw new Error('Platform is not active; issuance is disabled.');
  const written = [];
  try {
    return await tx(async (c) => {
      const { rows: [batch] } = await c.query(
        `INSERT INTO issuance_batches (platform_id, created_by, source, file_name, total_rows, issued, skipped, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [platform.id, user?.id || null, source, fileName || null, totalRows ?? rows.length, rows.length, (totalRows ?? rows.length) - rows.length, idempotencyKey || null]
      );
      const issueDate = todayUtc();
      const results = [];
      const scopeCache = new Map(); // course name -> the partner's active authorized scope covering it (or null)
      const scopeOf = async (course) => {
        const k = String(course || '').trim().toLowerCase();
        if (!scopeCache.has(k)) scopeCache.set(k, await require('./scheme-store').scopeForCourse(platform.id, course));
        return scopeCache.get(k);
      };
      for (const { data } of rows) {
        const { rows: [trainee] } = await c.query(
          `INSERT INTO trainees (platform_id, email, first_name, last_name) VALUES ($1,$2,$3,$4)
           ON CONFLICT (platform_id, email) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name
           RETURNING id`,
          [platform.id, data.email, data.first_name, data.last_name]
        );
        const expiry = null; // certificates do not expire: only an issue date is shown
        const scope = await scopeOf(data.course_name);
        let cert;
        for (let attempt = 0; attempt < 5 && !cert; attempt++) {
          const certNumber = newCertNumber(Number(issueDate.slice(0, 4)));
          const hashInput = {
            cert_number: certNumber, platform_id: platform.id, first_name: data.first_name, last_name: data.last_name, email: data.email,
            course_name: data.course_name, grade: data.grade, completion_date: data.completion_date, issue_date: issueDate, expiry_date: expiry,
          };
          const hash = certHmac(hashInput);
          const url = verifyUrl(certNumber, hash);
          const pdf = await renderCertificate({ ...hashInput, verify_url: url, verification_hash: hash }, platform, template);
          const rel = pdfRelPath(platform.id, certNumber);
          await c.query('SAVEPOINT ins');
          try {
            const { rows: [ins] } = await c.query(
              `INSERT INTO certificates (cert_number, platform_id, trainee_id, recipient_first_name, recipient_last_name, recipient_email,
                 template_id, batch_id, course_name, grade, completion_date, issue_date, expiry_date, pdf_path, verification_hash,
                 holder_ref, id_hash, id_last4, record_type, scheme_id, partner_scope_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'training_completion',$19,$20) RETURNING id, cert_number`,
              [certNumber, platform.id, trainee.id, data.first_name, data.last_name, data.email, template?.id || null, batch.id,
                data.course_name, data.grade || null, data.completion_date, issueDate, expiry, rel, hash,
                data.serial_no || null, data.national_id ? idHash(data.national_id) : null, data.national_id ? idLast4(data.national_id) : null,
                scope?.scheme_id || null, scope?.id || null]
            );
            const copy = await putFile(rel, pdf, c); // stored with the record, in the same transaction
            if (copy) written.push(copy);
            cert = { ...ins, verify_url: url };
          } catch (e) {
            await c.query('ROLLBACK TO SAVEPOINT ins');
            if (e.code === '23505' && /cert_number/.test(e.detail || e.constraint || '')) continue; // number collision → retry
            if (e.code === '23505') throw Object.assign(new Error(`Duplicate active certificate for ${data.email} / ${data.course_name}`), { status: 409 });
            throw e;
          }
        }
        if (!cert) throw new Error('Could not allocate a unique certificate number');
        results.push({
          cert_number: cert.cert_number, first_name: data.first_name, last_name: data.last_name, email: data.email,
          course_name: data.course_name, completion_date: data.completion_date, issue_date: issueDate, expiry_date: expiry,
          serial_no: data.serial_no || null, id_last4: data.national_id ? idLast4(data.national_id) : null, verify_url: cert.verify_url,
        });
      }
      await audit({ user, actorLabel, platformId: platform.id, action: 'certificates.issue', target: batch.id,
        metadata: { source, count: results.length, file: fileName || null } }, c);
      return { batch, certificates: results };
    });
  } catch (e) {
    for (const f of written) fs.rmSync(f, { force: true });
    throw e;
  }
}

module.exports = { FIELDS, REQUIRED, FIELD_LABELS, TEMPLATE_HEADER, TEMPLATE_ROWS, hasName, hasNonLatin, sampleCsv, maskId, norm, autoMap, validateRows, issue, parseDate, addMonths, verifyUrl, fmtDate };
