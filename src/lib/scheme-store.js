// Credential schemes and partner authorized scope (Phase 2). Scheme rules are not stored here until a version is approved.
const { q } = require('../db');
const { SCHEMES, RECORD_TYPES } = require('./schemes');

const SCHEME_STATUS = { in_development: 'In development', published: 'Published', suspended: 'Suspended', retired: 'Retired' };
const SCOPE_STATUS = { active: 'Active', suspended: 'Suspended', withdrawn: 'Withdrawn' };

/** Adds the built-in scheme definitions that are missing (never overwrites edits). Returns the number added. */
async function seedSchemes() {
  let n = 0;
  for (const [i, s] of SCHEMES.entries()) {
    const { rowCount } = await q(`INSERT INTO credential_schemes (slug, name, record_type, status, tagline, summary, positioning, focus, pending, sort)
      VALUES ($1,$2,$3,'in_development',$4,$5,$6,$7,$8,$9) ON CONFLICT (slug) DO NOTHING`,
    [s.slug, s.name, s.record_type || 'assessed_qualification', s.tagline, s.summary, s.positioning, JSON.stringify(s.focus), JSON.stringify(s.pending || []), (i + 1) * 10]);
    n += rowCount;
  }
  return n;
}

const listSchemes = async ({ publicOnly = false } = {}) => (await q(`SELECT * FROM credential_schemes ${publicOnly ? "WHERE status <> 'retired'" : ''} ORDER BY sort, name`)).rows;
const schemeBySlug = async (slug) => (await q('SELECT * FROM credential_schemes WHERE slug = $1', [String(slug).slice(0, 80)])).rows[0] || null;

const scopesFor = async (platformId, { activeOnly = false } = {}) => (await q(
  `SELECT s.*, cs.name AS scheme_name, cs.slug AS scheme_slug FROM partner_scopes s LEFT JOIN credential_schemes cs ON cs.id = s.scheme_id
    WHERE s.platform_id = $1 ${activeOnly ? "AND s.status = 'active' AND (s.ends_on IS NULL OR s.ends_on >= CURRENT_DATE)" : ''} ORDER BY s.status, s.title`, [platformId])).rows;

/** The partner's active scope that covers a course, matched on the scope title (case- and space-insensitive). */
async function scopeForCourse(platformId, courseName) {
  const { rows: [s] } = await q(`SELECT id, scheme_id, title FROM partner_scopes WHERE platform_id = $1 AND status = 'active'
      AND (ends_on IS NULL OR ends_on >= CURRENT_DATE) AND lower(regexp_replace(title, '\\s+', ' ', 'g')) = lower(regexp_replace($2, '\\s+', ' ', 'g')) LIMIT 1`, [platformId, String(courseName || '').trim()]);
  return s || null;
}

module.exports = { SCHEME_STATUS, SCOPE_STATUS, RECORD_TYPES, seedSchemes, listSchemes, schemeBySlug, scopesFor, scopeForCourse };
