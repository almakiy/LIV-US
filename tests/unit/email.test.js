const test = require('node:test');
const assert = require('node:assert');
const { TEMPLATES, TARGETS, MAX_ATTEMPTS, backoffMinutes } = require('../../src/lib/email');

test('retry delays grow and are capped', () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5].map(backoffMinutes), [2, 4, 8, 16, 32]);
  assert.strictEqual(backoffMinutes(10), 60);
  assert.strictEqual(MAX_ATTEMPTS, 5);
});

test('the welcome message names the person, the next steps and the service targets', () => {
  const m = TEMPLATES.account_created({ name: 'Lina', company: 'Gulf Safety LLC' });
  assert.match(m.subject, /account/);
  for (const t of TARGETS) assert.ok(m.text.includes(t) && m.html.includes(t.replace(/&/g, '&amp;')));
  assert.ok(m.text.includes('Lina') && m.text.includes('/portal/application') && m.html.includes('/portal/application'));
  assert.ok(!/accredit|approved by/i.test(m.text), 'no status claim in the welcome');
});

test('user-supplied text is escaped in the HTML part', () => {
  const m = TEMPLATES.application_request({ company: '<b>X</b> & Co', reason: '<script>alert(1)</script>' });
  assert.ok(!m.html.includes('<script>') && !m.html.includes('<b>X</b>'));
  assert.ok(m.html.includes('&lt;script&gt;') && m.html.includes('&amp; Co'));
  assert.ok(m.text.includes('<script>alert(1)</script>'), 'the plain text part is not altered');
});

test('the fee and submission messages say what the fee does and does not do', () => {
  const sub = TEMPLATES.application_submitted({ company: 'X', version: 1, feeDue: true });
  assert.match(sub.text, /fee invoice is open/);
  const fee = TEMPLATES.application_fee_received({ company: 'X' });
  assert.match(fee.text, /does not affect the decision/);
});
