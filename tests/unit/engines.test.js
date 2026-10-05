const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const checks = require('../../engines/reviewer/checks');
const { checkClaims, extractClaims, lexicalJudge, parseVerdicts } = require('../../engines/reviewer/claims');
const { reviewDraft, summarize, defaultRegistry } = require('../../engines/reviewer');
const budget = require('../../engines/lib/budget');
const { anthropic, getProvider } = require('../../engines/lib/llm');
const { client } = require('../../engines/lib/site-client');

const good = () => ({
  title: 'Internal audits under ISO 45001:2018', kind: 'guide', category: 'safety', version: 1,
  summary: 'What to check when auditing an occupational health and safety management system.',
  body_md: '## Scope\n\nInternal audits must be conducted at planned intervals to check conformity with the system [1].\n\n## Method\n\nAuditors sample records for each process and report findings to management.\n',
  sources: [{ title: 'ISO 45001 overview', url: 'https://www.iso.org/standard/63787.html', excerpt: 'Internal audits must be conducted at planned intervals to provide information on whether the management system conforms to requirements.' }],
  standards: ['ISO 45001:2018'],
});
const ids = (flags) => flags.map((f) => f.id);

test('a clean draft passes the deterministic checks', async () => {
  const r = await reviewDraft(good(), {});
  assert.strictEqual(r.result, 'pass', JSON.stringify(r.flags));
  assert.strictEqual(r.score, 100);
});

test('identity rules block recognition, government, guarantee and equivalence claims', () => {
  for (const t of ['Our credential is ISO accredited.', 'We are accredited by ANAB today.', 'A federal-approved certificate.', 'We guarantee a pass for every candidate.', 'This is equivalent to PMP in every way.', 'Official U.S. government credential.']) {
    const f = checks.identity({ title: 'T', summary: 'S', body_md: t });
    assert.ok(f.some((x) => x.severity === 'block'), t);
  }
  assert.strictEqual(checks.identity({ title: 'T', summary: 'S', body_md: 'Auditors review the standard accredited training providers use.' }).filter((x) => x.severity === 'block').length, 0);
});

test('US spelling is a warning and non-Latin text blocks', () => {
  const f = checks.identity({ title: 'T', summary: 'S', body_md: 'The organisation runs a programme at the centre.' });
  assert.deepStrictEqual(ids(f), ['identity.us-spelling']);
  assert.strictEqual(f[0].severity, 'warn');
  const g = checks.identity({ title: String.fromCharCode(0x0639, 0x0646), summary: 'S', body_md: 'x' });
  assert.ok(ids(g).includes('language.non-latin'));
});

test('citations: dangling, unused, missing sources and uncited claims', () => {
  const a = { ...good(), body_md: '## A\n\nText [3].\n\n## B\n\nThe standard requires at least 12 audits per year for every site and every process in scope, and the results must be reported to top management.\n' };
  const f = checks.citations(a);
  assert.ok(ids(f).includes('citations.dangling'));
  assert.ok(ids(f).includes('citations.unused'));
  assert.ok(ids(f).includes('citations.uncited-claim'));
  assert.ok(ids(checks.citations({ ...good(), kind: 'standards', sources: [], body_md: 'x' })).includes('citations.missing-sources'));
});

test('standards: unknown, missing edition, edition mismatch, unlisted', () => {
  const reg = defaultRegistry();
  const mk = (body, list = []) => checks.standards({ title: 'T', summary: 'S', body_md: body, standards: list }, reg);
  assert.ok(ids(mk('See ISO 99999:2020.')).includes('standards.unknown'));
  assert.ok(ids(mk('See ISO 45001 for details.', ['ISO 45001:2018'])).includes('standards.no-edition'));
  assert.ok(ids(mk('See ISO 45001:2008.', ['ISO 45001:2008'])).includes('standards.edition'));
  assert.ok(ids(mk('See ISO 45001:2018.')).includes('standards.unlisted'));
  assert.deepStrictEqual(ids(mk('See ISO/IEC 17024:2012 and ISO 17024:2012.', ['ISO/IEC 17024:2012'])).filter((x) => x !== 'standards.unlisted'), []);
});

test('similarity: word-for-word copying of a source blocks', () => {
  const excerpt = 'Internal audits must be conducted at planned intervals to provide information on whether the management system conforms to the organization own requirements and the requirements of this document and is effectively implemented and maintained';
  const copy = { ...good(), body_md: `## A\n\n${excerpt}.\n\n## B\n\nMore.`, sources: [{ title: 'S', url: 'https://x.y', excerpt }] };
  assert.ok(checks.similarity(copy).some((f) => f.severity === 'block'));
  assert.deepStrictEqual(checks.similarity(good()), []);
});

test('structure: headings, case-study lessons, future dates, insecure links', () => {
  const f = checks.structure({ kind: 'case-study', summary: 'short', body_md: 'Plain text. Held on 2999-01-01. [x](http://example.com/a)' }, new Date('2026-10-05'));
  for (const id of ['structure.summary', 'structure.headings', 'structure.lessons', 'dates.future', 'links.insecure']) assert.ok(ids(f).includes(id), id);
});

