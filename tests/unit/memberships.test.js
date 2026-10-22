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
test('proposed starting prices are whole dollars for 12 months, with member above student and plus above member', () => {
  const by = Object.fromEntries(M.PROPOSED.map((p) => [p.code, p]));
  assert.ok(M.PROPOSED.every((p) => p.period_months === 12 && p.price_cents % 100 === 0));
  assert.ok(by.student.price_cents < by.corporate.price_cents && by.corporate.price_cents < by.member.price_cents && by.member.price_cents < by.member_plus.price_cents);
});
test('the proposed terms cannot be approved until counsel confirms refunds', () => assert.match(M.PROPOSED_TERMS, /\[TO BE CONFIRMED/));
