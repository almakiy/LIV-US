// Legal documents. Drafts are the Markdown files in docs/legal; staff read them in Admin > Legal documents.
// A draft is published only by the main account and only when no placeholder is left. Publishing stores the exact approved text,
// so later edits to the file do not change the public page until it is approved again. "Back to draft" hides the page at once.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { q } = require('../db');
const { audit } = require('./audit');
const { isMainAccount } = require('./exceptions');

const DIR = path.join(__dirname, '..', '..', 'docs', 'legal');
const INTERNAL = new Set(['README', 'REVIEW-NOTES']); // working notes: readable by staff, never published
const SLUG_RE = /^[a-z0-9-]{1,80}$/;
// Short public addresses for the documents most people look for.
const ALIASES = { privacy: 'privacy-policy', terms: 'terms-of-use', cookies: 'cookie-notice', accessibility: 'accessibility-statement' };
const PLACEHOLDER_RE = /\[(OWNER DECISION|COUNSEL|TO BE CONFIRMED)[^\]]*\]|PENDING COUNSEL REVIEW|NOT LEGAL ADVICE/gi;

class LegalError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const titleOf = (md, slug) => ((/^#\s+(.+)$/m.exec(md) || [])[1] || slug).trim().slice(0, 200);
const blockers = (md) => md.match(PLACEHOLDER_RE) || [];

function readDraft(slug) {
  if (!SLUG_RE.test(slug) && !INTERNAL.has(slug)) return null;
  const file = path.join(DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const body = fs.readFileSync(file, 'utf8');
  return { slug, body, title: titleOf(body, slug), sha256: sha(body), internal: INTERNAL.has(slug), blockers: blockers(body) };
}

async function live(slug) {
  return (await q('SELECT * FROM legal_publications WHERE slug = $1 AND withdrawn_at IS NULL', [slug])).rows[0] || null;
}

/** Every draft file with its publication state, for the admin list. */
async function list() {
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)) : [];
  const { rows } = await q('SELECT slug, sha256, published_at FROM legal_publications WHERE withdrawn_at IS NULL');
  const pub = new Map(rows.map((r) => [r.slug, r]));
  return files.map(readDraft).filter(Boolean).map((d) => {
    const p = pub.get(d.slug);
    return { slug: d.slug, title: d.title, internal: d.internal, placeholders: d.blockers.length, published: Boolean(p), publishedAt: p?.published_at || null, changed: Boolean(p) && p.sha256 !== d.sha256 };
  }).sort((a, b) => (a.internal - b.internal) || a.title.localeCompare(b.title));
}

let cache = { at: 0, links: [] };
/** Published documents for the site footer (cached for a minute; cleared when a document is published or withdrawn). */
async function links() {
  if (Date.now() - cache.at < 60000) return cache.links;
  const { rows } = await q('SELECT slug, title FROM legal_publications WHERE withdrawn_at IS NULL ORDER BY title');
  const back = Object.fromEntries(Object.entries(ALIASES).map(([a, s]) => [s, a]));
  cache = { at: Date.now(), links: rows.map((r) => ({ title: r.title, href: back[r.slug] ? `/${back[r.slug]}` : `/legal/${r.slug}` })) };
  return cache.links;
}

async function publish(user, slug, { confirm } = {}) {
  if (!(await isMainAccount(user))) throw new LegalError('Only the main account publishes a legal document.', 403);
  const d = readDraft(slug);
  if (!d || d.internal) throw new LegalError('Not found.', 404);
  if (d.blockers.length) throw new LegalError(`This draft still has ${d.blockers.length} placeholder(s) or draft label(s), for example "${d.blockers[0].slice(0, 80)}". Complete and approve the text first.`, 409);
  if (confirm !== 'yes') throw new LegalError('Confirm that this text is approved for publication.');
  const cur = await live(slug);
  if (cur && cur.sha256 === d.sha256) throw new LegalError('This exact text is already published.', 409);
  if (cur) await q('UPDATE legal_publications SET withdrawn_at = now(), withdrawn_by = $2 WHERE id = $1', [cur.id, user.id]);
  await q('INSERT INTO legal_publications (slug, title, body_md, sha256, published_by) VALUES ($1,$2,$3,$4,$5)', [slug, d.title, d.body, d.sha256, user.id]);
  await audit({ user, action: 'legal.publish', target: slug, metadata: { sha256: d.sha256, replaced: Boolean(cur) } });
  cache.at = 0;
  return `${d.title} is published.`;
}

/** Back to draft: the public page disappears at once. Any LIV administrator may do this; the published text stays on record. */
async function withdraw(user, slug) {
  const cur = await live(slug);
  if (!cur) throw new LegalError('This document is not published.', 409);
  await q('UPDATE legal_publications SET withdrawn_at = now(), withdrawn_by = $2 WHERE id = $1', [cur.id, user.id]);
  await audit({ user, action: 'legal.withdraw', target: slug });
  cache.at = 0;
  return `${cur.title} is back to draft and no longer public.`;
}

async function history(slug) {
  return (await q(`SELECT lp.published_at, lp.withdrawn_at, lp.sha256, a.email AS published_by, b.email AS withdrawn_by FROM legal_publications lp
    LEFT JOIN users a ON a.id = lp.published_by LEFT JOIN users b ON b.id = lp.withdrawn_by WHERE lp.slug = $1 ORDER BY lp.published_at DESC`, [slug])).rows;
}

/** Links between documents ("privacy-policy.md") point to the right place: admin drafts or public pages. */
const relink = (md, base) => md.replace(/\]\(([a-z0-9-]+)\.md(#[^)]*)?\)/g, (m, slug, hash) => `](${base}${slug}${hash || ''})`);

module.exports = { LegalError, ALIASES, PLACEHOLDER_RE, blockers, readDraft, live, list, links, publish, withdraw, history, relink };
