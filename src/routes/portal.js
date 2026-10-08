const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const cfg = require('../config');
const { q } = require('../db');
const { audit } = require('../lib/audit');
const { newApiKey, randomToken, qrToken } = require('../lib/crypto');
const { FIELDS, REQUIRED, FIELD_LABELS, TEMPLATE_HEADER, TEMPLATE_ROWS, hasName, sampleCsv, maskId, autoMap, validateRows, issue } = require('../lib/issuance');
const { fetchCsvFromLink, SourceError } = require('../lib/csv-source');
const { parseTraineeFile, sampleXlsx, FileError, MAX_ROWS } = require('../lib/trainee-file');
const crypto = require('crypto');
const { renderCertificate, THEMES } = require('../lib/pdf');
const { normalizeConfig, RECOMMENDED } = require('../lib/pdf-security');
const { requirePlatformAdmin, requireActivePlatform, wrap, flash } = require('../lib/guards');
const { pendingAgreement } = require('../lib/agreements');
const { renderMarkdown } = require('../lib/content');
const { putFile, getFile } = require('../lib/files');
const { refusedPassword } = require('../lib/dev-defaults');

const r = express.Router();
r.use(requirePlatformAdmin);
// Partners must accept the active agreement version before using the portal (LIV staff acting on their behalf are exempt).
r.use(wrap(async (req, res, next) => {
  if (req.user.actingAs || req.path.startsWith('/agreement')) return next();
  const a = await pendingAgreement(req.user.platform_id);
  if (a) return res.redirect('/portal/agreement');
  next();
}));
const csrfCheck = (req, res, next) => req.app.locals.csrfCheck(req, res, next);

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } });

const pid = (req) => req.user.platform_id;
const loadPlatform = async (id) => (await q('SELECT * FROM platforms WHERE id = $1', [id])).rows[0];
const loadTemplate = async (platformId, id) => (await q('SELECT * FROM certificate_templates WHERE id = $1 AND platform_id = $2', [id, platformId])).rows[0];
const templates = async (platformId) => (await q('SELECT * FROM certificate_templates WHERE platform_id = $1 ORDER BY created_at', [platformId])).rows;

