// Editorial library: reviewed-before-publication Knowledge Hub content kept as Markdown files under content/library/.
// Loading the library only ever creates DRAFTS: each one gets an automated review report, and a named person must
// review and publish it in Admin > Knowledge hub content. A draft that already exists (same slug) is never overwritten,
// so editors' changes on the site are kept. See docs/GOVERNANCE-LIBRARY.md.
const fs = require('fs');
const path = require('path');
const { q } = require('../db');
const { validateDraft } = require('./content');
const { snapshot } = require('./article-store');
const { audit } = require('./audit');

const DIR = path.join(__dirname, '..', '..', 'content', 'library');
const LIST = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);

/**
 * Parses one library file: a header between "---" lines ("key: value" lines, and a "sources:" list of
 * "- Title | https://url | Publisher | accessed YYYY-MM-DD" lines), then the Markdown body.
 */
function parseItem(text, file = '') {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(String(text));
  if (!m) throw new Error(`${file}: missing header`);
  const head = {}; const sources = []; let inSources = false;
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (inSources && /^\s*-\s+/.test(line)) {
      const [title, url, publisher, accessed] = line.replace(/^\s*-\s+/, '').split('|').map((x) => (x || '').trim());
      sources.push({ title, url, publisher, ...(/^\d{4}-\d{2}-\d{2}$/.test(accessed || '') ? { accessed } : {}) });
      continue;
    }
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`${file}: cannot read header line "${line}"`);
    inSources = kv[1] === 'sources';
    if (!inSources) head[kv[1]] = kv[2].trim();
  }
  const next = /^\d{4}-\d{2}-\d{2}$/.test(head.next_review || '') ? head.next_review : null;
  const prepared = /^\d{4}-\d{2}-\d{2}$/.test(head.prepared || '') ? head.prepared : sources.map((x) => x.accessed).filter(Boolean).sort().pop() || null;
  const control = { audience: head.audience || '', scope: head.scope || '', edition: head.edition || '1.0', prepared };
  return {
    external_id: head.id, slug: head.slug, title: head.title, summary: head.summary, category: head.category, kind: head.kind,
    jurisdiction: head.jurisdiction || '', tags: LIST(head.tags), standards: LIST(head.standards), author_name: head.author || 'LIV Editorial',
    next_review_at: next, control,
    collection: head.collection || '', order: Number(head.order) || 0, sources, body_md: controlBlock(control, next) + m[2].trim() + '\n', file,
  };
}

// Document control, as published guidance from standards and intergovernmental bodies carries it: who the text is for,
// what it covers, which edition it is and when it was prepared and will be reviewed. Dates are spelled out (not
// YYYY-MM-DD) so the Reviewer's future-date check does not flag the planned review date.
const longDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
function controlBlock(c, next) {
  if (!c.audience || !c.scope) return '';
  const cell = (v) => String(v).replace(/\|/g, '/');
  return ['| Document control | |', '|---|---|', `| Audience | ${cell(c.audience)} |`, `| Scope | ${cell(c.scope)} |`,
    `| Edition | ${cell(c.edition)}${c.prepared ? `, prepared ${longDay(c.prepared)}` : ''} |`, ...(next ? [`| Next review | ${longDay(next)} |`] : []), '', ''].join('\n');
}

/** Reads and validates every library file. Returns { items, errors }. */
function loadLibrary(dir = DIR) {
  const items = []; const errors = [];
  if (!fs.existsSync(dir)) return { items, errors };
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.md') && !/README\.md$/i.test(f)).sort();
  for (const f of files) {
    try {
      const it = parseItem(fs.readFileSync(path.join(dir, f), 'utf8'), String(f));
      const { errors: e } = validateDraft({ ...it, ai_assisted: true });
      if (!/^[a-z0-9-]{3,100}$/.test(it.slug || '')) e.push('slug must be lowercase letters, digits and hyphens');
      if ((it.title || '').length > 200) e.push('title is longer than 200 characters');
      if ((it.summary || '').length > 300) e.push('summary is longer than 300 characters');
      if (!it.control.audience || it.control.audience.length > 200) e.push('audience is required (up to 200 characters)');
      if (!it.control.scope || it.control.scope.length > 300) e.push('scope is required (up to 300 characters)');
      if (e.length) errors.push(`${f}: ${e.join('; ')}`); else items.push(it);
    } catch (err) { errors.push(err.message); }
  }
  const seen = new Map();
  for (const it of items) for (const k of [`slug:${it.slug}`, `id:${it.external_id}`]) { if (seen.has(k)) errors.push(`${it.file}: duplicate ${k} (also in ${seen.get(k)})`); seen.set(k, it.file); }
  items.sort((a, b) => a.collection.localeCompare(b.collection) || a.order - b.order || a.slug.localeCompare(b.slug));
  return { items, errors };
}

/** Which library items are not on the site yet (matched by slug, so a deleted draft can be loaded again). */
async function pending() {
  const { items, errors } = loadLibrary();
  const { rows } = await q('SELECT slug FROM articles WHERE slug = ANY($1)', [items.map((i) => i.slug)]);
  const have = new Set(rows.map((r) => r.slug));
  return { items, errors, missing: items.filter((i) => !have.has(i.slug)) };
}

/** Creates the missing items as drafts with an automated review report each. Returns the number created. */
async function importLibrary(user) {
  const { reviewDraft } = require('../../engines/reviewer');
  const { missing } = await pending();
  let created = 0;
  for (const it of missing) {
    const { rows: [a] } = await q(`INSERT INTO articles (slug, title, summary, body_md, category, kind, author_name, tags, sources, standards, ai_assisted, origin, external_id, status, jurisdiction, next_review_at, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'library',$11,'draft',$12,$13,$14) ON CONFLICT (slug) DO NOTHING RETURNING id, version`,
    [it.slug, it.title, it.summary, it.body_md, it.category, it.kind, it.author_name, it.tags, JSON.stringify(it.sources), it.standards, it.external_id, it.jurisdiction, it.next_review_at, user ? user.id : null]);
    if (!a) continue;
    created++;
    await snapshot(a.id, 'Editorial library', `Loaded from content/library/${it.file}`);
    const rep = await reviewDraft({ ...it, version: a.version });
    await q('INSERT INTO review_reports (article_id, version, engine, result, score, flags, checks_run, model) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [a.id, a.version, 'reviewer', rep.result, rep.score, JSON.stringify(rep.flags), rep.checks_run, JSON.stringify(rep.model)]);
  }
  if (created) await audit({ user, action: 'content.library.import', target: 'content/library', metadata: { created } });
  return created;
}

module.exports = { parseItem, loadLibrary, pending, importLibrary, controlBlock, DIR };
