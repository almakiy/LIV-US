// Editorial library (content/library): every file parses, validates, cites registered publishers and passes the Reviewer without blocks.
const test = require('node:test');
const assert = require('node:assert');
const checks = require('../../engines/reviewer/checks');
const { reviewDraft, defaultSources } = require('../../engines/reviewer');
const { parseItem, loadLibrary } = require('../../src/lib/library');

test('a library file is parsed into a draft with its sources', () => {
  const it = parseItem(`---
id: gov-test
slug: test-item
title: A test item
summary: A summary that is long enough to pass the structure check.
category: governance
kind: guide
tags: governance, boards
standards: ISO 37000:2021
next_review: 2027-04-01
sources:
- ISO 37000 | https://www.iso.org/standard/65036.html | ISO | 2026-10-09
- OECD Principles | https://www.oecd.org/x | OECD
---
## One

Text [1] and [2].
`, 'x.md');
  assert.strictEqual(it.slug, 'test-item');
  assert.deepStrictEqual(it.tags, ['governance', 'boards']);
  assert.strictEqual(it.sources.length, 2);
  assert.strictEqual(it.sources[0].accessed, '2026-10-09');
  assert.strictEqual(it.sources[1].accessed, undefined);
  assert.strictEqual(it.next_review_at, '2027-04-01');
  assert.match(it.body_md, /^## One/);
  assert.throws(() => parseItem('no header', 'y.md'), /missing header/);
});

test('the source check warns on unregistered publishers and on legal claims without an official source', () => {
  const reg = defaultSources();
  const base = { kind: 'guide', summary: 's', body_md: 'Boards should meet regularly [1].' };
  assert.deepStrictEqual(checks.sources({ ...base, sources: [{ title: 'x', url: 'https://www.iso.org/standard/1.html' }] }, reg), []);
  assert.deepStrictEqual(checks.sources({ ...base, sources: [{ title: 'x', url: 'https://blog.example.com/a' }] }, reg).map((f) => f.id), ['sources.unlisted-publisher']);
  const legal = { ...base, body_md: 'An audit committee is mandatory for listed companies [1].' };
  assert.deepStrictEqual(checks.sources({ ...legal, sources: [{ title: 'x', url: 'https://www.oecd.org/a' }] }, reg).map((f) => f.id), ['sources.no-official']);
  assert.deepStrictEqual(checks.sources({ ...legal, sources: [{ title: 'x', url: 'https://cma.org.sa/en/RulesRegulations/a' }] }, reg), []);
  assert.strictEqual(checks.publisherOf('https://www.laws.boe.gov.sa/x', reg).tier, 'official');
  assert.strictEqual(checks.publisherOf('https://doi.org/10.1787/ed750b30-en', reg).tier, 'intergovernmental');
  assert.strictEqual(checks.publisherOf('https://doi.org/10.3390/su10010246', reg).tier, 'research');
});

test('every library item is valid, unique and passes the Reviewer without blocking findings', async () => {
  const { items, errors } = loadLibrary();
  assert.deepStrictEqual(errors, []);
  for (const it of items) {
    const r = await reviewDraft({ ...it, version: 1 });
    const bad = r.flags.filter((f) => f.severity === 'block' || f.check === 'sources' || ['citations.unused', 'standards.unknown', 'standards.edition', 'standards.no-edition', 'links.insecure', 'identity.us-spelling', 'structure.limitations', 'structure.headings'].includes(f.id));
    assert.deepStrictEqual(bad, [], `${it.file}: ${JSON.stringify(bad, null, 1)}`);
    assert.ok(it.sources.length >= 2, `${it.file}: at least two sources`);
    assert.ok(it.sources.every((s) => s.accessed), `${it.file}: every source has an access date`);
    assert.ok(it.next_review_at, `${it.file}: next review date`);
  }
});

test('re-saving sources in the editor keeps their access dates and excerpts', () => {
  const { mergeExcerpts } = require('../../src/lib/content');
  const old = [{ title: 'A', url: 'https://www.iso.org/a', accessed: '2026-10-09' }, { title: 'B', url: 'https://www.oecd.org/b', excerpt: 'quote', accessed: '2026-10-01' }];
  assert.deepStrictEqual(mergeExcerpts([{ title: 'A2', url: 'https://www.iso.org/a', publisher: 'ISO' }, { title: 'B', url: 'https://www.oecd.org/b', publisher: '' }, { title: 'C', url: 'https://www.ilo.org/c', publisher: '' }], old),
    [{ title: 'A2', url: 'https://www.iso.org/a', publisher: 'ISO', accessed: '2026-10-09' }, { title: 'B', url: 'https://www.oecd.org/b', publisher: '', excerpt: 'quote', accessed: '2026-10-01' }, { title: 'C', url: 'https://www.ilo.org/c', publisher: '' }]);
});

test('the ISO catalog check reads references and picks the current edition, amendments and drafts', () => {
  const { parseRef, summarize } = require('../../scripts/check-standards');
  assert.deepStrictEqual(parseRef('ISO/IEC 17024:2026'), { key: 'ISO/IEC 17024', series: '', year: '2026', supplement: '' });
  assert.strictEqual(parseRef('ISO 45001:2018/Amd 1:2024').supplement, '/Amd 1:2024');
  assert.strictEqual(parseRef('ISO/DIS 45001').series, 'DIS');
  const row = (reference, publicationDate, currentStage, extra = {}) => ({ id: 1, reference, publicationDate, currentStage, edition: 1, title: { en: 'T' }, supplementType: null, ...extra });
  const s = summarize([row('ISO 45001:2018', '2018-03-12', 9092), row('ISO 45001:2018/Amd 1:2024', '2024-02-23', 6060, { supplementType: 'Amd' }), row('ISO/DIS 45001', null, 4060, { edition: 2 }), row('ISO 18001:2007', '2007-01-01', 9599)]);
  assert.strictEqual(s.current, '2018');
  assert.strictEqual(s.status, 'to be revised');
  assert.deepStrictEqual(s.amendments, ['ISO 45001:2018/Amd 1:2024']);
  assert.strictEqual(s.in_development[0], 'ISO/DIS 45001 (edition 2, stage 40.60)');
  assert.strictEqual(summarize([row('ISO 1:2000', '2000-01-01', 9599)]), null);
});
