// Batch H rules: monitoring thresholds, the notice wording, criteria versions, draft reminder steps and the retention list.
const test = require('node:test');
const assert = require('node:assert');
const I = require('../../src/lib/indicators');
const S = require('../../src/lib/standards');
const R = require('../../src/lib/reminders');
const RET = require('../../src/lib/retention');
const PR = require('../../src/lib/partner-records');

test('a batch of 5 times the monthly average or more opens a volume case; less does not', () => {
  assert.deepStrictEqual(I.batchTriggers({ issued: 50, monthlyAverage: 10, included: 0 }), ['volume_spike']);
  assert.deepStrictEqual(I.batchTriggers({ issued: 49, monthlyAverage: 10, included: 0 }), []);
});

test('no volume case without a baseline: a platform with no history is not flagged by the average', () => {
  assert.deepStrictEqual(I.batchTriggers({ issued: 500, monthlyAverage: 0, included: 0 }), []);
});

test('a batch of more than half the included allowance opens an allowance case; exactly half does not', () => {
  assert.deepStrictEqual(I.batchTriggers({ issued: 51, monthlyAverage: 0, included: 100 }), ['half_allowance']);
  assert.deepStrictEqual(I.batchTriggers({ issued: 50, monthlyAverage: 0, included: 100 }), []);
  assert.deepStrictEqual(I.batchTriggers({ issued: 500, monthlyAverage: 0, included: null }), [], 'no allowance means no allowance check');
});

test('three refused batches or three complaints in 90 days fire; two do not', () => {
  assert.strictEqual(I.T.windowDays, 90);
  assert.strictEqual(I.countTriggered(3, I.T.refusedBatches), true);
  assert.strictEqual(I.countTriggered(2, I.T.complaints), false);
});

test('the response and escalation periods are 5 and 10 working days', () => {
  assert.strictEqual(I.T.respondBusinessDays, 5);
  assert.strictEqual(I.T.escalateBusinessDays, 10);
});

test('the notice states the figures that caused it and is not written as a finding', () => {
  assert.match(I.describe('volume_spike', { issued: 60, average: 10 }), /60 certificates.*5 times.*10/);
  assert.match(I.describe('complaints', { count: 3 }), /3 complaints/);
});

test('criteria versions keep codes C1 to C9 in order and reject English-only breaks', () => {
  const ok = S.CODES.map((code) => ({ code, title: `Title ${code}`, if_not_met: 'major' }));
  assert.strictEqual(S.validateCriteria(ok), null);
  assert.match(S.validateCriteria(ok.slice(1)), /in that order/);
  assert.strictEqual(S.validateCriteria(ok.map((c, i) => (i === 3 ? { ...c, title: 'Contenu' } : c))), null, 'Latin text passes');
  assert.match(S.validateCriteria(ok.map((c, i) => (i === 0 ? { ...c, title: 'عنوان' } : c))), /C1: write in English/);
  assert.throws(() => S.parseCriteria('not json'), /not valid JSON/);
});

test('draft reminders are sent at 30 and 90 idle days, the longer period first', () => {
  assert.deepStrictEqual(R.STEPS, [90, 30]);
});

test('the retention schedule lists each record type once and sets no period', () => {
  const keys = RET.RECORD_TYPES.map((r) => r.key);
  assert.strictEqual(new Set(keys).size, keys.length);
  assert.ok(RET.RECORD_TYPES.every((r) => !('period' in r)), 'periods wait for decision P-14');
});

test('material-change kinds and sanctions results are fixed lists', () => {
  assert.ok(PR.CHANGE_KINDS.other);
  assert.deepStrictEqual(Object.keys(PR.SANCTION_RESULTS), ['no_match', 'possible_match', 'match']);
});
