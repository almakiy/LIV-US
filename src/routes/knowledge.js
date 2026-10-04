// Public knowledge hub: listing, article pages, RSS, sitemap, robots.
const express = require('express');
const cfg = require('../config');
const { q } = require('../db');
const { CATEGORIES, KINDS, renderMarkdown, readingMinutes } = require('../lib/content');
const { wrap } = require('../lib/guards');

const r = express.Router();
const PER = 9;
const esc = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

r.get('/knowledge', wrap(async (req, res) => {
  const category = CATEGORIES[req.query.category] ? req.query.category : '';
  const kind = KINDS[req.query.kind] ? req.query.kind : '';
  const search = String(req.query.q || '').trim().slice(0, 80);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = ["status = 'published'"]; const params = [];
  if (category) { params.push(category); where.push(`category = $${params.length}`); }
  if (kind) { params.push(kind); where.push(`kind = $${params.length}`); }
  if (search) { params.push(`%${search.toLowerCase()}%`); where.push(`(lower(title) LIKE $${params.length} OR lower(summary) LIKE $${params.length} OR $${params.length} ILIKE ANY (SELECT '%' || unnest(tags) || '%'))`); }
  const w = where.join(' AND ');
  const { rows: [{ n }] } = await q(`SELECT count(*)::int AS n FROM articles WHERE ${w}`, params);
  const { rows } = await q(`SELECT slug, title, summary, category, kind, author_name, published_at, tags FROM articles WHERE ${w} ORDER BY published_at DESC LIMIT ${PER} OFFSET ${(page - 1) * PER}`, params);
  res.render('public/knowledge', { title: 'Knowledge Hub', description: 'Articles, research and guides on quality management, health & safety and project management.', rows, n, page, pages: Math.max(1, Math.ceil(n / PER)), category, kind, search, CATEGORIES, KINDS });
}));

r.get('/knowledge/:slug', wrap(async (req, res, next) => {
  const { rows: [a] } = await q(`SELECT * FROM articles WHERE slug = $1 AND status = 'published'`, [req.params.slug]);
  if (!a) return next();
  const { rows: related } = await q(`SELECT slug, title, kind FROM articles WHERE status='published' AND category=$1 AND id <> $2 ORDER BY published_at DESC LIMIT 3`, [a.category, a.id]);
  res.render('public/knowledge-article', { title: a.title, description: a.summary, a, html: renderMarkdown(a.body_md), minutes: readingMinutes(a.body_md), related, CATEGORIES, KINDS, preview: false });
}));

r.get('/rss.xml', wrap(async (req, res) => {
  const { rows } = await q(`SELECT slug, title, summary, published_at FROM articles WHERE status='published' ORDER BY published_at DESC LIMIT 20`);
  const items = rows.map((a) => `<item><title>${esc(a.title)}</title><link>${cfg.baseUrl}/knowledge/${esc(a.slug)}</link><guid>${cfg.baseUrl}/knowledge/${esc(a.slug)}</guid><pubDate>${new Date(a.published_at).toUTCString()}</pubDate><description>${esc(a.summary)}</description></item>`).join('');
  res.type('application/rss+xml').send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(cfg.brand)} Knowledge Hub</title><link>${cfg.baseUrl}/knowledge</link><description>Quality, safety and project management knowledge from ${esc(cfg.brandLong)}.</description>${items}</channel></rss>`);
}));

r.get('/sitemap.xml', wrap(async (req, res) => {
  const { rows } = await q(`SELECT slug, updated_at FROM articles WHERE status='published' ORDER BY published_at DESC`);
  const fixed = ['/', '/verify', '/accreditation', '/about', '/contact', '/knowledge'].map((p) => `<url><loc>${cfg.baseUrl}${p}</loc></url>`);
  const arts = rows.map((a) => `<url><loc>${cfg.baseUrl}/knowledge/${esc(a.slug)}</loc><lastmod>${new Date(a.updated_at).toISOString().slice(0, 10)}</lastmod></url>`);
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...fixed, ...arts].join('')}</urlset>`);
}));

r.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /portal\nDisallow: /api\nSitemap: ${cfg.baseUrl}/sitemap.xml\n`));

module.exports = r;
