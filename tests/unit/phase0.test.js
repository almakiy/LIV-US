// Phase 0 safeguards: durable file keys, and development defaults that never work on a deployed server.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
// Each check runs in a fresh process so the deployed / not deployed setting is read from the environment it is given.
const run = (code, env) => spawnSync(process.execPath, ['-e', code], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'development', REPLIT_DEPLOYMENT: '', ...env } });
const refused = (env, pw) => run(`process.stdout.write(String(require('./src/lib/dev-defaults').refusedPassword(${JSON.stringify(pw)})))`, env).stdout;

test('file keys stay inside the storage folder', () => {
  const { validKey, typeOf } = require('../../src/lib/files');
  for (const ok of ['pdfs/0f1e2d3c-aaaa-bbbb-cccc-000000000000/LIV-2026-7KQ4M9XZ.pdf', 'logos/0f1e2d3c-aaaa-bbbb-cccc-000000000000-1760000000000.png']) assert.ok(validKey(ok), ok);
  for (const bad of ['../etc/passwd', 'pdfs/../../x.pdf', '/abs/x.pdf', 'pdfs', 'pdfs/a b.pdf', 'pdfs\\x.pdf', '', null]) assert.ok(!validKey(bad), String(bad));
  assert.strictEqual(typeOf('pdfs/a/b.pdf'), 'application/pdf');
  assert.strictEqual(typeOf('logos/a.jpg'), 'image/jpeg');
});

test('development passwords are refused on a Replit deployment and in production, accepted in development', () => {
  for (const env of [{ REPLIT_DEPLOYMENT: '1' }, { NODE_ENV: 'production', SESSION_SECRET: 's', CERT_HMAC_SECRET: 'h' }]) {
    assert.strictEqual(refused(env, 'ChangeMe-Admin-2026'), 'true');
    assert.strictEqual(refused(env, 'ChangeMe-Demo-2026'), 'true');
    assert.strictEqual(refused(env, 'A-Real-Owner-Password-1'), 'false');
  }
  assert.strictEqual(refused({}, 'ChangeMe-Admin-2026'), 'false');
});

test('the seed script does not run on a deployed server', () => {
  const r = spawnSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, REPLIT_DEPLOYMENT: '1' } });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /does not run on a deployed server/);
});