test('claim check (offline, lexical): supported, partial for a missing number, unsupported, no evidence', () => {
  const src = [{ excerpt: 'Internal audits must be conducted at planned intervals to provide information on conformity of the management system.' }];
  assert.strictEqual(lexicalJudge({ text: 'Internal audits must be conducted at planned intervals.', cites: [1] }, src).verdict, 'supported');
  assert.strictEqual(lexicalJudge({ text: 'Internal audits must be conducted every 12 months.', cites: [1] }, src).verdict, 'partial');
  assert.strictEqual(lexicalJudge({ text: 'Quarterly drone inspections guarantee fewer incidents everywhere.', cites: [1] }, src).verdict, 'unsupported');
  assert.strictEqual(lexicalJudge({ text: 'Anything here.', cites: [1] }, [{}]).verdict, 'no_evidence');
  assert.strictEqual(extractClaims('A fact [1]. Another fact [2][3]. No cite here.').length, 2);
});

test('claim check with a model: verdicts are parsed and unsupported claims block', async () => {
  const llm = { name: 'fake', model: 'm1', async complete() { return { text: 'Here you go: [{"i":0,"verdict":"unsupported","note":"not in source"}]', usage: {} }; } };
  const a = { ...good(), body_md: '## A\n\nThe rule applies to all sites worldwide [1].\n\n## B\n\nx' };
  const { flags, method } = await checkClaims(a, llm);
  assert.strictEqual(method, 'model');
  assert.ok(flags.some((f) => f.id === 'claims.unsupported' && f.severity === 'block'));
  assert.strictEqual(parseVerdicts('not json', 2), null);
  const bad = { name: 'fake', model: 'm1', async complete() { throw new Error('boom'); } };
  const r = await checkClaims(a, bad);
  assert.strictEqual(r.method, 'lexical');
  assert.ok(r.flags.some((f) => f.id === 'claims.fallback'));
});

test('scoring: blocks and warnings reduce the score and set the result', () => {
  assert.deepStrictEqual(summarize([]), { result: 'pass', score: 100, blocks: 0, warns: 0 });
  assert.strictEqual(summarize([{ severity: 'warn' }, { severity: 'info' }]).result, 'needs_changes');
  const b = summarize([{ severity: 'block' }, { severity: 'warn' }]);
  assert.deepStrictEqual([b.result, b.score], ['block', 70]);
  assert.strictEqual(summarize(Array(10).fill({ severity: 'block' })).score, 0);
});

test('budget guard: no budget, cap, kill switch, ledger by month', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liv-eng-'));
  assert.throws(() => budget.assertCanSpend(0.01, { dir, budget: 0 }), /No monthly budget/);
  assert.doesNotThrow(() => budget.assertCanSpend(0.01, { dir, budget: 1 }));
  budget.record({ engine: 'reviewer', cost_usd: 0.95 }, dir);
  assert.throws(() => budget.assertCanSpend(0.1, { dir, budget: 1 }), /exceeded/);
  assert.doesNotThrow(() => budget.assertCanSpend(0.04, { dir, budget: 1 }));
  assert.ok(Math.abs(budget.spentThisMonth(dir) - 0.95) < 1e-9);
  assert.strictEqual(budget.spentThisMonth(dir, new Date('2001-01-15')), 0);
  fs.writeFileSync(path.join(dir, 'KILL'), '');
  assert.throws(() => budget.assertCanSpend(0, { dir, budget: 1 }), /switched off/);
  assert.strictEqual(budget.costUsd(1000000, 1000000, 3, 15), 18);
});

test('paid provider refuses to run without key, prices and a budget; default provider is offline', async () => {
  assert.strictEqual(getProvider().name, 'mock');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liv-eng-'));
  await assert.rejects(anthropic({ apiKey: '', dataDir: dir }).complete({ prompt: 'x' }), /ANTHROPIC_API_KEY/);
  await assert.rejects(anthropic({ apiKey: 'k', priceInPerMTok: NaN, priceOutPerMTok: NaN, dataDir: dir }).complete({ prompt: 'x' }), /PRICE/);
  await assert.rejects(anthropic({ apiKey: 'k', priceInPerMTok: 1, priceOutPerMTok: 1, monthlyBudgetUsd: 0, dataDir: dir }).complete({ prompt: 'x' }), /budget/i);
});

test('site client sends the service key and surfaces API errors', async () => {
  const calls = [];
  const fakeFetch = async (url, opt) => { calls.push({ url, opt }); return url.endsWith('/review/queue') ? { ok: true, json: async () => ({ items: [] }) } : { ok: false, status: 409, json: async () => ({ error: 'stale' }) }; };
  const c = client({ siteUrl: 'https://liv.example', serviceKey: 'liv_abc', fetchImpl: fakeFetch });
  assert.deepStrictEqual(await c.reviewQueue(), { items: [] });
  assert.strictEqual(calls[0].opt.headers['x-api-key'], 'liv_abc');
  assert.strictEqual(calls[0].url, 'https://liv.example/api/v1/content/review/queue');
  await assert.rejects(c.postReport('id1', { version: 1 }), /409.*stale/);
  await assert.rejects(client({ serviceKey: '' }).reviewQueue(), /ENGINE_SERVICE_KEY/);
});
