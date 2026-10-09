// Checks the standards registry (engines/data/standards-registry.json) against ISO's own open data: the full catalog of
// ISO deliverables that ISO publishes as a downloadable file. It works where www.iso.org pages refuse automated readers.
//   npm run check:standards              report: current edition, review status, amendments, revisions in progress
//   npm run check:standards -- --write   also update the registry (edition, title, status) and record verified_on
//   npm run check:standards -- --file x  use a local copy of iso_deliverables_metadata.jsonl instead of downloading it
// Exit code 2 when the registry differs from the catalog (without --write). An editor still reads each change before it
// is relied on: the catalog states editions and dates, not what a clause requires.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Readable } = require('stream');

const URL_ISO = 'https://isopublicstorageprod.blob.core.windows.net/opendata/_latest/iso_deliverables_metadata/json/iso_deliverables_metadata.jsonl';
const REG = path.join(__dirname, '..', 'engines', 'data', 'standards-registry.json');
const STAGES = { 6060: 'published', 9020: 'under periodic review', 9060: 'under periodic review', 9092: 'to be revised', 9093: 'confirmed', 9099: 'withdrawal proposed' };
const DEV = /^ISO(?:\/IEC)?\/(?:PWI|NP|AWI|WD|CD|DIS|FDIS|PRF)\s/;

// "ISO/IEC 17024:2026" -> { key: "ISO/IEC 17024", year: "2026" }; amendments and drafts are recognized separately.
function parseRef(ref) {
  const m = /^(ISO(?:\/IEC)?)(?:\/(TS|TR|PAS|PWI|NP|AWI|WD|CD|DIS|FDIS|PRF))?\s+(\d+(?:-\d+)*)(?::(\d{4}))?(\/.+)?$/.exec(ref || '');
  if (!m) return null;
  return { key: `${m[1]} ${m[3]}`, series: m[2] || '', year: m[4] || '', supplement: m[5] || '' };
}

/** Pure: the catalog's view of one registry key, from the rows whose reference has that key. */
function summarize(rows) {
  const live = rows.filter((r) => r.currentStage < 9500 && !String(r.currentStage).endsWith('98'));
  const main = live.filter((r) => !r.supplementType && !DEV.test(r.reference) && r.publicationDate).sort((a, b) => b.publicationDate.localeCompare(a.publicationDate))[0];
  if (!main) return null;
  const p = parseRef(main.reference);
  return {
    reference: main.reference, current: p.year, edition: main.edition, published: main.publicationDate, iso_id: main.id,
    title: (main.title && main.title.en) || '', status: STAGES[main.currentStage] || `stage ${main.currentStage}`,
    amendments: live.filter((r) => r.supplementType && r.reference.startsWith(`${main.reference}/`) && r.publicationDate).map((r) => r.reference),
    in_development: live.filter((r) => DEV.test(r.reference) && !r.supplementType).map((r) => `${r.reference} (edition ${r.edition}, stage ${String(r.currentStage).replace(/(\d\d)(\d\d)/, '$1.$2')})`),
  };
}

async function lines(file) {
  if (file) return readline.createInterface({ input: fs.createReadStream(file) });
  const res = await fetch(URL_ISO);
  if (!res.ok) throw new Error(`ISO open data answered ${res.status}`);
  return readline.createInterface({ input: Readable.fromWeb(res.body) });
}

async function main() {
  const args = process.argv.slice(2); const write = args.includes('--write');
  const fi = args.indexOf('--file'); const file = fi >= 0 ? args[fi + 1] : null;
  const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
  const keys = new Set(Object.keys(reg.standards)); const rows = new Map([...keys].map((k) => [k, []]));
  for await (const l of await lines(file)) {
    if (!l.trim()) continue;
    const d = JSON.parse(l); const p = parseRef(d.reference);
    // The registry may name a joint ISO/IEC standard either way (ISO 27001 or ISO/IEC 27001).
    if (p) for (const k of new Set([p.key, p.key.replace(/^ISO\/IEC /, 'ISO ')])) if (rows.has(k)) rows.get(k).push(d);
  }
  const today = new Date().toISOString().slice(0, 10); let diffs = 0;
  for (const k of keys) {
    const s = summarize(rows.get(k)); const e = reg.standards[k];
    if (!s) { console.log(`?  ${k}: not found in the ISO catalog`); diffs++; continue; }
    const changed = e.current !== s.current;
    if (changed) diffs++;
    console.log(`${changed ? '!' : 'ok'} ${k}: ${s.reference} (edition ${s.edition}, ${s.published}, ${s.status})${changed ? `  registry says ${e.current}` : ''}`);
    for (const a of s.amendments) console.log(`     amendment: ${a}`);
    for (const x of s.in_development) console.log(`     in development: ${x}`);
    if (write) {
      reg.standards[k] = { ...e, title: s.title.replace(/\s+—\s+/g, ': ').replace(/\s+-\s+/g, ': '), current: s.current, edition: s.edition, published: s.published, status: s.status,
        amendments: s.amendments, in_development: s.in_development, iso_id: s.iso_id, verified_on: today, verified_source: 'ISO Open Data (iso_deliverables_metadata)' };
      delete reg.standards[k].note;
    }
  }
  if (write) {
    reg._note = 'Standards registry for the Reviewer. Editions, dates and status come from ISO Open Data (npm run check:standards -- --write). The catalog states editions and dates, not what a clause requires: editors still read the publisher page before relying on content. The Reviewer only flags mismatches for a human to check.';
    delete reg._updated;
    fs.writeFileSync(REG, `${JSON.stringify(reg, null, 2)}\n`);
    console.log(`\nRegistry updated (${keys.size} standards, verified ${today}).`);
  } else if (diffs) { console.log(`\n${diffs} difference(s). Run with --write to update the registry.`); process.exitCode = 2; }
}

if (require.main === module) main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
module.exports = { parseRef, summarize, lines, STAGES };
