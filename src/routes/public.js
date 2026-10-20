const express = require('express');
const bcrypt = require('bcryptjs');
const cfg = require('../config');
const { q, tx } = require('../db');
const { verifyCertificate, CERT_RE } = require('../lib/verify');
const { qrToken, safeEqual } = require('../lib/crypto');
const { audit } = require('../lib/audit');
const { RECOMMENDED } = require('../lib/pdf-security');
const { limiter, wrap, flash } = require('../lib/guards');
const { createCase } = require('../lib/qms-store');
const { getFile } = require('../lib/files');
const { refusedPassword } = require('../lib/dev-defaults');

const r = express.Router();
const verifyLimiter = limiter(1, 30);

r.get('/', (req, res) => res.render('public/home', { title: 'Professional Credentials & Verification' }));
r.get('/about', (req, res) => res.render('public/about', { title: 'About Us' }));

// Authorized Training Provider Program and public register of Authorized Training Providers. /accreditation is the legacy URL.
r.get('/accreditation', (req, res) => res.redirect(301, '/partners'));
const likeEscape = (v) => String(v).replace(/[\\%_]/g, (c) => `\\${c}`);
r.get('/partners', wrap(async (req, res) => {
  const term = String(req.query.q || '').trim().slice(0, 80), country = String(req.query.country || '').trim().slice(0, 80);
  const { rows: partners } = await q(`SELECT p.id, p.company_name, p.country, p.public_slug AS slug, p.level, p.public_number, p.logo_path IS NOT NULL AS has_logo,
      (SELECT array_agg(title ORDER BY title) FROM (SELECT title FROM partner_scopes s WHERE s.platform_id = p.id AND s.status = 'active' ORDER BY title LIMIT 3) t) AS titles
    FROM platforms p WHERE p.accreditation_status = 'active' AND p.public_slug IS NOT NULL
      AND ($1 = '' OR p.company_name ILIKE '%' || $2 || '%' OR p.public_number ILIKE '%' || $2 || '%' OR EXISTS (SELECT 1 FROM partner_scopes s WHERE s.platform_id = p.id AND s.status = 'active' AND s.title ILIKE '%' || $2 || '%'))
      AND ($3 = '' OR lower(p.country) = lower($3))
    ORDER BY p.company_name LIMIT 200`, [term, likeEscape(term), country]);
  const { rows: countries } = await q(`SELECT DISTINCT country FROM platforms WHERE accreditation_status = 'active' AND public_slug IS NOT NULL AND country IS NOT NULL AND country <> '' ORDER BY country`);
  res.render('public/partners', { title: 'Authorized Training Provider Program', description: 'Become an Authorized Training Provider and see the public register of partners.', partners, countries: countries.map((c) => c.country), term, country });
}));
r.get('/partners/guide', (req, res) => {
  const F = require('../lib/application-form'); const T = require('../lib/title-form');
  res.render('public/partner-guide', { title: 'Application guide', description: 'What LIV asks of a training provider, stage by stage, before you apply.', STAGES: F.STAGES, FIELDS: F.FIELDS, CRITERIA_TITLES: F.CRITERIA_TITLES, REQUIRED_EVIDENCE: F.REQUIRED_EVIDENCE, TITLE_FIELDS: T.FIELDS, MIN_OBJECTIVES: T.MIN_OBJECTIVES });
});
r.get('/partners/:slug', wrap(async (req, res, next) => {
  const { rows: [p] } = await q(`SELECT id, company_name, country, website, level, level_since, public_number, public_slug AS slug, logo_path IS NOT NULL AS has_logo FROM platforms WHERE public_slug = $1 AND accreditation_status = 'active'`, [String(req.params.slug).slice(0, 120)]);
  if (!p) return next();
  const website = /^https?:\/\//i.test(p.website || '') ? p.website : '';
  // Active scopes only: suspended and withdrawn scopes never appear publicly. Scopes that have ended by date are marked on the page.
  const scopes = (await schemeStore.scopesFor(p.id)).filter((s) => s.status === 'active');
  const today = new Date().toISOString().slice(0, 10);
  const link = `${cfg.baseUrl}/partners/${p.slug || req.params.slug}`;
  const { rows: [app] } = await q(`SELECT v.form FROM partner_application_versions v JOIN partner_applications a ON a.id = v.application_id WHERE a.platform_id = $1 AND a.state = 'activated' ORDER BY v.version DESC LIMIT 1`, [p.id]);
  const MODES = require('../lib/application-form').MODES;
  const modes = ((app && app.form && app.form.delivery_modes) || []).map((m) => MODES[m]).filter(Boolean);
  const { rows: capabilities } = await q(`SELECT description, kind, granted_on FROM partner_capabilities WHERE platform_id = $1 AND status = 'active' ORDER BY granted_on`, [p.id]);
  res.render('public/partner', { title: p.company_name, description: `${p.company_name} is an Authorized Training Provider of ${cfg.brand}.`, p: { ...p, website }, scopes, modes, capabilities, today, link });
}));

