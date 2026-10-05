// Content API for the knowledge engines (docs/KNOWLEDGE-ENGINES.md). Service keys are scoped; engines can only
// create and update their own DRAFTS and read their status. They cannot publish, delete, or touch published content.
const express = require('express');
const { q } = require('../db');
const cfg = require('../config');
const { sha256 } = require('../lib/crypto');
const { audit } = require('../lib/audit');
const { validateDraft, slugify } = require('../lib/content');
const { uniqueSlug, snapshot, contentChanged } = require('../lib/article-store');
const { limiter, wrap } = require('../lib/guards');

const r = express.Router();
const UUID_RE = /^[0-9a-f-]{36}$/i;

r.use(limiter(1, 120, true));
r.use(wrap(async (req, res, next) => {
  const raw = req.get('x-api-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!raw) return res.status(401).json({ error: 'Missing service key (X-API-Key header).' });
  const { rows: [k] } = await q('SELECT id, label, scopes FROM service_keys WHERE key_hash = $1 AND revoked_at IS NULL', [sha256(raw)]);
  if (!k) return res.status(401).json({ error: 'Invalid or revoked service key.' });
  q('UPDATE service_keys SET last_used_at = now() WHERE id = $1', [k.id]).catch(() => {});
  req.svc = k;
  next();
}));
const need = (scope) => (req, res, next) => (req.svc.scopes.includes(scope) ? next() : res.status(403).json({ error: `Missing scope ${scope}.` }));

const view = (a) => ({
  id: a.id, external_id: a.external_id, slug: a.slug, title: a.title, kind: a.kind, category: a.category,
  status: a.status, version: a.version, ai_assisted: a.ai_assisted,
  review: { reviewed_by: a.reviewed_by || null, reviewed_at: a.reviewed_at, next_review_at: a.next_review_at },
  published_at: a.published_at, updated_at: a.updated_at,
  public_url: a.status === 'published' ? `${cfg.baseUrl}/knowledge/${a.slug}` : null,
});

// Create or update a draft (idempotent on external_id).
r.post('/drafts', need('content:draft'), wrap(async (req, res) => {
  const { errors, value: v } = validateDraft(req.body);
  if (errors.length) return res.status(422).json({ errors });
  const { rows: [ex] } = await q('SELECT * FROM articles WHERE service_key_id = $1 AND external_id = $2', [req.svc.id, v.external_id]);
  let a; let created = false;
  if (ex) {
    if (ex.status === 'published') return res.status(409).json({ error: 'Published content cannot be changed through the API. Submit a new draft with a different external_id and describe the revision in change_note.' });
    const changed = contentChanged(ex, v);
    const { rows: [u] } = await q(`UPDATE articles SET title=$1, summary=$2, body_md=$3, category=$4, kind=$5, author_name=$6, tags=$7, sources=$8, standards=$9, ai_assisted=$10,
        version = version + $11, reviewed_by = CASE WHEN $11 = 1 THEN '' ELSE reviewed_by END, reviewed_at = CASE WHEN $11 = 1 THEN NULL ELSE reviewed_at END, updated_at = now()
      WHERE id = $12 RETURNING *`, [v.title, v.summary, v.body_md, v.category, v.kind, v.author_name, v.tags, JSON.stringify(v.sources), v.standards, v.ai_assisted, changed ? 1 : 0, ex.id]);
    a = u;
    if (changed) await snapshot(a.id, `service:${req.svc.label}`, v.change_note || 'Updated by engine');
  } else {
    const slug = await uniqueSlug(slugify(v.title));
    const { rows: [n] } = await q(`INSERT INTO articles (slug, title, summary, body_md, category, kind, author_name, tags, sources, standards, ai_assisted, origin, external_id, service_key_id, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'engine',$12,$13,'draft') RETURNING *`,
    [slug, v.title, v.summary, v.body_md, v.category, v.kind, v.author_name, v.tags, JSON.stringify(v.sources), v.standards, v.ai_assisted, v.external_id, req.svc.id]);
    a = n; created = true;
    await snapshot(a.id, `service:${req.svc.label}`, v.change_note || 'Created by engine');
  }
  await audit({ actorLabel: `service:${req.svc.label}`, action: created ? 'content.api.create' : 'content.api.update', target: a.slug });
  res.status(created ? 201 : 200).json({ ...view(a), created });
}));

// Read status of own items (e.g. to learn the editor's decision).
r.get('/articles', need('content:read'), wrap(async (req, res) => {
  const status = ['draft', 'published'].includes(req.query.status) ? req.query.status : null;
  const { rows } = await q(`SELECT * FROM articles WHERE service_key_id = $1 AND ($2::text IS NULL OR status = $2) ORDER BY updated_at DESC LIMIT 100`, [req.svc.id, status]);
  res.json({ items: rows.map(view) });
}));
r.get('/articles/:ref', need('content:read'), wrap(async (req, res) => {
  const byId = UUID_RE.test(req.params.ref);
  const { rows: [a] } = await q(`SELECT * FROM articles WHERE service_key_id = $1 AND ${byId ? 'id = $2' : 'external_id = $2'}`, [req.svc.id, req.params.ref]);
  if (!a) return res.status(404).json({ error: 'Not found.' });
  res.json(view(a));
}));

module.exports = r;
