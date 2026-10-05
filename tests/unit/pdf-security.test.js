// Unit tests (no database): node --test tests/unit
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { normalizeConfig, patternParams, RECOMMENDED } = require('../../src/lib/pdf-security');
const { renderCertificate, THEMES, accreditationNote } = require('../../src/lib/pdf');

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
  assert.deepStrictEqual(normalizeConfig({}), { guilloche: 'off', colors: 'brand', qrBadge: false, legalNote: false, strip: false, microtext: false, ghost: false, tiled: false, fingerprint: false, verifyStrip: false });
  assert.strictEqual(normalizeConfig({ colors: 'neon' }).colors, 'brand');
  assert.strictEqual(normalizeConfig({ colors: 'iris', qrBadge: true }).qrBadge, true);
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

test('all themes are US Letter landscape; QR badge, iris colors and legal note add content', async () => {
  for (const design of Object.keys(THEMES)) {
    const plain = await renderCertificate(data(4), platform, { design, security_config: {} });
    const rich = await renderCertificate(data(4), platform, { design, security_config: { ...RECOMMENDED, guilloche: 'dense', legalNote: true } });
    assert.ok(/MediaBox \[0 0 792 612\]/.test(rich.toString('latin1')), `${design} is landscape Letter`);
    assert.ok(rich.length > plain.length * 1.4, `${design}: rich ${rich.length} vs plain ${plain.length}`);
  }
  assert.deepStrictEqual(Object.keys(THEMES), ['classic', 'modern', 'executive']);
});

test('accreditation statement is one short official line and never names the partner', () => {
  const note = accreditationNote({ company_name: 'Gulf Safety Training Center LLC' }, { partnerName: true });
  assert.ok(!note.includes('Gulf Safety'));
  assert.match(note, /^Issued by LIV on the basis of the completion report of an accredited education partner\.$/);
});

test('security strip: deterministic per fingerprint, different across certificates', () => {
  const { drawSecurityStrip } = require('../../src/lib/pdf-strip');
  const record = (seed) => {
    const ops = [];
    const doc = new Proxy({}, { get: (_, name) => (...args) => { ops.push(`${String(name)}:${JSON.stringify(args)}`); return name === 'widthOfString' ? 100 : doc; } });
    drawSecurityStrip(doc, { x: 14, w: 9, y0: 28, y1: 584, seed, text: 'LIV-2026-DEMO0001' });
    return ops.join('|');
  };
  assert.strictEqual(record(hash('a')), record(hash('a')));
  assert.notStrictEqual(record(hash('a')), record(hash('b')));
  assert.ok(record(hash('a')).includes('LIV-2026-DEMO0001'), 'serial is part of the strip');
});

test('executive with the strip renders more content than with plain bars', async () => {
  const withStrip = await renderCertificate(data(5), platform, { design: 'executive', security_config: { ...RECOMMENDED } });
  const bars = await renderCertificate(data(5), platform, { design: 'executive', security_config: { ...RECOMMENDED, strip: false } });
  assert.ok(withStrip.length > bars.length + 1000, `${withStrip.length} vs ${bars.length}`);
});
