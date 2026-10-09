// Knowledge hub helpers: taxonomy, slugs, safe Markdown rendering.
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

// Topics (stored in articles.category) and content types (articles.kind). Keys are stored; labels can change.
const CATEGORIES = {
  governance: 'Governance', 'hse-governance': 'HSE Governance', safety: 'Health & Safety', quality: 'Quality', environment: 'Environment', qhse: 'QHSE',
  'project-management': 'Project Management', 'project-governance': 'Project Governance', 'pmo-governance': 'PMO Governance',
  'project-information-governance': 'Project Information Governance', 'professional-credentialing': 'Professional Credentialing',
  'assessment-competence': 'Assessment & Competence', standards: 'Standards', compliance: 'Compliance', 'gcc-workforce': 'Saudi / GCC Workforce Development',
};
const KINDS = {
  article: 'Article', guide: 'Guide', research: 'Research brief', standards: 'Standards explainer', 'case-study': 'Case study',
  briefing: 'Professional briefing', framework: 'Framework', checklist: 'Checklist', template: 'Template', tool: 'Tool',
  glossary: 'Glossary', 'career-guide': 'Career guide', 'industry-analysis': 'Industry analysis', news: 'News & alert',
};
const { hasNonLatin } = require('./issuance');

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


const MAX_SOURCES = 50;
const isHttpUrl = (u) => { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; } catch (_) { return false; } };

/** "Title | https://url | Publisher" lines (admin form) → [{title,url,publisher}]. Lines without a valid http(s) URL are dropped. */
function parseSourcesText(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_SOURCES).map((l) => {
    const [title, url, publisher] = l.split('|').map((x) => (x || '').trim());
    return { title: (title || '').slice(0, 200), url: url || '', publisher: (publisher || '').slice(0, 120) };
  }).filter((s) => s.title && isHttpUrl(s.url));
}
const sourcesToText = (arr) => (Array.isArray(arr) ? arr : []).map((s) => [s.title, s.url, s.publisher || ''].join(' | ').replace(/ \| $/, '')).join('\n');
const parseStandards = (s) => [...new Set((Array.isArray(s) ? s : String(s || '').split(',')).map((x) => String(x).trim().slice(0, 60)).filter(Boolean))].slice(0, 20);

/**
 * Validates a draft arriving from the Content API (engines). Pure: returns { errors, value }.
 * Engines may only supply content; review, publishing and version numbers are controlled by the site.
 */
function validateDraft(b) {
  const errors = [];
  const o = b && typeof b === 'object' ? b : {};
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  const value = {
    external_id: str(o.external_id, 100),
    title: str(o.title, 200),
    summary: str(o.summary, 300),
    body_md: String(o.body_md ?? '').slice(0, 200000),
    category: o.category,
    kind: o.kind || 'article',
    author_name: str(o.author_name, 150),
    tags: parseTags(Array.isArray(o.tags) ? o.tags.join(',') : o.tags),
    standards: parseStandards(o.standards),
    change_note: str(o.change_note, 300),
    jurisdiction: str(o.jurisdiction, 80),
    ai_assisted: o.ai_assisted === false ? false : true,
    sources: [],
  };
  if (!/^[\w.:-]{1,100}$/.test(value.external_id)) errors.push('external_id is required (letters, digits, . _ : - only, max 100)');
  if (!value.title) errors.push('title is required');
  if (!value.summary) errors.push('summary is required');
  if (!value.body_md.trim()) errors.push('body_md is required');
  if (!CATEGORIES[value.category]) errors.push(`category must be one of: ${Object.keys(CATEGORIES).join(', ')}`);
  if (!KINDS[value.kind]) errors.push(`kind must be one of: ${Object.keys(KINDS).join(', ')}`);
  if (o.sources !== undefined && !Array.isArray(o.sources)) errors.push('sources must be an array');
  else if (Array.isArray(o.sources)) {
    if (o.sources.length > MAX_SOURCES) errors.push(`at most ${MAX_SOURCES} sources`);
    o.sources.slice(0, MAX_SOURCES).forEach((s, i) => {
      if (!s || !String(s.title || '').trim() || !isHttpUrl(s.url)) errors.push(`sources[${i}] needs a title and an http(s) url`);
      else value.sources.push({ title: str(s.title, 200), url: String(s.url).slice(0, 500), publisher: str(s.publisher, 120), accessed: /^\d{4}-\d{2}-\d{2}$/.test(s.accessed || '') ? s.accessed : undefined, excerpt: s.excerpt ? str(s.excerpt, 2000) : undefined });
    });
  }
  for (const f of ['title', 'summary', 'body_md', 'author_name', 'jurisdiction']) if (hasNonLatin(value[f])) errors.push(`${f} must use English (Latin) letters only`);
  return { errors, value };
}

/** Keeps stored evidence excerpts and access dates when an editor re-saves the sources list (the admin form only shows title | url | publisher). */
function mergeExcerpts(newSources, oldSources) {
  const byUrl = new Map((Array.isArray(oldSources) ? oldSources : []).map((s) => [s.url, s]));
  return newSources.map((s) => { const o = byUrl.get(s.url); return o ? { ...s, ...(o.excerpt ? { excerpt: o.excerpt } : {}), ...(o.accessed ? { accessed: o.accessed } : {}) } : s; });
}

module.exports = { mergeExcerpts, CATEGORIES, KINDS, slugify, renderMarkdown, readingMinutes, parseTags, parseSourcesText, sourcesToText, parseStandards, validateDraft, isHttpUrl };
