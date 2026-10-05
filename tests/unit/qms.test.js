const test = require('node:test');
const assert = require('node:assert');
const qms = require('../../src/lib/qms');

test('business-day deadlines skip weekends; decision deadline is 30 calendar days', () => {
  const fri = new Date('2026-10-02T10:00:00Z'); // Friday
  const d = qms.caseDeadlines(fri);
  assert.strictEqual(d.ack_due, '2026-10-09');
  assert.strictEqual(d.decision_due, '2026-11-01');
  assert.strictEqual(qms.iso(qms.addBusinessDays(new Date('2026-10-05T00:00:00Z'), 1)), '2026-10-06');
});

test('document review date adds months correctly', () => {
  assert.strictEqual(qms.addMonthsISO('2026-10-05', 12), '2027-10-05');
  assert.strictEqual(qms.addMonthsISO('2026-01-31', 1).slice(0, 4), '2026');
});

test('an appeal needs a reviewer independent of the handler and the original decision-maker', () => {
  const c = { status: 'investigating', kind: 'appeal', handler_name: 'Ana Handler', original_decider_name: 'Omar Decider' };
  const ok = { decision: 'Upheld because ...', outcome: 'upheld', reviewer_name: 'Dr. Independent' };
  assert.strictEqual(qms.canDecide(c, ok), null);
  assert.match(qms.canDecide(c, { ...ok, reviewer_name: '' }), /independent reviewer/);
  assert.match(qms.canDecide(c, { ...ok, reviewer_name: ' omar decider ' }), /independent/);
  assert.match(qms.canDecide(c, { ...ok, reviewer_name: 'ANA HANDLER' }), /independent/);
  assert.match(qms.canDecide({ ...c, kind: 'complaint', status: 'received' }, ok), /acknowledged/);
  assert.match(qms.canDecide({ ...c, kind: 'complaint' }, { ...ok, decision: ' ' }), /decision text/);
  assert.strictEqual(qms.canDecide({ ...c, kind: 'complaint' }, { ...ok, reviewer_name: '' }), null);
});

test('a corrective action closes only with root cause, action, effectiveness and a verifier', () => {
  const a = { root_cause: 'Missing check', corrective_action: 'Add check', owner_name: 'Sam Owner' };
  const d = { verified_by_name: 'Lee Verifier', effectiveness_note: 'Sampled 20 records, none repeated' };
  assert.strictEqual(qms.canCloseAction(a, d, false), null);
  assert.match(qms.canCloseAction({ ...a, root_cause: '' }, d, false), /root cause/i);
  assert.match(qms.canCloseAction(a, { ...d, effectiveness_note: '' }, false), /effectiveness/);
  assert.match(qms.canCloseAction(a, { ...d, verified_by_name: 'sam owner' }, false), /different/);
  assert.strictEqual(qms.canCloseAction(a, { ...d, verified_by_name: 'sam owner' }, true), null);
});

test('document approval separation of duties', () => {
  assert.match(qms.approvalError('u1', 'u1', false), /different person/);
  assert.strictEqual(qms.approvalError('u1', 'u1', true), null);
  assert.strictEqual(qms.approvalError('u1', 'u2', false), null);
});

test('CSV export quotes fields and neutralises spreadsheet formulas', () => {
  const csv = qms.toCsv([{ a: 'x,y', b: '=HYPERLINK("http://e.vil")', c: 'line\nbreak', d: null, e: { k: 1 } }], ['a', 'b', 'c', 'd', 'e']);
  const lines = csv.split('\r\n');
  assert.strictEqual(lines[0], 'a,b,c,d,e');
  assert.ok(lines[1].startsWith('"x,y","\'=HYPERLINK'), 'formula is prefixed with an apostrophe so spreadsheets do not run it');
  assert.ok(csv.includes('"line\nbreak"') && csv.includes('"{""k"":1}"'));
});

test('starter documents are unique, numbered, and carry placeholders that block approval', () => {
  const nos = qms.STARTER_DOCS.map((d) => d[0]);
  assert.strictEqual(new Set(nos).size, nos.length);
  assert.ok(nos.every((n) => /^LIV-(POL|PRO)-\d{3}$/.test(n)));
  assert.match(qms.starterBody('T', ['A']), /_To be completed\._/);
  assert.ok(qms.STARTER_DOCS.length >= 10);
});
