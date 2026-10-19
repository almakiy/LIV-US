const test = require('node:test');
const assert = require('node:assert');
const F = require('../../src/lib/title-form');

const full = () => ({
  title: 'Workplace Safety Awareness', subfield: 'General workplace safety', summary: 'Covers hazards and safe working.', objectives: 'Identify common hazards\nReport an incident\nUse protective equipment',
  audience: 'Site supervisors', entry_requirements: 'None', duration: '8 hours over 2 days', agenda: 'Day 1 hazards; Day 2 reporting', delivery_modes: ['live_online'],
  delivery_language: 'English', delivery_setting: 'Online platform', responsible_trainer: 'Sami Nasser', authors: 'Sami Nasser, 8 years', materials: 'Slides and a handout',
  completion_rules: 'Attend both days', review_arrangement: 'Reviewed yearly by the academic lead; changes logged',
});

test('a complete request has no errors and a draft needs only clean text', () => {
  assert.deepStrictEqual(F.validate(F.clean(full()), { submit: true }), []);
  assert.deepStrictEqual(F.validate(F.clean({ title: 'X', summary: 'ok' })), []);
});

test('submission needs every field and at least three objectives', () => {
  const missing = F.validate(F.clean({ title: 'X' }), { submit: true }).map((e) => e.field);
  assert.ok(['summary', 'objectives', 'delivery_modes', 'completion_rules', 'review_arrangement'].every((k) => missing.includes(k)));
  const two = F.validate(F.clean({ ...full(), objectives: 'One\nTwo' }), { submit: true });
  assert.ok(two.some((e) => e.field === 'objectives' && /at least 3/.test(e.message)));
  assert.strictEqual(F.lines('1. First\n- Second\n\n3) Third').length, 3);
});

test('non-Latin text is refused, not converted', () => {
  const e = F.validate(F.clean({ ...full(), summary: 'ملخص الدورة' }));
  assert.strictEqual(e.length, 1); assert.strictEqual(e[0].field, 'summary');
});

test('titles that imply an approval or a professional status are flagged', () => {
  for (const t of ['Certified Professional in Safety', 'Accredited Safety Course', 'Chartered Safety Officer', 'Licensed Trainer Course', 'ISO Auditor approved by LIV', 'Certified Safety Specialist']) {
    assert.ok(F.validate({ title: t }).some((e) => e.field === 'title'), t);
  }
  for (const t of ['Workplace Safety Awareness', 'First Aid at Work', 'Introduction to Project Governance', 'Safety Certificate Preparation Workshop']) assert.deepStrictEqual(F.validate({ title: t }), [], t);
});
