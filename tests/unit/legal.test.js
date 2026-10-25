const test = require('node:test');
const assert = require('node:assert');
const L = require('../../src/lib/legal');

test('placeholders and draft labels block publication', () => {
  assert.strictEqual(L.blockers('- **Status:** DRAFT – NOT LEGAL ADVICE – PENDING COUNSEL REVIEW').length, 2);
  assert.strictEqual(L.blockers('Fee: [OWNER DECISION: P-6 fee]. Venue: [COUNSEL: choose]. [TO BE CONFIRMED BY COUNSEL]').length, 3);
  assert.strictEqual(L.blockers('# Privacy Policy\n\nApproved text with a [link](privacy-policy.md).').length, 0);
});

test('links between documents point to admin drafts or public pages', () => {
  assert.strictEqual(L.relink('See [terms](terms-of-use.md#3-accounts).', '/legal/'), 'See [terms](/legal/terms-of-use#3-accounts).');
  assert.strictEqual(L.relink('See [x](privacy-policy.md) and [web](https://example.com/a.md).', '/admin/legal/'), 'See [x](/admin/legal/privacy-policy) and [web](https://example.com/a.md).');
});

test('every real draft is still blocked, and the working notes are never publishable', () => {
  for (const slug of ['privacy-policy', 'terms-of-use', 'membership-terms']) assert.ok(L.readDraft(slug).blockers.length > 0, slug);
  assert.strictEqual(L.readDraft('README').internal, true);
  assert.strictEqual(L.readDraft('../package'), null);
});
