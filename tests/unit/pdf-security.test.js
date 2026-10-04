// Unit tests (no database): node --test tests/unit
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { normalizeConfig, patternParams, RECOMMENDED } = require('../../src/lib/pdf-security');
const { renderCertificate, THEMES } = require('../../src/lib/pdf');

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const data = (n) => ({
  cert_number: `LIV-2026-TEST000${n}`, first_name: 'Jane', last_name: 'Doe', course_name: 'Test Course', grade: 'Pass',
  completion_date: '2026-09-01', issue_date: '2026-09-02', expiry_date: null,
  verify_url: `http://localhost:3000/verify/LIV-2026-TEST000${n}?t=abc`, verification_hash: hash(String(n)),
});
const platform = { company_name: 'Test Co', logo_path: null, primary_color: '#0B1F3A' };

test('pattern is deterministic for a seed and differs across seeds', () => {
  assert.deepStrictEqual(patternParams(hash('a'), 'dense'), patternParams(hash('a'), 'dense'));
  assert.notDeepStrictEqual(patternParams(hash('a')), patternParams(hash('b')));
});

test('normalizeConfig defaults to everything off and rejects junk', () => {
  assert.deepStrictEqual(normalizeConfig({}), { guilloche: 'off', microtext: false, ghost: false, tiled: false, fingerprint: false, verifyStrip: false });
  assert.strictEqual(normalizeConfig({ guilloche: 'evil' }).guilloche, 'off');
  assert.strictEqual(normalizeConfig(null).microtext, false);
});

for (const design of Object.keys(THEMES)) {
  test(`${design}: renders a PDF, and security layers add content`, async () => {
    const plain = await renderCertificate(data(1), platform, { design, security_config: {} });
    const secured = await renderCertificate(data(1), platform, { design, security_config: { ...RECOMMENDED, tiled: true, guilloche: 'dense' } });
    assert.strictEqual(plain.slice(0, 4).toString(), '%PDF');
    assert.strictEqual(secured.slice(0, 4).toString(), '%PDF');
    assert.ok(secured.length > plain.length * 1.5, `secured ${secured.length} vs plain ${plain.length}`);
  });
}
