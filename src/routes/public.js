const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const cfg = require('../config');
const { q, tx } = require('../db');
const { verifyCertificate, CERT_RE } = require('../lib/verify');
const { qrToken, safeEqual } = require('../lib/crypto');
const { audit } = require('../lib/audit');
const { RECOMMENDED } = require('../lib/pdf-security');
const { limiter, wrap, flash } = require('../lib/guards');

const r = express.Router();
const verifyLimiter = limiter(1, 30);

r.get('/', (req, res) => res.render('public/home', { title: 'Official Certificate Verification & Accreditation' }));
r.get('/about', (req, res) => res.render('public/about', { title: 'About Us' }));
r.get('/accreditation', (req, res) => res.render('public/accreditation', { title: 'Accreditation' }));

r.get('/verify', verifyLimiter, (req, res) => {
  const id = String(req.query.id || '').trim().toUpperCase();
  if (!id) return res.render('public/verify-search', { title: 'Verify a Certificate', error: null, id: '', last_name: '' });
  if (!CERT_RE.test(id)) return res.status(400).render('public/verify-search', { title: 'Verify a Certificate', error: 'That does not look like a valid Certificate ID. Format: LIV-2026-XXXXXXXX', id, last_name: req.query.last_name || '' });
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
  const status = out.result === 'not_found' || out.result === 'invalid_format' ? 404 : 200;
  res.status(status).render('public/verify-result', {
    // Only echo a token the visitor already holds (from the QR code) and that verified; never derive it here.
    title: 'Certificate Verification', out, c, linkedin, token: req.query.t && out.result !== 'tampered' ? String(req.query.t) : '',
    shareUrl: c ? `${cfg.baseUrl}/verify/${c.cert_number}` : '',
  });
}));

// Original PDF download — requires the QR token so PDFs can't be scraped by guessing IDs alone.
r.get('/verify/:cert/pdf', verifyLimiter, wrap(async (req, res) => {
  const id = String(req.params.cert).toUpperCase();
  const { rows: [c] } = await q(`SELECT cert_number, pdf_path, verification_hash FROM certificates WHERE cert_number = $1`, [id]);
  if (!c || !req.query.t || !safeEqual(String(req.query.t), qrToken(c.verification_hash))) return res.status(404).render('error', { title: 'Not found', message: 'Certificate PDF not available.' });
  const abs = path.join(cfg.storageDir, c.pdf_path);
  if (!fs.existsSync(abs)) return res.status(404).render('error', { title: 'Not found', message: 'Certificate PDF not available.' });
  res.download(abs, `${c.cert_number}.pdf`);
}));

r.get('/apply', (req, res, next) => (cfg.publicApply ? next() : res.status(404).render('error', { title: 'Page not found', message: 'The page you are looking for does not exist.' })), (req, res) => res.render('public/apply', { title: 'Apply for Accreditation', form: {}, error: null }));
r.post('/apply', (req, res, next) => (cfg.publicApply ? next() : res.status(404).render('error', { title: 'Page not found', message: 'The page you are looking for does not exist.' })), limiter(15, 10), wrap(async (req, res) => {
  const f = Object.fromEntries(['company_name', 'website', 'country', 'full_name', 'email', 'password', 'agree'].map((k) => [k, String(req.body[k] || '').trim()]));
  f.email = f.email.toLowerCase();
  let error = null;
  if (!f.company_name || !f.full_name || !f.email || !f.password) error = 'Please fill in all required fields.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) error = 'Please enter a valid email.';
  else if (f.password.length < 10) error = 'Password must be at least 10 characters.';
  else if (!f.agree) error = 'You must accept the accreditation terms.';
  if (!error) {
    const { rows } = await q('SELECT 1 FROM users WHERE email = $1', [f.email]);
    if (rows.length) error = 'An account with this email already exists. Please log in.';
  }
  if (error) return res.status(400).render('public/apply', { title: 'Apply for Accreditation', form: { ...f, password: '' }, error });
  const hash = await bcrypt.hash(f.password, 12);
  const user = await tx(async (c) => {
    const { rows: [p] } = await c.query(`INSERT INTO platforms (company_name, website, country, contact_email) VALUES ($1,$2,$3,$4) RETURNING id`,
      [f.company_name, f.website || null, f.country || null, f.email]);
    const { rows: [u] } = await c.query(`INSERT INTO users (platform_id, role, full_name, email, password_hash) VALUES ($1,'platform_admin',$2,$3,$4) RETURNING id, email`,
      [p.id, f.full_name, f.email, hash]);
    await c.query(`INSERT INTO certificate_templates (platform_id, name, design, signatory_name, signatory_title, security_config) VALUES ($1,'Default Classic','classic',$2,'Training Director',$3)`, [p.id, f.full_name, RECOMMENDED]);
    await audit({ user: u, platformId: p.id, action: 'platform.apply', target: f.company_name }, c);
    return u;
  });
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('error', { title: 'Error', message: 'Please log in.' });
    req.session.userId = user.id;
    flash(req, 'success', 'Application received. Our team will review your accreditation shortly — you can set up your profile and templates meanwhile.');
    res.redirect('/portal');
  });
}));

r.get('/contact', (req, res) => res.render('public/contact', { title: 'Contact & Support', sent: false, error: null, form: {} }));
r.post('/contact', limiter(15, 5), wrap(async (req, res) => {
  const f = { name: String(req.body.name || '').trim(), email: String(req.body.email || '').trim(), topic: ['general', 'technical', 'accreditation', 'verification'].includes(req.body.topic) ? req.body.topic : 'general', message: String(req.body.message || '').trim() };
  if (!f.name || !f.email || f.message.length < 10 || f.message.length > 5000) {
    return res.status(400).render('public/contact', { title: 'Contact & Support', sent: false, error: 'Please provide your name, email and a message (10–5000 characters).', form: f });
  }
  await q(`INSERT INTO contact_messages (name, email, topic, message) VALUES ($1,$2,$3,$4)`, [f.name, f.email, f.topic, f.message]);
  res.render('public/contact', { title: 'Contact & Support', sent: true, error: null, form: {} });
}));

r.get('/sample.csv', (req, res) => res.type('text/csv; charset=utf-8').attachment('liv-trainees-template.csv').send(require('../lib/issuance').sampleCsv()));

// Issuer logos (public: shown on verification pages)
r.get('/logo/:platformId', wrap(async (req, res, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.platformId)) return next();
  const { rows: [p] } = await q('SELECT logo_path FROM platforms WHERE id = $1', [req.params.platformId]);
  if (!p?.logo_path) return next();
  res.set('Cache-Control', 'public, max-age=86400').sendFile(path.join(cfg.storageDir, p.logo_path));
}));

module.exports = r;
