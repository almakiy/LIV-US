const express = require('express');
const cfg = require('../config');
const { q } = require('../db');
const { sha256, qrToken } = require('../lib/crypto');
const { audit } = require('../lib/audit');
const { validateRows, issue } = require('../lib/issuance');
const { verifyCertificate, publicView } = require('../lib/verify');
const { limiter, wrap } = require('../lib/guards');

const r = express.Router();
const MAX_PER_CALL = 500;

// Public verification endpoint
r.get('/verify/:cert', limiter(1, 60, true), wrap(async (req, res) => {
  const out = await verifyCertificate(req.params.cert, { token: req.query.t, ip: req.ip, channel: 'api' });
  const body = publicView(out, cfg.baseUrl);
  res.status(out.cert ? 200 : 404).json(body);
}));

// API key auth for everything below
r.use(wrap(async (req, res, next) => {
  const raw = req.get('x-api-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!raw) return res.status(401).json({ error: 'Missing API key (X-API-Key header).' });
  const { rows: [k] } = await q(`SELECT k.id AS key_id, k.prefix AS key_prefix, p.* FROM api_keys k JOIN platforms p ON p.id = k.platform_id
    WHERE k.key_hash = $1 AND k.revoked_at IS NULL`, [sha256(raw)]);
  if (!k) return res.status(401).json({ error: 'Invalid or revoked API key.' });
  q('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [k.key_id]).catch(() => {});
  const { key_id, key_prefix, ...platform } = k;
  req.apiKey = { id: key_id, prefix: key_prefix };
  req.platform = platform; // platforms row (id = platform id)
  next();
}));
r.use(limiter(1, 120, true));

const certJson = (c) => ({
  cert_number: c.cert_number, serial_no: c.holder_ref, id_last4: c.id_last4, status: c.status,
  first_name: c.recipient_first_name, last_name: c.recipient_last_name, email: c.recipient_email,
  course_name: c.course_name, completion_date: c.completion_date, issue_date: c.issue_date,
  revoked_at: c.revoked_at, revocation_reason: c.revocation_reason,
  verify_url: `${cfg.baseUrl}/verify/${c.cert_number}?t=${qrToken(c.verification_hash)}`,
  pdf_url: `${cfg.baseUrl}/verify/${c.cert_number}/pdf?t=${qrToken(c.verification_hash)}`,
});

r.post('/certificates', wrap(async (req, res) => {
  const p = req.platform;
  if (p.service_hold) return res.status(403).json({ error: 'Issuance is paused: the account is on service hold for unpaid invoices (accreditation status is unchanged). Contact LIV billing.' });
  if (p.accreditation_status !== 'active') return res.status(403).json({ error: `Platform accreditation is ${p.accreditation_status}; issuance disabled.` });
  const body = req.body || {};
  const list = Array.isArray(body) ? body : Array.isArray(body.certificates) ? body.certificates : [body];
  if (!list.length || list.length > MAX_PER_CALL) return res.status(400).json({ error: `Send between 1 and ${MAX_PER_CALL} certificates per request.` });
  const idem = (req.get('idempotency-key') || '').trim().slice(0, 100) || null;
  if (idem) {
    const { rows: [b] } = await q('SELECT id FROM issuance_batches WHERE platform_id=$1 AND idempotency_key=$2', [p.id, idem]);
    if (b) {
      const { rows } = await q('SELECT * FROM certificates WHERE batch_id = $1 ORDER BY created_at', [b.id]);
      return res.status(200).json({ batch_id: b.id, idempotent_replay: true, certificates: rows.map(certJson) });
    }
  }
  const templateId = body.template_id || null;
  const { rows: [tpl] } = templateId
    ? await q('SELECT * FROM certificate_templates WHERE id::text = $1 AND platform_id = $2', [String(templateId), p.id])
    : await q('SELECT * FROM certificate_templates WHERE platform_id = $1 ORDER BY created_at LIMIT 1', [p.id]);
  if (!tpl) return res.status(400).json({ error: 'Unknown template_id (or no template configured).' });
  const results = await validateRows(list.map((x) => (x && typeof x === 'object' ? x : {})), p.id);
  const bad = results.filter((x) => x.errors.length);
  if (bad.length) return res.status(422).json({ error: 'Validation failed; nothing was issued.', rows: bad.map((x) => ({ index: x.index, errors: x.errors })) });
  try {
    const out = await issue({ rows: results, platform: p, template: tpl, source: 'api', idempotencyKey: idem, actorLabel: `api:${req.apiKey.prefix}` });
    const { rows } = await q('SELECT * FROM certificates WHERE batch_id = $1 ORDER BY created_at', [out.batch.id]);
    res.status(201).json({ batch_id: out.batch.id, certificates: rows.map(certJson) });
  } catch (e) {
    if (e.status === 409) return res.status(409).json({ error: e.message });
    if (e.code === '23505' && idem) return res.status(409).json({ error: 'A request with this Idempotency-Key is already being processed.' });
    throw e;
  }
}));

r.get('/certificates', wrap(async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const { rows } = await q('SELECT * FROM certificates WHERE platform_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [req.platform.id, limit, offset]);
  res.json({ data: rows.map(certJson), limit, offset });
}));

r.get('/certificates/:num', wrap(async (req, res) => {
  const { rows: [c] } = await q('SELECT * FROM certificates WHERE cert_number = $1 AND platform_id = $2', [String(req.params.num).toUpperCase(), req.platform.id]);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(certJson(c));
}));

r.post('/certificates/:num/revoke', wrap(async (req, res) => {
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (reason.length < 5) return res.status(400).json({ error: 'reason (min 5 characters) is required' });
  const num = String(req.params.num).toUpperCase();
  const { rows: [c] } = await q(`UPDATE certificates SET status='revoked', revoked_at=now(), revocation_reason=$1
    WHERE cert_number=$2 AND platform_id=$3 AND status='active' RETURNING *`, [reason, num, req.platform.id]);
  if (!c) return res.status(404).json({ error: 'Not found or already revoked' });
  await audit({ actorLabel: `api:${req.apiKey.prefix}`, platformId: req.platform.id, action: 'certificate.revoke', target: num, metadata: { reason } });
  res.json(certJson(c));
}));

module.exports = r;