// ---------- Dashboard ----------
r.get('/', wrap(async (req, res) => {
  const { rows: [stats] } = await q(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status='active')::int AS active,
           count(*) FILTER (WHERE status='revoked')::int AS revoked,
           (SELECT count(*)::int FROM trainees WHERE platform_id = $1) AS trainees
      FROM certificates WHERE platform_id = $1`, [pid(req)]);
  const { rows: batches } = await q(`SELECT b.*, u.full_name FROM issuance_batches b LEFT JOIN users u ON u.id = b.created_by
    WHERE b.platform_id = $1 ORDER BY b.created_at DESC LIMIT 8`, [pid(req)]);
  const { rows: [lookups] } = await q(`SELECT count(*)::int AS n FROM verification_logs v JOIN certificates c ON c.id = v.certificate_id
    WHERE c.platform_id = $1 AND v.created_at > now() - interval '30 days'`, [pid(req)]);
  res.render('portal/dashboard', { title: 'Dashboard', stats, batches, lookups: lookups.n });
}));

// ---------- Issuance wizard ----------
const jobPath = (token) => path.join(cfg.storageDir, 'tmp', `${token.replace(/[^a-f0-9]/g, '')}.json`);
function loadJob(req) {
  const t = req.session.issueJob;
  if (!t || !fs.existsSync(jobPath(t))) return null;
  const job = JSON.parse(fs.readFileSync(jobPath(t), 'utf8'));
  return job.platformId === pid(req) ? job : null;
}
const saveJob = (token, job) => {
  fs.mkdirSync(path.dirname(jobPath(token)), { recursive: true });
  fs.writeFileSync(jobPath(token), JSON.stringify(job));
};
const mappedRows = (job) => job.rows.map((row) => Object.fromEntries(FIELDS.map((f) => [f, job.mapping[f] ? row[job.mapping[f]] : ''])));

r.get('/issue', wrap(async (req, res) => {
  res.render('portal/issue-upload', { title: 'Issuance Center', templates: await templates(pid(req)), error: null, allowXlsx: cfg.allowXlsx });
}));

// Uploaded trainee lists can contain ID numbers: remove abandoned wizard files after a few hours.
function purgeOldJobs() {
  const dir = path.join(cfg.storageDir, 'tmp');
  try {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (Date.now() - fs.statSync(fp).mtimeMs > 6 * 3600 * 1000) fs.rmSync(fp, { force: true });
    }
  } catch (_) { /* nothing to purge */ }
}

r.get('/issue/template.csv', (req, res) => {
  res.type('text/csv; charset=utf-8').attachment('liv-trainees-template.csv').send(sampleCsv());
});
r.get('/issue/template.xlsx', wrap(async (req, res) => {
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('liv-trainees-template.xlsx').send(await sampleXlsx(TEMPLATE_HEADER, TEMPLATE_ROWS));
}));

r.post('/issue/upload', csvUpload.single('csv'), csrfCheck, wrap(async (req, res) => {
  const tpls = await templates(pid(req));
  const fail = (error) => res.status(400).render('portal/issue-upload', { title: 'Issuance Center', templates: tpls, error, allowXlsx: cfg.allowXlsx });
  const tpl = tpls.find((t) => t.id === req.body.template_id);
  if (!tpl) return fail('Please choose a certificate template.');
  const link = String(req.body.source_url || '').trim();
  let buffer; let fileName;
  if (req.file) {
    const okExt = cfg.allowXlsx ? /\.(csv|xlsx)$/i : /\.csv$/i;
    if (!okExt.test(req.file.originalname)) return fail(cfg.allowXlsx ? 'Upload a .csv or .xlsx file. Old .xls files are not supported.' : 'Only .csv files are accepted. In Excel use Save As ▸ CSV UTF-8.');
    buffer = req.file.buffer; fileName = req.file.originalname.slice(0, 200);
  } else if (link) {
    try { ({ buffer, fileName } = await fetchCsvFromLink(link)); } catch (e) { if (e instanceof SourceError) return fail(e.message); throw e; }
  } else return fail('Choose a file, or paste a Google Drive / Google Sheets link.');
  let records;
  try { ({ records } = await parseTraineeFile(buffer, { allowXlsx: cfg.allowXlsx })); } catch (e) { if (e instanceof FileError) return fail(e.message); throw e; }
  if (!records.length) return fail('The file has no data rows.');
  if (records.length > MAX_ROWS) return fail(`Maximum ${MAX_ROWS} rows per upload. Split the file and try again.`);
  const headers = Object.keys(records[0]);
  purgeOldJobs();
  const token = randomToken();
  saveJob(token, { platformId: pid(req), templateId: tpl.id, fileName, headers, rows: records, mapping: autoMap(headers) });
  req.session.issueJob = token;
  res.redirect('/portal/issue/map');
}));

r.get('/issue/map', (req, res) => {
  const job = loadJob(req);
  if (!job) return res.redirect('/portal/issue');
  res.render('portal/issue-map', { title: 'Map columns', job, FIELDS, REQUIRED, FIELD_LABELS, error: null });
});

r.post('/issue/map', (req, res) => {
  const job = loadJob(req);
  if (!job) return res.redirect('/portal/issue');
  const mapping = {};
  for (const f of FIELDS) mapping[f] = job.headers.includes(req.body[f]) ? req.body[f] : '';
  const missing = REQUIRED.filter((f) => !mapping[f]).map((f) => FIELD_LABELS[f]);
  if (!hasName(mapping)) missing.unshift('Full name (or First name + Last name)');
  if (missing.length) return res.status(400).render('portal/issue-map', { title: 'Map columns', job: { ...job, mapping }, FIELDS, REQUIRED, FIELD_LABELS, error: `Map the required fields: ${missing.join(', ')}` });
  job.mapping = mapping;
  saveJob(req.session.issueJob, job);
  res.redirect('/portal/issue/review');
});

r.get('/issue/review', wrap(async (req, res) => {
  const job = loadJob(req);
  if (!job) return res.redirect('/portal/issue');
  const results = await validateRows(mappedRows(job), pid(req));
  const tpl = await loadTemplate(pid(req), job.templateId);
  const valid = results.filter((x) => !x.errors.length).length;
  res.render('portal/issue-review', { title: 'Review & issue', job, tpl, results, valid, invalid: results.length - valid, maskId });
}));

r.post('/issue/confirm', requireActivePlatform, wrap(async (req, res) => {
  const job = loadJob(req);
  if (!job) return res.redirect('/portal/issue');
  const results = await validateRows(mappedRows(job), pid(req));
  const valid = results.filter((x) => !x.errors.length);
  if (!valid.length) { flash(req, 'error', 'There are no valid rows to issue.'); return res.redirect('/portal/issue/review'); }
  if (valid.length < results.length && req.body.skip_invalid !== 'on') {
    flash(req, 'error', 'Some rows have errors. Tick "Skip invalid rows" or fix the file and re-upload.');
    return res.redirect('/portal/issue/review');
  }
  const [platform, tpl] = await Promise.all([loadPlatform(pid(req)), loadTemplate(pid(req), job.templateId)]);
  const out = await issue({ rows: valid, platform, template: tpl, user: req.user, source: 'csv', fileName: job.fileName, totalRows: results.length });
  fs.rmSync(jobPath(req.session.issueJob), { force: true });
  delete req.session.issueJob;
  flash(req, 'success', `${out.certificates.length} certificate(s) issued${results.length - valid.length ? `, ${results.length - valid.length} row(s) skipped` : ''}.`);
  res.redirect(`/portal/batches/${out.batch.id}`);
}));

r.post('/issue/cancel', (req, res) => {
  if (req.session.issueJob) fs.rmSync(jobPath(req.session.issueJob), { force: true });
  delete req.session.issueJob;
  res.redirect('/portal/issue');
});

// ---------- Batches ----------
const UUID_RE = /^[0-9a-f-]{36}$/i;
async function batchWithCerts(req) {
  if (!UUID_RE.test(req.params.id)) return null;
  const { rows: [batch] } = await q('SELECT * FROM issuance_batches WHERE id = $1 AND platform_id = $2', [req.params.id, pid(req)]);
  if (!batch) return null;
  const { rows: certs } = await q('SELECT * FROM certificates WHERE batch_id = $1 ORDER BY created_at', [batch.id]);
  return { batch, certs };
}
const verifyLink = (c) => `${cfg.baseUrl}/verify/${c.cert_number}?t=${qrToken(c.verification_hash)}`;
const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV formula-injection guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

r.get('/batches/:id', wrap(async (req, res, next) => {
  const d = await batchWithCerts(req);
  if (!d) return next();
  res.render('portal/batch', { title: 'Issuance batch', ...d, verifyLink });
}));

r.get('/batches/:id/results.csv', wrap(async (req, res, next) => {
  const d = await batchWithCerts(req);
  if (!d) return next();
  const head = ['cert_number', 'serial_no', 'first_name', 'last_name', 'id_last4', 'email', 'course_name', 'completion_date', 'issue_date', 'status', 'verify_url'];
  const lines = d.certs.map((c) => [c.cert_number, c.holder_ref, c.recipient_first_name, c.recipient_last_name, c.id_last4, c.recipient_email, c.course_name, c.completion_date, c.issue_date, c.status, verifyLink(c)].map(csvCell).join(','));
  res.type('text/csv').attachment(`batch-${d.batch.id.slice(0, 8)}-results.csv`).send(['\uFEFF' + head.join(','), ...lines].join('\r\n') + '\r\n');
}));

r.get('/batches/:id/pdfs.zip', wrap(async (req, res, next) => {
  const d = await batchWithCerts(req);
  if (!d) return next();
  res.attachment(`batch-${d.batch.id.slice(0, 8)}-certificates.zip`);
  const zip = archiver('zip', { zlib: { level: 6 } });
  let failed = null;
  zip.on('error', (e) => { failed = e; });
  zip.pipe(res);
  // One file at a time: a batch can hold thousands of PDFs, so they are never all in memory together.
  for (const c of d.certs) {
    const file = !failed && c.pdf_path && await getFile(c.pdf_path);
    if (!file) continue;
    await new Promise((resolve) => {
      const done = () => { zip.off('entry', done); zip.off('error', done); resolve(); };
      zip.on('entry', done); zip.on('error', done);
      zip.append(file.content, { name: `${c.cert_number}_${c.recipient_last_name}.pdf`.replace(/[^\w.\-]/g, '_') });
    });
  }
  if (failed) return next(failed);
  await zip.finalize();
}));

// ---------- Records ----------
r.get('/certificates', wrap(async (req, res) => {
  const search = String(req.query.q || '').trim().slice(0, 100);
  const status = ['active', 'revoked'].includes(req.query.status) ? req.query.status : '';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = ['platform_id = $1']; const params = [pid(req)];
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(lower(recipient_first_name || ' ' || recipient_last_name) LIKE $${params.length} OR lower(recipient_email) LIKE $${params.length} OR lower(cert_number) LIKE $${params.length} OR lower(course_name) LIKE $${params.length} OR lower(coalesce(holder_ref,'')) LIKE $${params.length})`);
  }
  if (status === 'active') where.push(`status='active'`);
  if (status === 'revoked') where.push(`status='revoked'`);
  const w = where.join(' AND ');
  const { rows: [{ n }] } = await q(`SELECT count(*)::int AS n FROM certificates WHERE ${w}`, params);
  const per = 25;
  const { rows } = await q(`SELECT * FROM certificates WHERE ${w} ORDER BY created_at DESC LIMIT ${per} OFFSET ${(page - 1) * per}`, params);
  res.render('portal/certificates', { title: 'Records', rows, n, page, pages: Math.max(1, Math.ceil(n / per)), search, status, verifyLink });
}));

