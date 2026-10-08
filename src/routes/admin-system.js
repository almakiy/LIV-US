// Admin: system status (read only), two storage actions (copy disk-only files into the database, check file integrity)
// and the removal of the seeded demo partner from a public server.
const express = require('express');
const { audit } = require('../lib/audit');
const { requireSuper, wrap, flash } = require('../lib/guards');
const files = require('../lib/files');
const { collect } = require('../lib/system-status');
const demo = require('../lib/demo-purge');

const r = express.Router();
r.use(requireSuper);

r.get('/system', wrap(async (req, res) => {
  const { sections, storage } = await collect();
  const p = await demo.findDemo();
  const demoCounts = p ? await demo.preview(p) : null;
  res.render('admin/system', { title: 'System status', sections, missing: (storage.missing || []).slice(0, 25), missingCount: (storage.missing || []).length, durable: storage.durable,
    demo: p && (p.accreditation_status === 'active' || demoCounts.credentials) ? { ...p, n: demoCounts } : null });
}));

r.post('/system/purge-demo', wrap(async (req, res) => {
  if (String(req.body.confirm || '').trim() !== 'REMOVE') { flash(req, 'error', 'Type REMOVE to confirm the removal of the demo data.'); return res.redirect('/admin/system'); }
  const p = await demo.findDemo();
  if (!p) { flash(req, 'error', 'No demo partner found.'); return res.redirect('/admin/system'); }
  const n = await demo.purge(p, { user: req.user });
  flash(req, 'success', `Demo data removed: ${n.credentials} sample credential(s) no longer verify; the demo partner is suspended and its users are locked.`);
  res.redirect('/admin/system');
}));

r.post('/system/backfill', wrap(async (req, res) => {
  const copied = await files.backfill();
  await audit({ user: req.user, action: 'files.backfill', metadata: { copied } });
  flash(req, 'success', `${copied} file(s) copied from disk into the database.`);
  res.redirect('/admin/system');
}));

r.post('/system/integrity', wrap(async (req, res) => {
  const { checked, mismatched } = await files.checkIntegrity();
  await audit({ user: req.user, action: 'files.integrity_check', metadata: { checked, mismatched: mismatched.length } });
  if (mismatched.length) flash(req, 'error', `${mismatched.length} of ${checked} stored file(s) do not match their recorded SHA-256: ${mismatched.slice(0, 5).join(', ')}`);
  else flash(req, 'success', `All ${checked} stored file(s) match their recorded SHA-256.`);
  res.redirect('/admin/system');
}));

module.exports = r;
