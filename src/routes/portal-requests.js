// Portal: training requests LIV sent to this provider (October 26, 2026). A provider sees only the requests sent to it.
const express = require('express');
const { requirePlatformAdmin, wrap } = require('../lib/guards');
const QT = require('../lib/quotes');

const r = express.Router();
r.use(requirePlatformAdmin);
r.get('/', wrap(async (req, res) => res.render('portal/requests', { title: 'Training requests', rows: await QT.forPlatform(req.user.platform_id), DELIVERY: QT.DELIVERY, MAX: QT.MAX_RECIPIENTS })));
module.exports = r;
