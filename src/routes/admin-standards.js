// Admin: standards versions and the records retention schedule (Batch H). Mounted under /admin.
const express = require('express');
const { requireSuper, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const S = require('../lib/standards');
const RET = require('../lib/retention');
const P = require('../lib/positions');

const r = express.Router();
r.use(requireSuper);

r.get('/standards', wrap(async (req, res) => {
  res.render('admin/standards', { title: 'Standards', versions: await S.versions(), retention: await RET.counts(), can: await P.can(req.user) });
}));
r.post('/standards/publish', wrap(async (req, res) => {
  try { const v = await S.publish(req.user, { version: req.body.version, criteria: req.body.criteria }); flash(req, 'success', `Version ${v} is in force. Applications already open keep their version.`); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect('/admin/standards');
}));

module.exports = r;
