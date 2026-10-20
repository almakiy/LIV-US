// The scope expansion request form: a new subfield, delivery mode, or platform or site capability (docs/PARTNER-AUTHORIZATION.md §4.2).
const { hasNonLatin } = require('./application-form');
const { CLAIMS } = require('./title-form');

const TYPES = { subfield: 'A new subfield', delivery_mode: 'A new delivery mode', platform_or_site: 'A new platform or training site' };
const FIELDS = [
  { key: 'title', label: 'Name of the expansion (in English)', type: 'text', max: 200, required: true },
  { key: 'expansion_type', label: 'What is new', type: 'select', options: TYPES, required: true },
  { key: 'description', label: 'Describe the new capability', type: 'textarea', max: 2000, required: true },
  { key: 'reason', label: 'Why you need it (the titles or demand behind it)', type: 'textarea', max: 1500, required: true },
  { key: 'equipment_or_platform', label: 'Equipment, platform or site that makes it possible', type: 'textarea', max: 1500, required: true },
  { key: 'trainers', label: 'Trainers qualified for it and their qualifications', type: 'textarea', max: 2000, required: true },
  { key: 'safeguards', label: 'Safety and quality arrangements for this capability', type: 'textarea', max: 1500, required: true },
  { key: 'planned_titles', label: 'Titles you plan to request once it is authorized', type: 'textarea', max: 1500 },
];
function clean(body = {}) {
  const out = {};
  for (const f of FIELDS) out[f.key] = f.type === 'select' ? (TYPES[body[f.key]] ? body[f.key] : '') : String(body[f.key] ?? '').trim().slice(0, f.max);
  return out;
}
function validate(form, { submit = false } = {}) {
  const errors = [];
  for (const f of FIELDS) {
    const v = form[f.key];
    if (!v) { if (submit && f.required) errors.push({ field: f.key, message: `${f.label}: this is required.` }); continue; }
    if (f.type !== 'select' && hasNonLatin(v)) errors.push({ field: f.key, message: `${f.label}: write in English (Latin letters). Nothing is translated or converted.` });
  }
  if (form.title && CLAIMS.test(form.title)) errors.push({ field: 'title', message: 'The name implies an approval or professional status. Describe the capability instead.' });
  return errors;
}
module.exports = { FIELDS, TYPES, clean, validate };