async function ownCert(req) {
  const { rows: [c] } = await q(`SELECT c.*, t.name AS template_name, u.full_name AS revoked_by_name FROM certificates c
    LEFT JOIN certificate_templates t ON t.id = c.template_id LEFT JOIN users u ON u.id = c.revoked_by
    WHERE c.cert_number = $1 AND c.platform_id = $2`, [String(req.params.num).toUpperCase(), pid(req)]);
  return c;
}

r.get('/certificates/:num', wrap(async (req, res, next) => {
  const c = await ownCert(req);
  if (!c) return next();
  const { rows: [v] } = await q(`SELECT count(*)::int AS n, max(created_at) AS last FROM verification_logs WHERE certificate_id = $1`, [c.id]);
  res.render('portal/certificate', { title: c.cert_number, c, v, verifyLink, maskId });
}));

r.get('/certificates/:num/pdf', wrap(async (req, res, next) => {
  const c = await ownCert(req);
  if (!c) return next();
  const file = c.pdf_path && await getFile(c.pdf_path);
  if (!file) return res.status(404).render('error', { title: 'Not found', message: 'The PDF of this credential is not available. Please contact LIV; the credential record and its verification page are not affected.' });
  res.attachment(`${c.cert_number}.pdf`).type(file.type).send(file.content);
}));

