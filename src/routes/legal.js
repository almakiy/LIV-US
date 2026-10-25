// Public legal pages: only texts the main account published (src/lib/legal.js). A draft or withdrawn document is not found.
const express = require('express');
const L = require('../lib/legal');
const { renderMarkdown } = require('../lib/content');
const { wrap } = require('../lib/guards');

const r = express.Router();
const show = (slug) => wrap(async (req, res, next) => {
  const p = await L.live(slug || req.params.slug);
  if (!p) return next();
  res.render('public/legal', { title: p.title, description: `${p.title} of LIV.`, p, html: renderMarkdown(L.relink(p.body_md, '/legal/')) });
});
for (const [alias, slug] of Object.entries(L.ALIASES)) r.get(`/${alias}`, show(slug));
r.get('/legal/:slug', show());

module.exports = r;