// Credential types and credential families.
const schemeStore = require('../lib/scheme-store');
r.get('/credentials', wrap(async (req, res) => res.render('public/credentials', { title: 'Credentials', description: `Types of ${cfg.brand} records and credential families.`, schemes: await schemeStore.listSchemes({ publicOnly: true }), SCHEME_STATUS: schemeStore.SCHEME_STATUS })));
r.get('/credentials/:slug', wrap(async (req, res, next) => {
  const s = await schemeStore.schemeBySlug(req.params.slug);
  if (!s || s.status === 'retired') return next();
  res.render('public/credential-scheme', { title: s.name, description: s.tagline, s: { ...s, status: schemeStore.SCHEME_STATUS[s.status] }, RECORD_TYPES: schemeStore.RECORD_TYPES });
}));

// Public fee schedule, shown only after the owner approves the fees (PUBLIC_FEES=true).
r.get('/fees', wrap(async (req, res, next) => {
  if (!cfg.publicFees) return next();
  const { rows: products } = await q(`SELECT * FROM billing_products WHERE active ORDER BY sort`);
  const { rows: prices } = await q(`SELECT pr.*, p.code FROM billing_prices pr JOIN billing_products p ON p.id = pr.product_id WHERE (pr.valid_to IS NULL OR pr.valid_to >= CURRENT_DATE) AND pr.valid_from <= CURRENT_DATE ORDER BY pr.min_qty`);
  const { PLANS, PLAN_DEFAULTS } = require('../lib/billing-catalog');
  res.render('public/fees', { title: 'Fees', description: 'Published fees for Authorized Training Providers, credentials and verification.', products, prices, money: require('../lib/billing').money, PLANS, PLAN_DEFAULTS });
}));

r.get('/verify', verifyLimiter, (req, res) => {
  const id = String(req.query.id || '').trim().toUpperCase();
  if (!id) return res.render('public/verify-search', { title: 'Verify a Credential', error: null, id: '', last_name: '' });
  if (!CERT_RE.test(id)) return res.status(400).render('public/verify-search', { title: 'Verify a Credential', error: 'That does not look like a valid Credential ID. Format: LIV-2026-XXXXXXXX', id, last_name: req.query.last_name || '' });
  const ln = String(req.query.last_name || '').trim();
  res.redirect(`/verify/${id}${ln ? '?last_name=' + encodeURIComponent(ln) : ''}`);
});

r.get('/verify/:cert', verifyLimiter, wrap(async (req, res) => {
  const out = await verifyCertificate(req.params.cert, { token: req.query.t, lastName: req.query.last_name, ip: req.ip });
  const c = out.cert;
  let linkedin = null;
  if (c && (out.result === 'valid')) {
    const [iy, im] = String(c.issue_date).split('-');
    const p = new URLSearchParams({
      startTask: 'CERTIFICATION_NAME', name: c.course_name, organizationName: c.company_name,
      issueYear: iy, issueMonth: String(Number(im)), certUrl: `${cfg.baseUrl}/verify/${c.cert_number}`, certId: c.cert_number,
    });
    linkedin = `https://www.linkedin.com/profile/add?${p.toString()}`;
  }
  const status = out.result === 'unavailable' ? 503 : out.result === 'not_found' || out.result === 'invalid_format' ? 404 : 200;
  res.status(status).render('public/verify-result', {
    // Only echo a token the visitor already holds (from the QR code) and that verified; never derive it here.
    title: 'Credential Verification', recordTypes: require('../lib/schemes').RECORD_TYPES, out, c, linkedin, token: req.query.t && out.result !== 'tampered' ? String(req.query.t) : '',
    shareUrl: c ? `${cfg.baseUrl}/verify/${c.cert_number}` : '',
  });
}));

// Original PDF download — requires the QR token so PDFs can't be scraped by guessing IDs alone.
r.get('/verify/:cert/pdf', verifyLimiter, wrap(async (req, res) => {
  const id = String(req.params.cert).toUpperCase();
  const { rows: [c] } = await q(`SELECT cert_number, pdf_path, verification_hash FROM certificates WHERE cert_number = $1`, [id]);
  if (!c || !req.query.t || !safeEqual(String(req.query.t), qrToken(c.verification_hash))) return res.status(404).render('error', { title: 'Not found', message: 'Certificate PDF not available.' });
  const file = c.pdf_path && await getFile(c.pdf_path);
  if (!file) return res.status(404).render('error', { title: 'Not found', message: 'Certificate PDF not available.' });
  res.attachment(`${c.cert_number}.pdf`).type(file.type).send(file.content);
}));