r.post('/certificates/:num/revoke', wrap(async (req, res, next) => {
  const c = await ownCert(req);
  if (!c) return next();
  const reason = String(req.body.reason || '').trim().slice(0, 500);
  if (reason.length < 5) { flash(req, 'error', 'Please give a revocation reason (min 5 characters).'); return res.redirect(`/portal/certificates/${c.cert_number}`); }
  if (c.status === 'revoked') return res.redirect(`/portal/certificates/${c.cert_number}`);
  await q(`UPDATE certificates SET status='revoked', revoked_at=now(), revoked_by=$1, revocation_reason=$2 WHERE id=$3`, [req.user.id, reason, c.id]);
  await audit({ user: req.user, platformId: pid(req), action: 'certificate.revoke', target: c.cert_number, metadata: { reason } });
  flash(req, 'success', `Certificate ${c.cert_number} revoked.`);
  res.redirect(`/portal/certificates/${c.cert_number}`);
}));

// ---------- Templates ----------
function readTemplateForm(body) {
  return {
    name: String(body.name || '').trim().slice(0, 100) || 'Untitled template',
    design: THEMES[body.design] ? body.design : 'classic',
    signatory_name: String(body.signatory_name || '').trim().slice(0, 150) || null,
    signatory_title: String(body.signatory_title || '').trim().slice(0, 150) || null,
    validity_months: null, // certificates do not expire
    security_config: normalizeConfig({
      guilloche: body.guilloche, colors: body.colors, microtext: body.microtext === 'on', ghost: body.ghost === 'on',
      tiled: body.tiled === 'on', fingerprint: body.fingerprint === 'on', verifyStrip: body.verifyStrip === 'on',
      qrBadge: body.qrBadge === 'on', legalNote: body.legalNote === 'on', strip: body.strip === 'on',
    }),
  };
}
r.get('/templates', wrap(async (req, res) => {
  res.render('portal/templates', { title: 'Certificate templates', templates: await templates(pid(req)), edit: null, THEMES, sec: RECOMMENDED });
}));
r.get('/templates/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const t = await loadTemplate(pid(req), req.params.id);
  if (!t) return next();
  res.render('portal/templates', { title: 'Edit template', templates: await templates(pid(req)), edit: t, THEMES, sec: normalizeConfig(t.security_config) });
}));
r.post('/templates', wrap(async (req, res) => {
  const t = readTemplateForm(req.body);
  if (UUID_RE.test(req.body.id || '')) {
    await q(`UPDATE certificate_templates SET name=$1, design=$2, signatory_name=$3, signatory_title=$4, validity_months=$5, security_config=$6 WHERE id=$7 AND platform_id=$8`,
      [t.name, t.design, t.signatory_name, t.signatory_title, t.validity_months, t.security_config, req.body.id, pid(req)]);
  } else {
    await q(`INSERT INTO certificate_templates (platform_id, name, design, signatory_name, signatory_title, validity_months, security_config) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [pid(req), t.name, t.design, t.signatory_name, t.signatory_title, t.validity_months, t.security_config]);
  }
  await audit({ user: req.user, platformId: pid(req), action: 'template.save', target: t.name });
  flash(req, 'success', 'Template saved.');
  res.redirect('/portal/templates');
}));
r.post('/templates/preview', wrap(async (req, res) => {
  const t = readTemplateForm(req.body);
  const platform = await loadPlatform(pid(req));
  const today = new Date().toISOString().slice(0, 10);
  const pdf = await renderCertificate({
    cert_number: 'LIV-2026-SAMPLE00', first_name: 'Jane', last_name: 'Doe', course_name: 'Sample Course Title',
    completion_date: today, issue_date: today, expiry_date: null,
    verify_url: `${cfg.baseUrl}/verify/LIV-2026-SAMPLE00`,
    verification_hash: crypto.createHash('sha256').update('preview').digest('hex'),
  }, platform, t);
  res.type('application/pdf').set('Content-Disposition', 'inline; filename="preview.pdf"').send(pdf);
}));

// ---------- Billing (partner view) ----------
const billingLib = require('../lib/billing');
r.get('/billing', wrap(async (req, res) => {
  const platform = await loadPlatform(pid(req));
  const usage = await require('../lib/billing-store').usageSummary(platform);
  const { rows: invoices } = await q(`SELECT * FROM invoices WHERE platform_id = $1 AND status <> 'draft' ORDER BY issue_date DESC, created_at DESC LIMIT 100`, [pid(req)]);
  const owed = invoices.filter((i) => i.status === 'open').reduce((s, i) => s + Number(i.total_cents) - Number(i.amount_paid_cents), 0);
  res.render('portal/billing', { title: 'Billing', platform, usage, invoices, owed, money: billingLib.money, isOverdue: billingLib.isOverdue, cfg });
}));
async function ownInvoice(req) {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return null;
  const { rows: [inv] } = await q(`SELECT i.*, p.company_name FROM invoices i JOIN platforms p ON p.id = i.platform_id WHERE i.id = $1 AND i.platform_id = $2 AND i.status <> 'draft'`, [req.params.id, pid(req)]);
  if (!inv) return null;
  const { rows: lines } = await q('SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY description', [inv.id]);
  const { rows: payments } = await q('SELECT * FROM payments WHERE invoice_id = $1 ORDER BY received_on', [inv.id]);
  return { inv, lines, payments };
}
r.get('/billing/invoices/:id', wrap(async (req, res, next) => {
  const d = await ownInvoice(req); if (!d) return next();
  res.render('portal/billing-invoice', { title: d.inv.number, ...d, money: billingLib.money, isOverdue: billingLib.isOverdue, cfg });
}));
r.post('/billing/invoices/:id/pay', wrap(async (req, res, next) => {
  const d = await ownInvoice(req); if (!d) return next();
  const back = `/portal/billing/invoices/${d.inv.id}`;
  const balance = Number(d.inv.total_cents) - Number(d.inv.amount_paid_cents);
  if (!cfg.stripeSecretKey) { flash(req, 'error', 'Card payment is not available yet. Please pay by bank transfer.'); return res.redirect(back); }
  if (d.inv.status !== 'open' || balance <= 0) { flash(req, 'error', 'This invoice is not open for payment.'); return res.redirect(back); }
  try {
    const stripe = require('../lib/stripe');
    const { rows: [p] } = await q('SELECT billing_email, contact_email FROM platforms WHERE id = $1', [pid(req)]);
    const s = await stripe.createCheckoutSession({ secretKey: cfg.stripeSecretKey, invoice: d.inv, balanceCents: balance, customerEmail: (p && (p.billing_email || p.contact_email)) || req.user.email, baseUrl: cfg.baseUrl });
    await audit({ user: req.user, platformId: pid(req), action: 'billing.checkout_started', target: d.inv.id, metadata: { session: s.id } });
    return res.redirect(303, s.url);
  } catch (e) {
    console.error('Stripe checkout failed:', e.message);
    flash(req, 'error', 'Card payment could not be started. Please try again or pay by bank transfer.');
    return res.redirect(back);
  }
}));
r.get('/billing/invoices/:id/pdf', wrap(async (req, res, next) => {
  const d = await ownInvoice(req); if (!d) return next();
  const pdf = await require('../lib/invoice-pdf').renderInvoice(d.inv, d.lines, d.payments);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${d.inv.number}.pdf"` }).send(pdf);
}));

