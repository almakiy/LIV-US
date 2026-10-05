// Article persistence helpers shared by the admin editor and the Content API: unique slugs and version history.
const { q } = require('../db');

async function uniqueSlug(base, exceptId) {
  let slug = base || 'untitled'; let i = 2;
  for (;;) {
    const { rows } = await q('SELECT 1 FROM articles WHERE slug = $1 AND id <> COALESCE($2::uuid, gen_random_uuid())', [slug, exceptId || null]);
    if (!rows.length) return slug;
    slug = `${base}-${i++}`.slice(0, 100);
  }
}

/** Records the current content of an article as a version snapshot (idempotent per article and version). */
async function snapshot(articleId, changedBy, note) {
  await q(`INSERT INTO article_versions (article_id, version, title, summary, body_md, sources, standards, changed_by, change_note)
    SELECT id, version, title, summary, body_md, sources, standards, $2, $3 FROM articles WHERE id = $1
    ON CONFLICT (article_id, version) DO NOTHING`, [articleId, String(changedBy || '').slice(0, 150), String(note || '').slice(0, 300)]);
}

/** True when two content states differ in anything a reviewer signs off on. */
// Sources are compared by field value, not key order (JSONB does not preserve it).
const srcKey = (arr) => JSON.stringify((Array.isArray(arr) ? arr : []).map((s) => [s.title || '', s.url || '', s.publisher || '', s.accessed || '']));
const contentChanged = (a, b) => ['title', 'summary', 'body_md'].some((k) => String(a[k] ?? '') !== String(b[k] ?? ''))
  || srcKey(a.sources) !== srcKey(b.sources)
  || JSON.stringify(a.standards || []) !== JSON.stringify(b.standards || []);

module.exports = { uniqueSlug, snapshot, contentChanged };