r.get('/apply', (req, res, next) => (cfg.publicApply ? next() : res.status(404).render('error', { title: 'Page not found', message: 'The page you are looking for does not exist.' })), (req, res) => res.render('public/apply', { title: 'Apply to become an Authorized Training Provider', form: {}, error: null }));
r.post('/apply', (req, res, next) => (cfg.publicApply ? next() : res.status(404).render('error', { title: 'Page not found', message: 'The page you are looking for does not exist.' })), limiter(15, 10), wrap(async (req, res) => {
  const f = Object.fromEntries(['company_name', 'website', 'country', 'full_name', 'email', 'phone', 'password', 'agree'].map((k) => [k, String(req.body[k] || '').trim()]));
  f.email = f.email.toLowerCase();
  let error = null;
  if (!f.company_name || !f.full_name || !f.email || !f.phone || !f.password) error = 'Please fill in all required fields.';
  else if (['company_name', 'full_name', 'country'].some((k) => require('../lib/application-form').hasNonLatin(f[k]))) error = 'Please write the organization name, your name and the country in English (Latin letters). Names keep their own spelling in Latin letters; nothing is translated or converted.';
  else if (!/^[+\d][\d\s().-]{5,29}$/.test(f.phone)) error = 'Please enter a phone number with digits, for example +962 7 0000 0000.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) error = 'Please enter a valid email.';
  else if (f.password.length < 10) error = 'Password must be at least 10 characters.';
  else if (refusedPassword(f.password)) error = 'That is a published development password; choose another one.';
  else if (!f.agree) error = 'You must accept the Authorized Training Provider Program terms.';
  if (!error) {
    const { rows } = await q('SELECT 1 FROM users WHERE email = $1', [f.email]);
    if (rows.length) error = 'An account with this email already exists. Please log in.';
  }
  if (error) return res.status(400).render('public/apply', { title: 'Apply to become an Authorized Training Provider', form: { ...f, password: '' }, error });
  const hash = await bcrypt.hash(f.password, 12);
  const user = await tx(async (c) => {
    const { rows: [p] } = await c.query(`INSERT INTO platforms (company_name, website, country, contact_email, contact_phone) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [f.company_name, f.website || null, f.country || null, f.email, f.phone]);
    const { rows: [u] } = await c.query(`INSERT INTO users (platform_id, role, full_name, email, password_hash) VALUES ($1,'platform_admin',$2,$3,$4) RETURNING id, email`,
      [p.id, f.full_name, f.email, hash]);
    await c.query(`INSERT INTO certificate_templates (platform_id, name, design, signatory_name, signatory_title, security_config) VALUES ($1,'Default Executive','executive',$2,'Training Director',$3)`, [p.id, f.full_name, RECOMMENDED]);
    await audit({ user: u, platformId: p.id, action: 'platform.apply', target: f.company_name }, c);
    return u;
  });
  await require('../lib/email').queue({ to: f.email, name: f.full_name, template: 'account_created', data: { name: f.full_name, company: f.company_name }, dedupeKey: `account_created:${user.id}` }).catch(() => {});
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('error', { title: 'Error', message: 'Please log in.' });
    req.session.userId = user.id;
    flash(req, 'success', 'Your account is ready. Complete the application in short stages, and come back to it any time.');
    res.redirect('/portal/application');
  });
}));

r.get('/contact', (req, res) => res.render('public/contact', { title: 'Contact & Support', sent: false, error: null, form: {} }));
r.post('/contact', limiter(15, 5), wrap(async (req, res) => {
  const f = { name: String(req.body.name || '').trim(), email: String(req.body.email || '').trim(), topic: ['general', 'technical', 'accreditation', 'verification', 'complaint', 'appeal'].includes(req.body.topic) ? req.body.topic : 'general', message: String(req.body.message || '').trim() };
  if (!f.name || !f.email || f.message.length < 10 || f.message.length > 5000) {
    return res.status(400).render('public/contact', { title: 'Contact & Support', sent: false, error: 'Please provide your name, email and a message (10–5000 characters).', form: f });
  }
  await q(`INSERT INTO contact_messages (name, email, topic, message) VALUES ($1,$2,$3,$4)`, [f.name, f.email, f.topic, f.message]);
  // Complaints and appeals go straight into the quality register with their deadlines.
  if (f.topic === 'complaint' || f.topic === 'appeal') {
    const c = await createCase({ kind: f.topic, channel: 'web', complainant_name: f.name, complainant_email: f.email, subject_type: 'other', summary: f.message });
    await audit({ actorLabel: 'public contact form', action: 'qms.case.open', target: c.case_no });
  }
  res.render('public/contact', { title: 'Contact & Support', sent: true, error: null, form: {} });
}));

r.get('/sample.csv', (req, res) => res.type('text/csv; charset=utf-8').attachment('liv-trainees-template.csv').send(require('../lib/issuance').sampleCsv()));

// Issuer logos (public: shown on verification pages)
r.get('/logo/:platformId', wrap(async (req, res, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.platformId)) return next();
  const { rows: [p] } = await q('SELECT logo_path FROM platforms WHERE id = $1', [req.params.platformId]);
  const file = p?.logo_path && await getFile(p.logo_path);
  if (!file) return next();
  res.set('Cache-Control', 'public, max-age=86400').type(file.type).send(file.content);
}));

module.exports = r;