// ---------- Agreement and billing details ----------
r.get('/agreement', wrap(async (req, res) => {
  const a = await pendingAgreement(pid(req));
  if (!a) return res.redirect('/portal');
  res.render('portal/agreement', { title: 'Partner agreement', a, html: renderMarkdown(a.body_md) });
}));
r.post('/agreement', wrap(async (req, res) => {
  const a = await pendingAgreement(pid(req));
  if (!a) return res.redirect('/portal');
  const name = String(req.body.accepted_name || '').trim().slice(0, 200);
  if (req.body.agree !== 'on' || name.length < 3) { flash(req, 'error', 'Tick the box and type your full name to accept.'); return res.redirect('/portal/agreement'); }
  await q(`INSERT INTO agreement_acceptances (platform_id, agreement_id, user_id, accepted_name, ip_hash, user_agent) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (platform_id, agreement_id) DO NOTHING`,
    [pid(req), a.id, req.user.id, name, require('../lib/crypto').ipHash(req.ip), String(req.get('user-agent') || '').slice(0, 200)]);
  await audit({ user: req.user, platformId: pid(req), action: 'agreement.accept', target: `v${a.version}`, metadata: { name } });
  flash(req, 'success', `Agreement version ${a.version} accepted. Thank you.`);
  res.redirect('/portal');
}));
r.post('/settings/billing', wrap(async (req, res) => {
  const t = (k, n) => String(req.body[k] || '').trim().slice(0, n) || null;
  const email = t('billing_email', 255);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { flash(req, 'error', 'Enter a valid billing email.'); return res.redirect('/portal/settings#billing'); }
  await q('UPDATE platforms SET billing_name=$1, billing_email=$2, billing_address=$3, tax_id=$4 WHERE id=$5', [t('billing_name', 255), email, t('billing_address', 1000), t('tax_id', 60), pid(req)]);
  await audit({ user: req.user, platformId: pid(req), action: 'platform.update_billing' });
  flash(req, 'success', 'Billing details saved.');
  res.redirect('/portal/settings#billing');
}));

