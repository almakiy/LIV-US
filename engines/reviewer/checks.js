// Deterministic checks. No model needed, no cost: these catch the objective problems and always run.
const { BLOCK, BRITISH } = require('./rules');

const flag = (severity, check, id, message, location) => ({ id, severity, check, message, ...(location ? { location } : {}) });
const snippet = (text, idx, len = 70) => text.slice(Math.max(0, idx - 20), idx + len).replace(/\s+/g, ' ').trim();
const stripCites = (s) => s.replace(/\[\d{1,3}\]/g, '');
const hasNonLatin = (v) => [...String(v || '')].some((ch) => /[\p{L}\p{N}]/u.test(ch) && !/[0-9]/.test(ch) && !/\p{Script=Latin}/u.test(ch));
const wordsOf = (s) => String(s).toLowerCase().match(/[a-z0-9]+/g) || [];
const paragraphs = (md) => String(md || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const isProse = (p) => !/^(#|>|\||```|---)/.test(p);

function identity(a) {
  const out = []; const text = `${a.title}\n${a.summary}\n${a.body_md}`;
  for (const r of BLOCK) { const m = r.re.exec(text); if (m) out.push(flag('block', 'identity', `identity.${r.id}`, r.why, snippet(text, m.index))); }
  const found = new Set();
  for (const w of BRITISH) { const m = new RegExp(`\\b${w}\\b`, 'i').exec(text); if (m) found.add(w); }
  if (found.size) out.push(flag('warn', 'identity', 'identity.us-spelling', `Use US spelling (house style): ${[...found].slice(0, 6).join(', ')}.`));
  if (hasNonLatin(text)) out.push(flag('block', 'language', 'language.non-latin', 'The site is English only: letters from other scripts were found.'));
  return out;
}

const KINDS_NEEDING_SOURCES = ['standards', 'research', 'case-study', 'briefing'];
function citations(a) {
  const out = []; const body = a.body_md || ''; const sources = Array.isArray(a.sources) ? a.sources : [];
  const used = new Set([...body.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1])));
  for (const n of used) if (n < 1 || n > sources.length) out.push(flag('block', 'citations', 'citations.dangling', `Citation [${n}] has no matching source (there are ${sources.length}).`));
  sources.forEach((s, i) => { if (!used.has(i + 1)) out.push(flag('warn', 'citations', 'citations.unused', `Source ${i + 1} ("${String(s.title).slice(0, 60)}") is listed but never cited.`)); });
  if (!sources.length && KINDS_NEEDING_SOURCES.includes(a.kind)) out.push(flag('block', 'citations', 'citations.missing-sources', `A "${a.kind}" item needs cited primary sources.`));
  const signal = /\d|\b(?:must|shall|required|requires|regulation|according to|percent|studies|study|research shows)\b/i;
  let n = 0;
  for (const p of paragraphs(body).filter(isProse)) {
    if (p.length < 100 || /\[\d{1,3}\]/.test(p)) continue;
    if (signal.test(stripCites(p))) { if (++n <= 8) out.push(flag('warn', 'citations', 'citations.uncited-claim', 'This paragraph states facts, numbers or requirements without a citation.', snippet(p, 0, 80))); }
  }
  if (n > 8) out.push(flag('warn', 'citations', 'citations.uncited-many', `${n - 8} more paragraphs without citations.`));
  const urls = sources.map((s) => s.url); const dup = urls.filter((u, i) => urls.indexOf(u) !== i);
  if (dup.length) out.push(flag('info', 'citations', 'citations.duplicate', `Duplicate source link: ${dup[0]}`));
  sources.forEach((s) => { if (/^http:\/\//i.test(s.url)) out.push(flag('warn', 'links', 'links.insecure', `Source link is not https: ${s.url.slice(0, 80)}`)); });
  return out;
}

function parseStandardRefs(text) {
  const refs = new Map();
  for (const m of String(text).matchAll(/\b(ISO\/IEC|ISO|IEC)\s?(\d{3,6})(?:-(\d{1,2}))?(?::\s?(\d{4}))?/g)) {
    const id = `${m[1]} ${m[2]}${m[3] ? `-${m[3]}` : ''}`; const prev = refs.get(id) || new Set();
    if (m[4]) prev.add(m[4]); refs.set(id, prev);
  }
  return refs;
}
function standards(a, registry) {
  const out = []; const reg = (registry && registry.standards) || {};
  const refs = parseStandardRefs(`${a.title}\n${a.summary}\n${a.body_md}`);
  const listed = new Set((a.standards || []).map((s) => [...parseStandardRefs(s).keys()][0]).filter(Boolean));
  for (const [id, editions] of refs) {
    const entry = reg[id] || reg[id.replace(/^ISO /, 'ISO/IEC ')] || reg[id.replace(/^ISO\/IEC /, 'ISO ')];
    if (!entry) { out.push(flag('warn', 'standards', 'standards.unknown', `${id} is not in the standards registry: a person must check the number and edition.`)); continue; }
    if (!editions.size) out.push(flag('warn', 'standards', 'standards.no-edition', `${id} is mentioned without an edition year.`));
    for (const e of editions) if (e !== entry.current) out.push(flag('warn', 'standards', 'standards.edition', `${id}:${e} differs from the edition in the registry (${entry.current}). Check whether a newer edition exists or this is an older one on purpose.`));
    if (!listed.has(id) && !listed.has(id.replace(/^ISO /, 'ISO/IEC '))) out.push(flag('info', 'standards', 'standards.unlisted', `${id} is mentioned in the text but not listed under "Standards referenced".`));
  }
  return out;
}

function similarity(a) {
  const out = []; const bodyWords = wordsOf(stripCites(a.body_md || '')); const K = 8;
  if (bodyWords.length < K * 3) return out;
  const shingles = (w) => { const s = new Set(); for (let i = 0; i + K <= w.length; i++) s.add(w.slice(i, i + K).join(' ')); return s; };
  const mine = shingles(bodyWords);
  (a.sources || []).forEach((s, i) => {
    if (!s.excerpt) return;
    const theirs = shingles(wordsOf(s.excerpt)); let shared = 0;
    for (const sh of mine) if (theirs.has(sh)) shared++;
    const ratio = shared / mine.size;
    if (ratio >= 0.35) out.push(flag('block', 'similarity', 'similarity.copy', `About ${Math.round(ratio * 100)}% of the text repeats source ${i + 1} word for word. Rewrite in your own words and quote briefly with a citation.`));
    else if (ratio >= 0.15) out.push(flag('warn', 'similarity', 'similarity.close', `About ${Math.round(ratio * 100)}% of the text is close to source ${i + 1}. Check quotation and paraphrase.`));
  });
  return out;
}

function structure(a, today = new Date()) {
  const out = []; const body = a.body_md || '';
  if ((a.summary || '').length < 40) out.push(flag('warn', 'structure', 'structure.summary', 'The summary is very short (under 40 characters).'));
  const h2 = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]);
  if (['guide', 'standards', 'briefing', 'research', 'case-study'].includes(a.kind) && h2.length < 2) out.push(flag('warn', 'structure', 'structure.headings', `A "${a.kind}" item should have at least two ## sections.`));
  if (a.kind === 'case-study' && !h2.some((h) => /lesson|finding|recommend/i.test(h))) out.push(flag('warn', 'structure', 'structure.lessons', 'A case study needs a "Lessons learned" (or findings / recommendations) section.'));
  if (a.kind === 'research' && !h2.some((h) => /limitation/i.test(h))) out.push(flag('warn', 'structure', 'structure.limitations', 'A research digest should state the study\'s limitations.'));
  const iso = today.toISOString().slice(0, 10);
  for (const m of body.matchAll(/\b(2\d{3})-(\d{2})-(\d{2})\b/g)) if (m[0] > iso) out.push(flag('warn', 'dates', 'dates.future', `The date ${m[0]} is in the future: check it.`, snippet(body, m.index)));
  for (const m of body.matchAll(/\[[^\]]+\]\((http:\/\/[^)\s]+)\)/g)) out.push(flag('warn', 'links', 'links.insecure', `Link is not https: ${m[1].slice(0, 80)}`));
  return out;
}

