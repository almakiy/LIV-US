const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// A database that cannot be read: verification must report "unavailable", never a cached "valid".
require.cache[path.join(__dirname, '../../src/db.js')] = { exports: { q: async () => { throw new Error('connection refused'); } } };
const { verifyCertificate, publicView } = require('../../src/lib/verify');

test('a failed record read returns unavailable, not valid', async () => {
  const out = await verifyCertificate('LIV-2026-ABCDEFGH', { ip: '127.0.0.1' });
  assert.strictEqual(out.result, 'unavailable');
  assert.deepStrictEqual(publicView(out, 'https://example.test'), { result: 'unavailable' });
});
