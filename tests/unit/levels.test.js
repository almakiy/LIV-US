const test = require('node:test');
const assert = require('node:assert');
const L = require('../../src/lib/levels');
const X = require('../../src/lib/exceptions');

test('a promotion is recommended only when every criterion is met', () => {
  const all = Object.fromEntries(L.CRITERIA.silver.map((c) => [c.key, { met: true }]));
  assert.deepStrictEqual(L.recommend('silver', all), { recommendation: 'promote', unmet: [] });
  const r = L.recommend('silver', { ...all, samples: { met: false } });
  assert.strictEqual(r.recommendation, 'not_yet'); assert.deepStrictEqual(r.unmet, ['samples']);
  assert.strictEqual(L.recommend('gold', all).recommendation, 'not_yet', 'Gold has extra criteria that are missing from the answers');
});

test('issued volume and payment are not criteria', () => {
  const text = JSON.stringify(L.CRITERIA);
  assert.ok(!/issued|volume of certificates|discount/i.test(text.replace(/very high volume/g, '')));
  assert.ok(L.CRITERIA.gold.length > L.CRITERIA.silver.length && L.ORDER.join() === 'bronze,silver,gold');
});

test('whole months are counted from the start date', () => {
  assert.strictEqual(L.monthsBetween(new Date('2025-10-20'), new Date('2026-10-19')), 11);
  assert.strictEqual(L.monthsBetween(new Date('2025-10-20'), new Date('2026-10-20')), 12);
  assert.strictEqual(L.monthsBetween(new Date('2024-10-20'), new Date('2026-10-20')), 24);
});

test('exception types and the forbidden ones never overlap', () => {
  assert.ok(Object.keys(X.CASE_TYPES).every((k) => !X.FORBIDDEN[k]));
  assert.ok(Object.keys(X.FORBIDDEN).length >= 6);
});