// ---------- Settings ----------
r.get('/settings', wrap(async (req, res) => {
  const platform = await loadPlatform(pid(req));
  const { rows: users } = await q('SELECT id, full_name, email, last_login_at, created_at FROM users WHERE platform_id = $1 ORDER BY created_at', [pid(req)]);
  const { rows: keys } = await q('SELECT * FROM api_keys WHERE platform_id = $1 ORDER BY created_at DESC', [pid(req)]);
  const newKey = req.session.newKey || null;
  delete req.session.newKey;
  res.render('portal/settings', { title: 'Settings', platform, users, keys, newKey });
}));

r.post('/settings/profile', wrap(async (req, res) => {
  const color = /^#[0-9a-f]{6}$/i.test(req.body.primary_color || '') ? req.body.primary_color : '#0B2545';
  const name = String(req.body.company_name || '').trim().slice(0, 255);
  if (!name) { flash(req, 'error', 'Company name is required.'); return res.redirect('/portal/settings'); }
  await q(`UPDATE platforms SET company_name=$1, website=$2, country=$3, contact_email=$4, primary_color=$5 WHERE id=$6`,
    [name, String(req.body.website || '').trim().slice(0, 255) || null, String(req.body.country || '').trim().slice(0, 100) || null,
      String(req.body.contact_email || '').trim().slice(0, 255) || null, color, pid(req)]);
  await audit({ user: req.user, platformId: pid(req), action: 'platform.update_profile' });
  flash(req, 'success', 'Profile updated.');
  res.redirect('/portal/settings');
}));

