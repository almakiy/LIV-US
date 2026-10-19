const test = require('node:test');
const assert = require('node:assert');
const F = require('../../src/lib/application-form');

const full = () => ({
  legal_name: 'Gulf Safety Training LLC', country: 'United Arab Emirates', representative_name: 'Omar Al-Farsi', representative_email: 'omar@example.com',
  academic_lead: 'Sara Haddad, lead trainer, 10 years', domain_requested: 'Workplace safety awareness', delivery_modes: ['live_online'],
  delivery_setting: 'Online platform', trainers: 'Two trainers', completion_rules: 'Attend all sessions', interests: 'None',
});

test('the form accepts English text, accents and apostrophes in names', () => {
  const f = { ...F.clean(full()), trading_name: "José Müller & O'Brien" };
  assert.deepStrictEqual(F.validate(f), []);
});

test('Arabic or other non-Latin letters are refused with a clear message, not converted', () => {
  const f = F.clean({ ...full(), legal_name: 'شركة الخليج' });
  const e = F.validate(f);
  assert.strictEqual(e.length, 1);
  assert.strictEqual(e[0].field, 'legal_name');
  assert.match(e[0].message, /English/);
  assert.strictEqual(f.legal_name, 'شركة الخليج', 'the entry is left as typed');
});

test('submission needs the required fields and the C1 and C3 documents; a draft does not', () => {
  assert.deepStrictEqual(F.validate(F.clean({})), []);
  const missing = F.validate(F.clean({}), { submit: true, evidence: [] }).map((e) => e.field);
  assert.ok(missing.includes('legal_name') && missing.includes('delivery_modes') && missing.includes('evidence_C1') && missing.includes('evidence_C3'));
  assert.deepStrictEqual(F.validate(F.clean(full()), { submit: true, evidence: ['C1', 'C3'] }), []);
});

test('formats are checked and unknown or oversized input is dropped', () => {
  const f = F.clean({ ...full(), representative_email: 'nope', website: 'ftp://x', injected: 'x', legal_name: 'A'.repeat(500), delivery_modes: ['live_online', 'telepathy'] });
  assert.strictEqual(f.injected, undefined);
  assert.strictEqual(f.legal_name.length, 200);
  assert.deepStrictEqual(f.delivery_modes, ['live_online']);
  const fields = F.validate(f).map((e) => e.field);
  assert.ok(fields.includes('representative_email') && fields.includes('website'));
});

test('readiness lists what is missing and says nothing about acceptance', () => {
  const r = F.readiness(F.clean({ legal_name: 'X Ltd' }), ['C1']);
  assert.ok(r.some((m) => /C3/.test(m.message)) && !r.some((m) => /C1 \(/.test(m.message)));
});

test('stages cover every field once and track completion on their own', () => {
  const keys = F.STAGES.flatMap((s) => s.fields);
  assert.deepStrictEqual([...keys].sort(), F.FIELDS.map((f) => f.key).sort());
  assert.strictEqual(new Set(keys).size, keys.length);
  const done = F.stageStatus(F.clean(full()), ['C1', 'C3']);
  assert.deepStrictEqual(done, { org: true, training: true, policies: true, documents: true, review: false });
  const part = F.stageStatus(F.clean({ legal_name: 'X' }), ['C1']);
  assert.strictEqual(part.org, false); assert.strictEqual(part.documents, false);
});

test('a stage is checked on its own fields only', () => {
  const stage = F.STAGES.find((s) => s.key === 'training');
  const part = F.clean({ academic_lead: 'Sami' }, stage.fields);
  assert.deepStrictEqual(Object.keys(part).sort(), [...stage.fields].sort());
  assert.deepStrictEqual(F.validate(part, { only: stage.fields }), [], 'incomplete is fine on a draft save');
  assert.ok(F.validate(F.clean({ academic_lead: 'سامي' }, stage.fields), { only: stage.fields }).length === 1);
});