// Source trust: every source should come from a publisher in the register (engines/data/trusted-sources.json), and a text that
// states a legal or mandatory requirement needs at least one official source (the law or the regulator), never only a summary of it.
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch (_) { return ''; } };
function publisherOf(url, register) {
  const pubs = (register && register.publishers) || {}; let host = hostOf(url);
  const doi = host === 'doi.org' && /^https?:\/\/(?:dx\.)?doi\.org\/(10\.\d+)\//i.exec(url);
  const reg = doi && register.doi_prefixes && register.doi_prefixes[doi[1]];
  if (reg) return { domain: `doi.org/${doi[1]}`, ...reg };
  while (host) { if (pubs[host]) return { domain: host, ...pubs[host] }; const i = host.indexOf('.'); host = i < 0 ? '' : host.slice(i + 1); }
  return null;
}
const MANDATE = /\b(?:required by law|legally required|legal (?:duty|obligation|requirement)|mandatory|the (?:law|regulations?|code) (?:requires|require|sets|obliges)|is an offen[cs]e)\b/i;
function sources(a, register) {
  const out = []; const list = Array.isArray(a.sources) ? a.sources : [];
  if (!register || !register.publishers) return out;
  const tiers = list.map((s) => publisherOf(s.url, register));
  tiers.forEach((t, i) => { if (!t) out.push(flag('warn', 'sources', 'sources.unlisted-publisher', `Source ${i + 1} (${hostOf(list[i].url) || 'no host'}) is not from a publisher in the trusted-source register. Use the primary publisher, or have an editor add it to the register with a reason.`)); });
  const text = stripCites(`${a.summary || ''}\n${a.body_md || ''}`); const m = MANDATE.exec(text);
  if (m && !tiers.some((t) => t && t.tier === 'official')) out.push(flag('warn', 'sources', 'sources.no-official', 'The text states a legal or mandatory requirement but cites no official source (the law or the regulator). Cite the official text, or describe it as good practice.', snippet(text, m.index)));
  if (a.kind === 'standards' && list.length && !tiers.some((t) => t && (t.tier === 'standards' || t.tier === 'official'))) out.push(flag('warn', 'sources', 'sources.no-standards-body', 'A standards explainer should cite the standards body\'s own page for the title and edition.'));
  return out;
}

module.exports = { identity, citations, standards, sources, publisherOf, similarity, structure, parseStandardRefs, paragraphs, stripCites, wordsOf };
