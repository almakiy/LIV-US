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
