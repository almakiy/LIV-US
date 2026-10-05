const test = require('node:test');
const assert = require('node:assert');
const { validateDraft, parseSourcesText, sourcesToText, parseStandards, KINDS } = require('../../src/lib/content');
const { contentChanged } = require('../../src/lib/article-store');

const base = { external_id: 'sig-001', title: 'ISO 45001 internal audits', summary: 'A short summary.', body_md: '## Heading\n\nText.', category: 'safety', kind: 'guide' };

test('draft validation accepts a complete English draft and defaults to AI-assisted', () => {
  const { errors, value } = validateDraft({ ...base, sources: [{ title: 'ISO 45001', url: 'https://www.iso.org/standard/63787.html', publisher: 'ISO', accessed: '2026-10-05' }], standards: ['ISO 45001:2018'] });
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(value.ai_assisted, true);
  assert.strictEqual(value.sources[0].accessed, '2026-10-05');
});

test('draft validation rejects missing fields, bad enums, unsafe links and non-English text', () => {
  const e = validateDraft({ external_id: 'bad id', title: '', kind: 'x', category: 'y', sources: [{ title: 'a', url: 'javascript:1' }] }).errors.join('|');
  for (const part of ['external_id', 'title is required', 'summary is required', 'body_md is required', 'category must', 'kind must', 'sources[0]']) assert.ok(e.includes(part), part);
  assert.ok(validateDraft({ ...base, title: String.fromCharCode(0x0639, 0x0646, 0x0648, 0x0627, 0x0646) }).errors.some((x) => x.includes('English')));
  assert.ok(validateDraft(null).errors.length > 0);
});

test('engines cannot set review or version fields', () => {
  const { value } = validateDraft({ ...base, reviewed_by: 'Me', version: 99, status: 'published' });
  assert.ok(!('reviewed_by' in value) && !('version' in value) && !('status' in value));
});

test('sources text round-trips and drops lines without a valid link', () => {
  const parsed = parseSourcesText('OSHA | https://www.osha.gov/ | U.S. DOL\nno link here\nBad | ftp://x.y');
  assert.deepStrictEqual(parsed, [{ title: 'OSHA', url: 'https://www.osha.gov/', publisher: 'U.S. DOL' }]);
  assert.strictEqual(parseSourcesText(sourcesToText(parsed))[0].title, 'OSHA');
});

test('standards are de-duplicated and capped; content types cover the planned taxonomy', () => {
  assert.deepStrictEqual(parseStandards('ISO 9001:2015, ISO 9001:2015 , ISO 14001:2015'), ['ISO 9001:2015', 'ISO 14001:2015']);
  for (const k of ['guide', 'standards', 'case-study', 'research', 'briefing', 'tool', 'news', 'glossary']) assert.ok(KINDS[k], k);
});

test('contentChanged ignores metadata but sees text, sources and standards', () => {
  const a = { title: 'T', summary: 'S', body_md: 'B', sources: [], standards: [] };
  assert.strictEqual(contentChanged(a, { ...a, reviewed_by: 'x' }), false);
  assert.strictEqual(contentChanged(a, { ...a, body_md: 'B2' }), true);
  assert.strictEqual(contentChanged(a, { ...a, standards: ['ISO 9001:2015'] }), true);
});

test('contentChanged is not fooled by the key order of stored sources', () => {
  const a = { title: 'T', summary: 'S', body_md: 'B', standards: [], sources: [{ url: 'https://a.b', title: 'X', publisher: 'P' }] };
  const b = { ...a, sources: [{ title: 'X', url: 'https://a.b', publisher: 'P' }] };
  assert.strictEqual(contentChanged(a, b), false);
});
