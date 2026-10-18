const test = require('node:test');
const assert = require('node:assert');
const { recommend, inputHash, CRITERIA } = require('../../src/lib/assessment');

const all = (result) => CRITERIA.map((criterion) => ({ criterion, result }));
const with1 = (code, result) => all('met').map((f) => (f.criterion === code ? { ...f, result } : f));

test('recommendation follows fixed rules and a failed criterion is never averaged away', () => {
  assert.strictEqual(recommend(all('met')).outcome, 'accept');
  assert.strictEqual(recommend(with1('C9', 'minor')).outcome, 'accept_with_conditions');
  assert.strictEqual(recommend(with1('C3', 'major')).outcome, 'not_ready');
  assert.strictEqual(recommend([...with1('C3', 'major').slice(0, 8), { criterion: 'C9', result: 'minor' }]).outcome, 'not_ready', 'major wins over minor');
});

test('unreviewed or missing criteria give no recommendation, not a failure', () => {
  assert.strictEqual(recommend(with1('C5', 'needs_information')).outcome, 'incomplete');
  assert.strictEqual(recommend(all('met').slice(1)).outcome, 'incomplete');
  assert.strictEqual(recommend([]).outcome, 'incomplete');
});

test('the input fingerprint changes when any input changes and ignores ordering', () => {
  const base = { criteria: [{ code: 'C1' }], version: 1, findings: [{ criterion: 'C1', result: 'met', reason: 'ok', evidence_id: 'e1' }, { criterion: 'C2', result: 'met', reason: 'ok', evidence_id: 'e2' }], evidence: [{ id: 'e1', sha256: 'a' }, { id: 'e2', sha256: 'b' }] };
  const h = inputHash(base);
  assert.strictEqual(h, inputHash({ ...base, findings: [...base.findings].reverse(), evidence: [...base.evidence].reverse() }));
  assert.notStrictEqual(h, inputHash({ ...base, version: 2 }));
  assert.notStrictEqual(h, inputHash({ ...base, evidence: [{ id: 'e1', sha256: 'a' }] }));
  assert.notStrictEqual(h, inputHash({ ...base, findings: [{ ...base.findings[0], result: 'minor' }, base.findings[1]] }));
  assert.notStrictEqual(h, inputHash({ ...base, criteria: [{ code: 'C1', title: 'changed' }] }));
});
