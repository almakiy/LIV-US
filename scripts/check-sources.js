// Checks every source cited by the editorial library (content/library):
// - DOI links: the registration record gives the title and the license, so the license stated in the library can be
//   compared with it even when the journal site refuses automated readers. Crossref (api.crossref.org) first, the
//   publisher's own deposit; DataCite (api.datacite.org) for DOIs registered there (reports, datasets); OpenAlex
//   (api.openalex.org) when the Crossref deposit names no Creative Commons license (some publishers deposit only
//   their site policy for open-access articles).
// - ISO catalog pages (www.iso.org/standard/<id>.html): www.iso.org refuses automated readers, so each id is looked up
//   in ISO Open Data instead, and the source title must start with the reference ISO gives that id.
// - Other links: fetched once. Each answer is classified, because a refusal is not a broken link:
//   ok | protected (the site's bot protection refused an automated reader: open it in a browser) |
//   unreachable (no connection from this network, e.g. a regional block) | broken (404/410: fix it).
//   npm run check:sources                exit code 1 if a link is broken or a DOI disagrees with Crossref
// Some official servers send an incomplete TLS chain. Run once more with the missing public intermediates added to the
// trust store (scripts/data/ca-intermediates.pem), keeping any CA file already configured. Verification stays on.
if (require.main === module && !process.env.LIV_CA_READY) {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const extra = path.join(os.tmpdir(), `liv-ca-${process.pid}.pem`);
  const prior = process.env.NODE_EXTRA_CA_CERTS && fs.existsSync(process.env.NODE_EXTRA_CA_CERTS) ? fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS, 'utf8') : '';
  fs.writeFileSync(extra, `${prior}\n${fs.readFileSync(path.join(__dirname, 'data', 'ca-intermediates.pem'), 'utf8')}`);
  const r = require('child_process').spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_EXTRA_CA_CERTS: extra, LIV_CA_READY: '1' } });
  fs.rmSync(extra, { force: true });
  process.exit(r.status === null ? 1 : r.status);
}
const { loadLibrary } = require('../src/lib/library');
const { lines, STAGES } = require('./check-standards');

