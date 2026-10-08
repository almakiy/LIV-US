const express = require('express');
const { q } = require('../db');
const cfg = require('../config');
const { audit } = require('../lib/audit');
const { RECOMMENDED } = require('../lib/pdf-security');
const { qrToken } = require('../lib/crypto');
const bcrypt = require('bcryptjs');
const { tx } = require('../db');
const { mergeExcerpts, CATEGORIES, KINDS, slugify, renderMarkdown, readingMinutes, parseTags, parseSourcesText, sourcesToText, parseStandards } = require('../lib/content');
const { uniqueSlug, snapshot, contentChanged } = require('../lib/article-store');
const { newApiKey } = require('../lib/crypto');
const { requireSuper, wrap, flash } = require('../lib/guards');
const { refusedPassword } = require('../lib/dev-defaults');

const r = express.Router();
// Visiting /admin while acting on behalf of a provider returns to admin mode.
r.use((req, res, next) => {
  if (req.user?.actingAs) { delete req.session.actAs; return res.redirect(req.originalUrl); }
  next();
});
r.use(requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const verifyLink = (c) => `${cfg.baseUrl}/verify/${c.cert_number}?t=${qrToken(c.verification_hash)}`;

r.get('/', wrap(async (req, res) => {
  const { rows: [s] } = await q(`SELECT
      (SELECT count(*)::int FROM platforms WHERE accreditation_status='pending') AS pending,
      (SELECT count(*)::int FROM platforms WHERE accreditation_status='active') AS active,
      (SELECT count(*)::int FROM platforms WHERE accreditation_status='suspended') AS suspended,
      (SELECT count(*)::int FROM certificates) AS certs,
      (SELECT count(*)::int FROM certificates WHERE status='revoked') AS revoked,
      (SELECT count(*)::int FROM contact_messages WHERE NOT handled) AS messages`);
  const { rows: daily } = await q(`SELECT d::date::text AS day, count(v.id)::int AS n,
        count(v.id) FILTER (WHERE v.result IN ('not_found','tampered','invalid_format'))::int AS bad
      FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, interval '1 day') d
      LEFT JOIN verification_logs v ON v.created_at::date = d::date
      GROUP BY d ORDER BY d`);
  const { rows: recent } = await q(`SELECT a.*, p.company_name FROM audit_logs a LEFT JOIN platforms p ON p.id = a.platform_id ORDER BY a.created_at DESC LIMIT 10`);
  res.render('admin/dashboard', { title: 'Admin overview', s, daily, recent });
}));

r.get('/platforms', wrap(async (req, res) => {
  const status = ['pending', 'active', 'suspended'].includes(req.query.status) ? req.query.status : '';
  const { rows } = await q(`SELECT p.*, (SELECT count(*)::int FROM certificates c WHERE c.platform_id = p.id) AS certs,
      (SELECT email FROM users u WHERE u.platform_id = p.id ORDER BY created_at LIMIT 1) AS owner_email
    FROM platforms p ${status ? 'WHERE accreditation_status = $1' : ''} ORDER BY (accreditation_status='pending') DESC, created_at DESC`, status ? [status] : []);
  res.render('admin/platforms', { title: 'Training platforms', rows, status });
}));

r.get('/platforms/new', (req, res) => res.render('admin/platform-new', { title: 'New provider', form: {}, error: null }));
r.post('/platforms/new', wrap(async (req, res) => {
  const f = Object.fromEntries(['company_name', 'website', 'country', 'full_name', 'email', 'password'].map((k) => [k, String(req.body[k] || '').trim()]));
  f.email = f.email.toLowerCase();
  const fail = (error) => res.status(400).render('admin/platform-new', { title: 'New provider', form: { ...f, password: '' }, error });
  if (!f.company_name || !f.full_name || !f.email || !f.password) return fail('Please fill in all required fields.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) return fail('Please enter a valid email.');
  if (f.password.length < 10) return fail('Temporary password must be at least 10 characters.');
  if (refusedPassword(f.password)) return fail('That is a published development password; choose another one.');
  if ((await q('SELECT 1 FROM users WHERE email = $1', [f.email])).rows.length) return fail('A user with this email already exists.');
  const hash = await bcrypt.hash(f.password, 12);
  const id = await tx(async (c) => {
    const { rows: [p] } = await c.query(`INSERT INTO platforms (company_name, website, country, contact_email, accreditation_status) VALUES ($1,$2,$3,$4,'active') RETURNING id`,
      [f.company_name, f.website || null, f.country || null, f.email]);
    await c.query(`INSERT INTO users (platform_id, role, full_name, email, password_hash, must_change_password) VALUES ($1,'platform_admin',$2,$3,$4,true)`, [p.id, f.full_name, f.email, hash]);
    await c.query(`INSERT INTO certificate_templates (platform_id, name, design, signatory_name, signatory_title, security_config) VALUES ($1,'Default Executive','executive',$2,'Training Director',$3)`, [p.id, f.full_name, RECOMMENDED]);
    await audit({ user: req.user, platformId: p.id, action: 'platform.create', target: f.company_name }, c);
    return p.id;
  });
  flash(req, 'success', `${f.company_name} created and active. Share the temporary password securely.`);
  res.redirect(`/admin/platforms/${id}`);
}));

r.post('/platforms/:id/act-as', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const { rows: [p] } = await q('SELECT company_name FROM platforms WHERE id = $1', [req.params.id]);
  if (!p) return next();
  req.session.actAs = req.params.id;
  await audit({ user: req.user, platformId: req.params.id, action: 'admin.act_as', target: p.company_name });
  res.redirect('/portal/issue');
}));

