const test = require('node:test');
const assert = require('node:assert');
const M = require('../../src/lib/memberships');

const plan = { status: 'on_sale', kind: 'individual' };
const version = { status: 'approved', price_cents: 1000, period_months: 12, requires_student_check: false, benefits: [{ text: 'Card', available: true }] };

test('an approved, available plan on sale can be bought when sales are open', () => assert.deepStrictEqual(M.saleBlockers(plan, version, { salesOpen: true }), []));
test('closed sales, a draft or withdrawn plan, or missing terms block the sale', () => {
  assert.ok(M.saleBlockers(plan, version, { salesOpen: false }).length);
  assert.ok(M.saleBlockers({ ...plan, status: 'draft' }, version, { salesOpen: true }).length);
  assert.ok(M.saleBlockers(plan, null, { salesOpen: true }).length);
  assert.ok(M.saleBlockers(plan, { ...version, price_cents: null }, { salesOpen: true }).length);
});
test('a plan that promises a benefit not yet available is not sold', () =>
  assert.ok(M.saleBlockers(plan, { ...version, benefits: [{ text: 'Library', available: false }] }, { salesOpen: true }).some((b) => /not available/.test(b))));
test('student and group plans wait for their checks and seat management', () => {
  assert.ok(M.saleBlockers(plan, { ...version, requires_student_check: true }, { salesOpen: true }).length);
  assert.ok(M.saleBlockers({ ...plan, kind: 'group' }, version, { salesOpen: true }).length);
});
test('benefit lines: "+" marks a benefit available now', () => {
  assert.deepStrictEqual(M.parseBenefits('+ Card\nLibrary\n\n'), [{ text: 'Card', available: true }, { text: 'Library', available: false }]);
  assert.strictEqual(M.benefitsText(M.parseBenefits('+ Card\nLibrary')), '+ Card\nLibrary');
});
test('the proposed plans carry no price or period', () => assert.ok(M.PROPOSED.every((p) => !('price' in p) && !('period' in p))));