r.post('/settings/logo', logoUpload.single('logo'), csrfCheck, wrap(async (req, res) => {
  const b = req.file?.buffer;
  let ext = null;
  if (b && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) ext = 'png';
  else if (b && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ext = 'jpg';
  if (!ext) { flash(req, 'error', 'Logo must be a PNG or JPEG file under 1 MB.'); return res.redirect('/portal/settings'); }
  const rel = path.posix.join('logos', `${pid(req)}-${Date.now()}.${ext}`);
  await putFile(rel, b);
  await q('UPDATE platforms SET logo_path=$1 WHERE id=$2', [rel, pid(req)]);
  await audit({ user: req.user, platformId: pid(req), action: 'platform.update_logo' });
  flash(req, 'success', 'Logo updated. It appears on your verification records; LIV credentials carry the LIV identity only.');
  res.redirect('/portal/settings');
}));

r.post('/settings/users', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const full_name = String(req.body.full_name || '').trim().slice(0, 200);
  const password = String(req.body.password || '');
  if (!full_name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || password.length < 10) {
    flash(req, 'error', 'Name, valid email and a temporary password of 10+ characters are required.'); return res.redirect('/portal/settings');
  }
  if (refusedPassword(password)) { flash(req, 'error', 'That is a published development password; choose another one.'); return res.redirect('/portal/settings'); }
  try {
    await q(`INSERT INTO users (platform_id, role, full_name, email, password_hash, must_change_password) VALUES ($1,'platform_admin',$2,$3,$4,true)`, [pid(req), full_name, email, await bcrypt.hash(password, 12)]);
  } catch (e) {
    if (e.code === '23505') { flash(req, 'error', 'A user with that email already exists.'); return res.redirect('/portal/settings'); }
    throw e;
  }
  await audit({ user: req.user, platformId: pid(req), action: 'user.create', target: email });
  flash(req, 'success', `User ${email} added. Share the temporary password securely.`);
  res.redirect('/portal/settings');
}));

r.post('/settings/keys', wrap(async (req, res) => {
  const { key, prefix, hash } = newApiKey();
  const label = String(req.body.label || '').trim().slice(0, 100) || 'API key';
  await q('INSERT INTO api_keys (platform_id, label, prefix, key_hash) VALUES ($1,$2,$3,$4)', [pid(req), label, prefix, hash]);
  await audit({ user: req.user, platformId: pid(req), action: 'api_key.create', target: prefix });
  req.session.newKey = key;
  res.redirect('/portal/settings#api');
}));

r.post('/settings/keys/:id/revoke', wrap(async (req, res) => {
  if (UUID_RE.test(req.params.id)) {
    const { rowCount } = await q('UPDATE api_keys SET revoked_at = now() WHERE id=$1 AND platform_id=$2 AND revoked_at IS NULL', [req.params.id, pid(req)]);
    if (rowCount) await audit({ user: req.user, platformId: pid(req), action: 'api_key.revoke', target: req.params.id });
  }
  flash(req, 'success', 'API key revoked.');
  res.redirect('/portal/settings#api');
}));

r.get('/api-docs', wrap(async (req, res) => {
  res.render('portal/api-docs', { title: 'API documentation', templates: await templates(pid(req)) });
}));

module.exports = r;