r.get('/platforms/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const { rows: [p] } = await q('SELECT * FROM platforms WHERE id = $1', [req.params.id]);
  if (!p) return next();
  const { rows: users } = await q('SELECT id, full_name, email, last_login_at, created_at, totp_enabled, must_change_password FROM users WHERE platform_id = $1 ORDER BY created_at', [p.id]);
  const { rows: [agr] } = await q(`SELECT a.version, c.accepted_at, c.accepted_name FROM agreements a LEFT JOIN agreement_acceptances c ON c.agreement_id = a.id AND c.platform_id = $1 WHERE a.status = 'active'`, [p.id]);
  const newPassword = req.session.newTempPassword || null; delete req.session.newTempPassword;
  const { rows: [st] } = await q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status='revoked')::int AS revoked FROM certificates WHERE platform_id=$1`, [p.id]);
  const { rows: log } = await q('SELECT * FROM audit_logs WHERE platform_id = $1 ORDER BY created_at DESC LIMIT 20', [p.id]);
  const store = require('../lib/scheme-store');
  const scopes = await store.scopesFor(p.id); const schemes = await store.listSchemes();
  res.render('admin/platform', { title: p.company_name, p, users, st, log, agr: agr || null, newPassword, scopes, schemes, SCOPE_STATUS: store.SCOPE_STATUS });
}));

r.post('/platforms/:id/status', wrap(async (req, res, next) => {
  const to = req.body.status;
  if (!UUID_RE.test(req.params.id) || !['active', 'suspended', 'pending'].includes(to)) return next();
  const { rows: [p] } = await q('UPDATE platforms SET accreditation_status=$1 WHERE id=$2 RETURNING company_name', [to, req.params.id]);
  if (!p) return next();
  await audit({ user: req.user, platformId: req.params.id, action: `platform.status.${to}`, target: p.company_name, metadata: { note: String(req.body.note || '').slice(0, 300) } });
  flash(req, 'success', `${p.company_name} is now ${to}.`);
  res.redirect(req.get('referer')?.includes('/admin/platforms/') ? `/admin/platforms/${req.params.id}` : '/admin/platforms');
}));

r.get('/certificates', wrap(async (req, res) => {
  const search = String(req.query.q || '').trim().slice(0, 100);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const params = []; let w = 'TRUE';
  if (search) { params.push(`%${search.toLowerCase()}%`); w = `(lower(c.cert_number) LIKE $1 OR lower(c.recipient_first_name || ' ' || c.recipient_last_name) LIKE $1 OR lower(c.recipient_email) LIKE $1 OR lower(p.company_name) LIKE $1)`; }
  const { rows: [{ n }] } = await q(`SELECT count(*)::int AS n FROM certificates c JOIN platforms p ON p.id=c.platform_id WHERE ${w}`, params);
  const { rows } = await q(`SELECT c.*, p.company_name FROM certificates c JOIN platforms p ON p.id=c.platform_id WHERE ${w} ORDER BY c.created_at DESC LIMIT 25 OFFSET ${(page - 1) * 25}`, params);
  res.render('admin/certificates', { title: 'All certificates', rows, n, page, pages: Math.max(1, Math.ceil(n / 25)), search, verifyLink });
}));

r.post('/certificates/:num/revoke', wrap(async (req, res, next) => {
  const reason = String(req.body.reason || '').trim().slice(0, 500);
  const num = String(req.params.num).toUpperCase();
  if (reason.length < 5) { flash(req, 'error', 'A revocation reason (min 5 characters) is required.'); return res.redirect('/admin/certificates?q=' + encodeURIComponent(num)); }
  const { rows: [c] } = await q(`UPDATE certificates SET status='revoked', revoked_at=now(), revoked_by=$1, revocation_reason=$2 WHERE cert_number=$3 AND status='active' RETURNING platform_id`, [req.user.id, reason, num]);
  if (!c) return next();
  await audit({ user: req.user, platformId: c.platform_id, action: 'certificate.revoke', target: num, metadata: { reason, by: 'super_admin' } });
  flash(req, 'success', `Certificate ${num} revoked.`);
  res.redirect('/admin/certificates?q=' + encodeURIComponent(num));
}));

r.get('/audit', wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const { rows } = await q(`SELECT a.*, p.company_name FROM audit_logs a LEFT JOIN platforms p ON p.id = a.platform_id ORDER BY a.created_at DESC LIMIT 50 OFFSET ${(page - 1) * 50}`);
  res.render('admin/audit', { title: 'Audit log', rows, page });
}));

r.get('/messages', wrap(async (req, res) => {
  const { rows } = await q('SELECT * FROM contact_messages ORDER BY handled, created_at DESC LIMIT 200');
  res.render('admin/messages', { title: 'Contact messages', rows });
}));
r.post('/messages/:id/handled', wrap(async (req, res) => {
  await q('UPDATE contact_messages SET handled = true WHERE id = $1', [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/messages');
}));

// ---------- Knowledge hub content ----------
function readArticleForm(b) {
  return {
    title: String(b.title || '').trim().slice(0, 200),
    slug: slugify(b.slug || b.title),
    summary: String(b.summary || '').trim().slice(0, 300),
    body_md: String(b.body_md || '').slice(0, 200000),
    category: CATEGORIES[b.category] ? b.category : 'quality',
    kind: KINDS[b.kind] ? b.kind : 'article',
    author_name: String(b.author_name || '').trim().slice(0, 150),
    tags: parseTags(b.tags),
    jurisdiction: String(b.jurisdiction || '').trim().slice(0, 80),
    reviewed_by: String(b.reviewed_by || '').trim().slice(0, 150),
    next_review_at: /^\d{4}-\d{2}-\d{2}$/.test(b.next_review_at || '') ? b.next_review_at : null,
    standards: parseStandards(b.standards),
    sources: parseSourcesText(b.sources_text),
    override_reason: String(b.override_reason || '').trim().slice(0, 300),
    ai_assisted: b.ai_assisted === 'on',
    change_note: String(b.change_note || '').trim().slice(0, 300),
  };
}
const editForm = async (res, a, error) => {
  const { rows: versions } = a.id ? await q('SELECT version, changed_by, change_note, created_at FROM article_versions WHERE article_id = $1 ORDER BY version DESC LIMIT 30', [a.id]) : { rows: [] };
  const { rows: [report] } = a.id ? await q('SELECT * FROM review_reports WHERE article_id = $1 AND version = $2 ORDER BY created_at DESC LIMIT 1', [a.id, a.version]) : { rows: [] };
  res.status(error ? 400 : 200).render('admin/content-edit', { title: a.id ? 'Edit article' : 'New article', a, error: error || null, CATEGORIES, KINDS, versions, report: report || null, sourcesText: sourcesToText(a.sources) });
};

r.get('/content', wrap(async (req, res) => {
  const { rows } = await q(`SELECT id, slug, title, category, kind, status, published_at, updated_at, origin, ai_assisted, reviewed_by, next_review_at, (next_review_at IS NOT NULL AND next_review_at < CURRENT_DATE) AS stale FROM articles ORDER BY updated_at DESC LIMIT 200`);
  res.render('admin/content', { title: 'Knowledge hub content', rows, CATEGORIES, KINDS });
}));
r.get('/content/new', wrap((req, res) => editForm(res, { title: '', slug: '', summary: '', body_md: '', category: 'quality', kind: 'article', author_name: req.user.full_name, tags: [], status: 'draft', reviewed_by: '', sources: [], standards: [], ai_assisted: false, version: 1 })));
r.post('/content/preview', wrap(async (req, res) => {
  const a = { ...readArticleForm(req.body), status: 'draft', published_at: null, reviewed_at: null, version: 1 };
  res.render('public/knowledge-article', { title: a.title || 'Preview', description: a.summary, a, html: renderMarkdown(a.body_md), minutes: readingMinutes(a.body_md), related: [], CATEGORIES, KINDS, preview: true });
}));
r.get('/content/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const { rows: [a] } = await q('SELECT * FROM articles WHERE id = $1', [req.params.id]);
  if (!a) return next();
  await editForm(res, a);
}));
r.post('/content', wrap(async (req, res) => {
  const f = readArticleForm(req.body);
  const publish = req.body.action === 'publish';
  const id = UUID_RE.test(req.body.id || '') ? req.body.id : null;
  const back = { ...f, id, status: 'draft', version: 1 };
  if (!f.title) return editForm(res, back, 'A title is required.');
  if (publish && (!f.body_md.trim() || !f.summary)) return editForm(res, back, 'A summary and body are required to publish.');
  if (publish && !f.reviewed_by) return editForm(res, back, 'Every published item needs a named human subject-matter reviewer. Fill in "Reviewed by" first.');
  const slug = await uniqueSlug(f.slug, id);
  const by = req.user.full_name || req.user.email;
  let saved;
  if (id) {
    const { rows: [old] } = await q('SELECT * FROM articles WHERE id = $1', [id]);
    if (!old) return res.redirect('/admin/content');
    f.sources = mergeExcerpts(f.sources, old.sources);
    const changed = contentChanged(old, f);
    // A blocking automated review of this exact version stops publication unless a reason for overriding is recorded.
    if (publish && !changed) {
      const { rows: [rep] } = await q('SELECT result, score FROM review_reports WHERE article_id = $1 AND version = $2 ORDER BY created_at DESC LIMIT 1', [id, old.version]);
      if (rep && rep.result === 'block') {
        if (!f.override_reason) return editForm(res, { ...f, id, status: old.status, version: old.version, origin: old.origin, reviewed_at: old.reviewed_at }, 'The automated review blocked this version. Fix the flagged issues, or enter a reason in "Override reason" to publish anyway (it is recorded).');
        await audit({ user: req.user, action: 'content.publish.override', target: slug, metadata: { reason: f.override_reason, score: rep.score } });
      }
    }
    // A reviewer's sign-off covers the content they saw: if the text changed and the name was not re-entered, it no longer stands.
    const reviewerKept = f.reviewed_by && (f.reviewed_by !== old.reviewed_by || !changed);
    const { rows: [x] } = await q(`UPDATE articles SET slug=$1, title=$2, summary=$3, body_md=$4, category=$5, kind=$6, author_name=$7, tags=$8, updated_at=now(),
        sources=$12, standards=$13, ai_assisted=$14, next_review_at=$15, version = version + $16,
        reviewed_by = $17::varchar, reviewed_at = CASE WHEN $17::varchar = '' THEN NULL WHEN $17::varchar <> reviewed_by OR reviewed_at IS NULL THEN now() ELSE reviewed_at END, approved_by = CASE WHEN $17::varchar = '' THEN NULL ELSE $18::uuid END,
        status = CASE WHEN $9 THEN 'published' WHEN $10 THEN 'draft' ELSE status END,
        published_at = CASE WHEN $9 AND published_at IS NULL THEN now() ELSE published_at END
      WHERE id=$11 RETURNING id, status, slug`, [slug, f.title, f.summary, f.body_md, f.category, f.kind, f.author_name, f.tags, publish, req.body.action === 'unpublish', id,
      JSON.stringify(f.sources), f.standards, f.ai_assisted, f.next_review_at, changed ? 1 : 0, reviewerKept ? f.reviewed_by : '', req.user.id]);
    saved = x;
    if (changed) await snapshot(id, by, f.change_note || 'Edited');
  } else {
    const { rows: [x] } = await q(`INSERT INTO articles (slug, title, summary, body_md, category, kind, author_name, tags, status, published_at, created_by, sources, standards, ai_assisted, next_review_at, reviewed_by, reviewed_at, approved_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::varchar, CASE WHEN $16::varchar = '' THEN NULL ELSE now() END, CASE WHEN $16::varchar = '' THEN NULL ELSE $11::uuid END) RETURNING id, status, slug`,
    [slug, f.title, f.summary, f.body_md, f.category, f.kind, f.author_name, f.tags, publish ? 'published' : 'draft', publish ? new Date() : null, req.user.id,
      JSON.stringify(f.sources), f.standards, f.ai_assisted, f.next_review_at, f.reviewed_by]);
    saved = x;
    await snapshot(x.id, by, f.change_note || 'Created');
  }
  await q('UPDATE articles SET jurisdiction = $1 WHERE id = $2', [f.jurisdiction, saved.id]);
  await audit({ user: req.user, action: `content.${saved.status === 'published' ? 'publish' : 'save'}`, target: slug });
  flash(req, 'success', saved.status === 'published' ? 'Saved and published.' : 'Draft saved.');
  res.redirect(`/admin/content/${saved.id}`);
}));
r.post('/content/:id/request-review', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const { rows: [a] } = await q(`UPDATE articles SET review_requested_at = now() WHERE id = $1 AND status = 'draft' RETURNING slug`, [req.params.id]);
  if (a) await audit({ user: req.user, action: 'content.review.request', target: a.slug });
  flash(req, a ? 'success' : 'error', a ? 'Automated review requested. The Reviewer engine will pick it up.' : 'Only drafts can be sent for automated review.');
  res.redirect(`/admin/content/${req.params.id}`);
}));
r.post('/content/:id/delete', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const { rows: [a] } = await q('DELETE FROM articles WHERE id = $1 RETURNING slug', [req.params.id]);
  if (!a) return next();
  await audit({ user: req.user, action: 'content.delete', target: a.slug });
  flash(req, 'success', 'Article deleted.');
  res.redirect('/admin/content');
}));


// ---------- Partner users: password and two-factor resets ----------
r.post('/users/:id/reset-password', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const { rows: [u] } = await q(`SELECT id, email, platform_id FROM users WHERE id = $1 AND role = 'platform_admin'`, [req.params.id]);
  if (!u) return next();
  const temp = require('crypto').randomBytes(12).toString('base64url');
  await q('UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2', [await bcrypt.hash(temp, 12), u.id]);
  await q(`DELETE FROM sessions WHERE sess->>'userId' = $1`, [u.id]).catch(() => {});
  await audit({ user: req.user, platformId: u.platform_id, action: 'admin.reset_password', target: u.email });
  req.session.newTempPassword = `${u.email}: ${temp}`;
  res.redirect(`/admin/platforms/${u.platform_id}`);
}));
r.post('/users/:id/reset-2fa', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const { rows: [u] } = await q(`UPDATE users SET totp_secret_enc = NULL, totp_enabled = false, totp_last_step = 0, recovery_hashes = '{}' WHERE id = $1 AND role = 'platform_admin' RETURNING email, platform_id`, [req.params.id]);
  if (!u) return next();
  await audit({ user: req.user, platformId: u.platform_id, action: 'admin.reset_2fa', target: u.email });
  flash(req, 'success', `Two-factor sign-in reset for ${u.email}. They can set it up again.`);
  res.redirect(`/admin/platforms/${u.platform_id}`);
}));

// ---------- Partner agreement versions ----------
const { hasPlaceholder, STARTER_TITLE, STARTER_BODY } = require('../lib/agreements');
r.get('/agreements', wrap(async (req, res) => {
  const { rows } = await q(`SELECT a.*, (SELECT count(*)::int FROM agreement_acceptances c WHERE c.agreement_id = a.id) AS accepted FROM agreements a ORDER BY a.version DESC`);
  const active = rows.find((x) => x.status === 'active');
  const { rows: waiting } = active ? await q(`SELECT p.id, p.company_name FROM platforms p WHERE NOT EXISTS (SELECT 1 FROM agreement_acceptances c WHERE c.platform_id = p.id AND c.agreement_id = $1) ORDER BY p.company_name`, [active.id]) : { rows: [] };
  res.render('admin/agreements', { title: 'Partner agreements', rows, active, waiting });
}));
r.post('/agreements', wrap(async (req, res) => {
  const { rows: [m] } = await q('SELECT COALESCE(max(version), 0) + 1 AS v FROM agreements');
  const { rows: [last] } = await q('SELECT title, body_md FROM agreements ORDER BY version DESC LIMIT 1');
  const { rows: [a] } = await q(`INSERT INTO agreements (version, title, body_md, created_by) VALUES ($1,$2,$3,$4) RETURNING id`, [m.v, last ? last.title : STARTER_TITLE, last ? last.body_md : STARTER_BODY, req.user.id]);
  await audit({ user: req.user, action: 'agreement.create', target: `v${m.v}` });
  res.redirect(`/admin/agreements/${a.id}`);
}));
r.get('/agreements/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const { rows: [a] } = await q('SELECT * FROM agreements WHERE id = $1', [req.params.id]);
  if (!a) return next();
  const { rows: acc } = await q(`SELECT p.company_name, c.accepted_name, c.accepted_at FROM agreement_acceptances c JOIN platforms p ON p.id = c.platform_id WHERE c.agreement_id = $1 ORDER BY c.accepted_at`, [a.id]);
  res.render('admin/agreement', { title: `Agreement v${a.version}`, a, acc, html: renderMarkdown(a.body_md), placeholder: hasPlaceholder(a.body_md) });
}));
r.post('/agreements/:id/save', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const { rowCount } = await q(`UPDATE agreements SET title = $1, body_md = $2 WHERE id = $3 AND status = 'draft'`, [String(req.body.title || '').trim().slice(0, 200) || STARTER_TITLE, String(req.body.body_md || '').slice(0, 200000), req.params.id]);
  flash(req, rowCount ? 'success' : 'error', rowCount ? 'Draft saved.' : 'Only a draft can be edited.');
  res.redirect(`/admin/agreements/${req.params.id}`);
}));
r.post('/agreements/:id/activate', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const { rows: [a] } = await q(`SELECT * FROM agreements WHERE id = $1 AND status = 'draft'`, [req.params.id]);
  if (!a) { flash(req, 'error', 'Only a draft can be activated.'); return res.redirect(`/admin/agreements/${req.params.id}`); }
  if (hasPlaceholder(a.body_md)) { flash(req, 'error', 'Replace every [PLACEHOLDER] with the final text before activating.'); return res.redirect(`/admin/agreements/${a.id}`); }
  await tx(async (c) => {
    await c.query(`UPDATE agreements SET status = 'retired' WHERE status = 'active'`);
    await c.query(`UPDATE agreements SET status = 'active', activated_at = now() WHERE id = $1`, [a.id]);
  });
  await audit({ user: req.user, action: 'agreement.activate', target: `v${a.version}` });
  flash(req, 'success', `Version ${a.version} is active. Every partner must accept it before using the portal.`);
  res.redirect(`/admin/agreements/${a.id}`);
}));

// ---------- Service keys for the knowledge engines (Content API) ----------
r.get('/service-keys', wrap(async (req, res) => {
  const { rows } = await q('SELECT id, label, prefix, scopes, created_at, last_used_at, revoked_at FROM service_keys ORDER BY created_at DESC');
  const newKey = req.session.newServiceKey || null; delete req.session.newServiceKey;
  res.render('admin/service-keys', { title: 'Service keys', rows, newKey });
}));
r.post('/service-keys', wrap(async (req, res) => {
  const { key, prefix, hash } = newApiKey();
  const label = String(req.body.label || '').trim().slice(0, 100) || 'Engine';
  const ALLOWED = ['content:draft', 'content:read', 'content:review'];
  const picked = [].concat(req.body.scopes || []).filter((x) => ALLOWED.includes(x));
  const scopes = picked.length ? picked : ['content:draft', 'content:read'];
  await q('INSERT INTO service_keys (label, prefix, key_hash, scopes, created_by) VALUES ($1,$2,$3,$4,$5)', [label, prefix, hash, scopes, req.user.id]);
  await audit({ user: req.user, action: 'service_key.create', target: `${label} (${prefix})` });
  req.session.newServiceKey = key;
  res.redirect('/admin/service-keys');
}));
r.post('/service-keys/:id/revoke', wrap(async (req, res) => {
  if (UUID_RE.test(req.params.id)) {
    const { rowCount } = await q('UPDATE service_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [req.params.id]);
    if (rowCount) await audit({ user: req.user, action: 'service_key.revoke', target: req.params.id });
  }
  flash(req, 'success', 'Service key revoked.');
  res.redirect('/admin/service-keys');
}));

module.exports = r;
