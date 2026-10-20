const test = require('node:test');
const assert = require('node:assert');
const { canReach } = require('../../src/lib/partner-roles');

test('account manager and legacy users reach everything', () => {
  assert.ok(canReach('account_manager', '/settings'));
  assert.ok(canReach(undefined, '/billing'));
});
test('academic lead is limited to authorization pages', () => {
  for (const p of ['/', '/application', '/titles/abc', '/trainers', '/level']) assert.ok(canReach('academic_lead', p), p);
  for (const p of ['/issue', '/billing', '/settings', '/settings/users', '/certificates']) assert.ok(!canReach('academic_lead', p), p);
});
test('records uploader is limited to issuance and records', () => {
  for (const p of ['/issue/upload', '/batches/1', '/certificates', '/templates/2']) assert.ok(canReach('records_uploader', p), p);
  for (const p of ['/billing', '/titles', '/settings']) assert.ok(!canReach('records_uploader', p), p);
});
test('finance reaches billing only; prefixes do not match lookalikes', () => {
  assert.ok(canReach('finance', '/billing/invoices/1'));
  assert.ok(canReach('finance', '/settings/billing'));
  assert.ok(!canReach('finance', '/settings'));
  assert.ok(!canReach('finance', '/billingx'));
  assert.ok(!canReach('finance', '/issue'));
});