const UA = 'LIV-Editorial-SourceCheck/1.0 (+https://livcredentials.org; editorial verification)';
const doiOf = (url) => { const m = /^https?:\/\/(?:dx\.)?doi\.org\/(10\.[^\s]+)$/i.exec(url); return m ? decodeURIComponent(m[1]) : null; };
const norm = (s) => String(s || '').toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Pure: the license the library states for a source ("CC BY", "CC BY-NC-ND"...), as a short code, or ''. */
const statedLicense = (src) => (/CC BY-NC-ND/i.test(src.publisher) ? 'by-nc-nd' : /CC BY-SA/i.test(src.publisher) ? 'by-sa' : /CC BY-NC/i.test(src.publisher) ? 'by-nc' : /CC BY/i.test(src.publisher) ? 'by' : '');
const ccCode = (urls) => { for (const u of urls) { const m = /creativecommons\.org\/licenses\/([a-z-]+)\//i.exec(u || '') || /^cc-([a-z-]+?)(?:-\d|$)/i.exec(u || ''); if (m) return m[1].toLowerCase(); } return ''; };

/** Pure: compares the library's source line with a DOI record { title, licenses: [url or SPDX-like id] }. Returns problems. */
function compareRecord(src, rec) {
  const out = []; const title = norm(rec.title);
  if (title && !norm(src.title).includes(title.slice(0, 40))) out.push(`title differs from the DOI record ("${rec.title}")`);
  const stated = statedLicense(src); const found = ccCode(rec.licenses);
  if (stated && !found) out.push(`library states CC ${stated.toUpperCase()} but the DOI record has no Creative Commons license${rec.licenses.length ? ` (${rec.licenses.join(', ')})` : ''}`);
  else if (stated && found !== stated) out.push(`library states CC ${stated.toUpperCase()} but the DOI record says CC ${found.toUpperCase()}`);
  return out;
}

async function get(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': UA, accept: 'text/html,application/json;q=0.9,*/*;q=0.8' } });
    const h = (k) => r.headers.get(k) || '';
    if (r.ok) return { state: 'ok', status: r.status, res: r };
    if ([401, 403, 429].includes(r.status) || h('cf-mitigated') || /cloudflare|akamai/i.test(h('server'))) return { state: 'protected', status: r.status };
    if ([404, 410].includes(r.status)) return { state: 'broken', status: r.status };
    return { state: 'unreachable', status: r.status };
  } catch (e) { return { state: 'unreachable', status: e.name === 'AbortError' ? 'timeout' : (e.cause && e.cause.code) || e.message }; } finally { clearTimeout(t); }
}

/** The DOI's registration record: Crossref, else DataCite; OpenAlex fills in a license Crossref does not name. */
async function doiRecord(doi) {
  const cr = await get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (cr.state === 'ok') {
    const m = (await cr.res.json()).message;
    const rec = { registry: 'Crossref', title: (m.title || [])[0] || '', publisher: m.publisher, licenses: (m.license || []).map((l) => l.URL).filter(Boolean) };
    if (!ccCode(rec.licenses)) {
      const oa = await get(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`);
      if (oa.state === 'ok') { const w = await oa.res.json(); const lic = w.primary_location && w.primary_location.license; if (lic) { rec.licenses.unshift(lic); rec.via = `license from OpenAlex; Crossref deposit: ${rec.licenses.slice(1).join(', ') || 'none'}`; } }
    }
    return rec;
  }
  const dc = await get(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`);
  if (dc.state !== 'ok') return null;
  const a = (await dc.res.json()).data.attributes;
  return { registry: 'DataCite', title: ((a.titles || [])[0] || {}).title || '', publisher: typeof a.publisher === 'string' ? a.publisher : (a.publisher || {}).name, licenses: (a.rightsList || []).map((r) => r.rightsIdentifier || r.rightsUri).filter(Boolean) };
}

async function main() {
  const { items, errors } = loadLibrary();
  if (errors.length) { console.log('Library errors:\n ' + errors.join('\n ')); process.exitCode = 1; }
  const byUrl = new Map();
  for (const it of items) for (const s of it.sources) { if (!byUrl.has(s.url)) byUrl.set(s.url, { src: s, files: [] }); byUrl.get(s.url).files.push(it.file); }
  const tally = { ok: 0, protected: 0, unreachable: 0, broken: 0, doiProblems: 0 };
  const isoId = (u) => { const m = /^https:\/\/www\.iso\.org\/standard\/(\d+)\.html$/.exec(u); return m ? Number(m[1]) : null; };
  const wanted = new Set([...byUrl.keys()].map(isoId).filter(Boolean)); const iso = new Map();
  if (wanted.size) {
    try { for await (const l of await lines(process.env.ISO_OPEN_DATA_FILE)) { if (!l.trim()) continue; const d = JSON.parse(l); if (wanted.has(d.id)) iso.set(d.id, d); } } catch (e) { console.log(`ISO Open Data not available (${e.message}); ISO pages are checked directly.`); }
  }
  for (const [url, { src, files }] of byUrl) {
    const doi = doiOf(url);
    if (doi) {
      const rec = await doiRecord(doi);
      if (!rec) { console.log(`?  ${url}  no Crossref or DataCite record reachable`); tally.unreachable++; continue; }
      const probs = compareRecord(src, rec);
      console.log(`${probs.length ? '!' : 'ok'} ${url}  ${rec.registry}: ${rec.publisher}; license: ${rec.licenses[0] || 'none recorded'}${rec.via ? ` (${rec.via})` : ''}`);
      for (const p of probs) console.log(`     ${p}  [${files.join(', ')}]`);
      if (probs.length) tally.doiProblems++; else tally.ok++;
      continue;
    }
    const id = isoId(url);
    if (id && iso.size) {
      const d = iso.get(id); const ref = d && d.reference;
      const bad = !d ? 'id not in the ISO catalog' : !src.title.startsWith(ref) ? `source title should start with "${ref}"` : d.currentStage >= 9500 ? `${ref} is withdrawn` : '';
      console.log(`${bad ? '!' : 'ok'} ${url}  ISO Open Data: ${ref || '-'} (${d ? STAGES[d.currentStage] || `stage ${d.currentStage}` : 'missing'})${bad ? `  ${bad}  [${files.join(', ')}]` : ''}`);
      if (bad) tally.doiProblems++; else tally.ok++;
      continue;
    }
    const r = await get(url); tally[r.state]++;
    console.log(`${{ ok: 'ok', protected: '~ ', unreachable: '? ', broken: 'X ' }[r.state]} ${url}  ${r.state} (${r.status})${r.state === 'broken' ? `  [${files.join(', ')}]` : ''}`);
  }
  console.log(`\n${byUrl.size} sources: ${tally.ok} ok, ${tally.protected} protected (open in a browser), ${tally.unreachable} unreachable from this network, ${tally.broken} broken, ${tally.doiProblems} DOI or ISO record problem(s).`);
  if (tally.broken || tally.doiProblems) process.exitCode = 1;
}

if (require.main === module) main().catch((e) => { console.error(e.message || e); process.exitCode = 1; }).finally(() => require('../src/db').pool.end());
module.exports = { compareRecord, statedLicense, ccCode, doiOf };
