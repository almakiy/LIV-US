const test = require('node:test');
const assert = require('node:assert');
const R = require('../../src/lib/resources');
const G = require('../../src/lib/gifts');

const item = { access: 'purchase', status: 'published', price_cents: 2500, sale_approved_at: new Date(), kind: 'guide' };
test('a published resource with an approved price can be bought when sales are open', () => assert.deepStrictEqual(R.saleBlockers(item, null, { salesOpen: true }), []));
test('closed sales, no price approval or not published block a sale', () => {
  assert.ok(R.saleBlockers(item, null, { salesOpen: false }).length);
  assert.ok(R.saleBlockers({ ...item, sale_approved_at: null }, null, { salesOpen: true }).length);
  assert.ok(R.saleBlockers({ ...item, status: 'draft' }, null, { salesOpen: true }).length);
});
test('free and member resources are never sold', () => assert.ok(R.saleBlockers({ ...item, access: 'members' }, null, { salesOpen: true }).length));
test('preparation products wait for an operating assessment program', () => {
  const prep = { ...item, kind: 'preparation' };
  assert.ok(R.saleBlockers(prep, { status: 'in_development', record_type: 'professional_certification' }, { salesOpen: true }).some((b) => /operating assessment/.test(b)));
  assert.ok(R.saleBlockers(prep, { status: 'published', record_type: 'training_completion' }, { salesOpen: true }).length);
  assert.deepStrictEqual(R.saleBlockers(prep, { status: 'published', record_type: 'professional_certification' }, { salesOpen: true }), []);
});
test('gift codes compare without case, spaces or dashes', () => assert.strictEqual(G.hash('gift-abcd-efgh-jkmn'), G.hash(' GIFT ABCD EFGH JKMN ')));
