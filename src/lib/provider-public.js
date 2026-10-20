// Public details a provider states about itself (city, training domain, delivery method) and the public verification of an
// ATP number. Values are entered by the provider in English; LIV does not translate or infer them. The verification answer
// carries only the status, the active scopes and the level, as decided on October 20, 2026.
const { q } = require('../db');
const { hasNonLatin } = require('./issuance');

const FIELDS = { public_city: { label: 'City', max: 120 }, public_domain: { label: 'Training domain', max: 200 }, public_delivery: { label: 'Delivery method', max: 200 } };
const ATP_RE = /^ATP-\d{4,6}$/;

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Reads the three fields from a form body. Returns { values, errors } with empty fields stored as null. */
function readFields(body = {}) {
  const values = {}; const errors = [];
  for (const [key, { label, max }] of Object.entries(FIELDS)) {
    const v = clean(body[key], max);
    if (hasNonLatin(v)) errors.push(`${label}: write in English (Latin letters). LIV does not translate or convert text.`);
    values[key] = v || null;
  }
  return { values, errors };
}

/** Normalizes an ATP number typed by a visitor ("atp-0001" → "ATP-0001"). Returns null when the format is wrong. */
function normalizeNumber(v) {
  const n = String(v ?? '').trim().toUpperCase().slice(0, 12);
  return ATP_RE.test(n) ? n : null;
}

/** The verification answer. Pure: status, level and active scope titles only. */
function verifyPayload({ public_number, accreditation_status, level }, scopes, today) {
  const active = scopes.filter((s) => s.status === 'active' && (!s.ends_on || String(s.ends_on).slice(0, 10) >= today));
  return {
    atp_number: public_number,
    status: accreditation_status,
    level: level || null,
    active_scopes: active.map((s) => s.title),
  };
}

async function lookupByNumber(number) {
  const { rows: [p] } = await q(`SELECT id, public_number, accreditation_status, level FROM platforms WHERE public_number = $1`, [number]);
  if (!p) return null;
  const { rows: scopes } = await q(`SELECT title, status, ends_on FROM partner_scopes WHERE platform_id = $1 ORDER BY title`, [p.id]);
  return verifyPayload(p, scopes, new Date().toISOString().slice(0, 10));
}

/** Values offered by the directory filters: only what active partners have stated. */
async function filterOptions() {
  const one = async (col) => (await q(`SELECT DISTINCT ${col} AS v FROM platforms WHERE accreditation_status = 'active' AND public_slug IS NOT NULL AND ${col} IS NOT NULL AND ${col} <> '' ORDER BY ${col}`)).rows.map((r) => r.v);
  return { cities: await one('public_city'), domains: await one('public_domain'), deliveries: await one('public_delivery') };
}

module.exports = { FIELDS, ATP_RE, clean, readFields, normalizeNumber, verifyPayload, lookupByNumber, filterOptions };
