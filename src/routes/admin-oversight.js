// Admin: the work queue and the management report. Mounted under /admin. Read-only.
const express = require('express');
const { requireSuper, wrap } = require('../lib/guards');
const O = require('../lib/oversight');
const billing = require('../lib/billing');

const r = express.Router();
r.use(requireSuper);
r.get('/work', wrap(async (req, res) => res.render('admin/work', { title: 'Work', w: await O.workQueue() })));
r.get('/report', wrap(async (req, res) => res.render('admin/report', { title: 'Management report', d: await O.report(), money: billing.money })));
module.exports = r;
