// Knowledge hub helpers: taxonomy, slugs, safe Markdown rendering.
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

const CATEGORIES = { quality: 'Quality', safety: 'Health & Safety', 'project-management': 'Project Management' };
const KINDS = { article: 'Article', research: 'Research', guide: 'Guide' };

function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

/** Markdown → sanitized HTML. Raw HTML in the source is stripped; only safe tags and http(s)/mailto links survive. */
function renderMarkdown(md) {
  const html = marked.parse(String(md || ''), { gfm: true, breaks: false, async: false });
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2']),
    allowedAttributes: { a: ['href', 'title', 'rel', 'target'], th: ['align'], td: ['align'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: { a: (tag, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: 'noopener nofollow', ...(/^https?:/i.test(attribs.href || '') ? { target: '_blank' } : {}) } }) },
  });
}

const readingMinutes = (md) => Math.max(1, Math.round(String(md || '').split(/\s+/).filter(Boolean).length / 200));
const parseTags = (s) => [...new Set(String(s || '').split(',').map((t) => t.trim().toLowerCase().replace(/[^\w\s-]/g, '').slice(0, 30)).filter(Boolean))].slice(0, 8);

module.exports = { CATEGORIES, KINDS, slugify, renderMarkdown, readingMinutes, parseTags };
