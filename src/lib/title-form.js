// The title (course) request form (docs/PARTNER-AUTHORIZATION.md §4.2). English only; text is checked, never converted.
const { hasNonLatin } = require('./application-form');

const MODES = { classroom: 'In person', live_online: 'Live online', self_paced: 'Self-paced online' };
const FIELDS = [
  { key: 'title', label: 'Title (in English)', type: 'text', max: 200, required: true, help: 'A different title is a different request.' },
  { key: 'subfield', label: 'Subfield within your authorized field', type: 'text', max: 200, required: true },
  { key: 'summary', label: 'Summary: what the course covers and why it matters to the learner', type: 'textarea', max: 2000, required: true },
  { key: 'objectives', label: 'Learning objectives (one per line, at least 3, each saying what a learner can do)', type: 'textarea', max: 3000, required: true },
  { key: 'audience', label: 'Audience (roles, industries, seniority)', type: 'textarea', max: 1500, required: true },
  { key: 'entry_requirements', label: 'Entry requirements (skills or knowledge learners need already)', type: 'textarea', max: 1500, required: true },
  { key: 'duration', label: 'Duration (hours and how they are spread)', type: 'text', max: 200, required: true },
  { key: 'agenda', label: 'Agenda or timings', type: 'textarea', max: 3000, required: true },
  { key: 'delivery_modes', label: 'Delivery', type: 'checkboxes', options: MODES, required: true },
  { key: 'delivery_language', label: 'Language of delivery', type: 'text', max: 100, required: true },
  { key: 'delivery_setting', label: 'Platform or training site', type: 'text', max: 300, required: true },
  { key: 'responsible_trainer', label: 'Responsible trainer (name as in your trainer records)', type: 'text', max: 200, required: true },
  { key: 'authors', label: 'Authors of the course and their qualifications', type: 'textarea', max: 2000, required: true },
  { key: 'materials', label: 'Materials given to learners', type: 'textarea', max: 2000, required: true },
  { key: 'completion_rules', label: 'Completion rules (attendance and what counts as completed; no exam for the Training Completion Credential)', type: 'textarea', max: 2000, required: true },
  { key: 'review_arrangement', label: 'How the content is kept up to date: who reviews it, how often, and how changes are recorded', type: 'textarea', max: 1500, required: true },
];
const MIN_OBJECTIVES = 3;
// A title must not imply a professional status or an approval LIV has not granted. This catches the obvious wording; the reviewer judges the rest.
const CLAIMS = /\b(accredited|licen[sc]ed|chartered|approved by|recognized by|recognised by|endorsed by)\b|\bcertified\s+(?:[\w-]+\s+){0,3}(professional|specialist|engineer|officer|practitioner|auditor|assessor|trainer|instructor|expert|consultant)\b/i;
const lines = (v) => String(v || '').split(/\r?\n/).map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean);

function clean(body = {}) {
  const out = {};
  for (const f of FIELDS) out[f.key] = f.type === 'checkboxes' ? [].concat(body[f.key] || []).filter((m) => MODES[m]) : String(body[f.key] ?? '').trim().slice(0, f.max);
  return out;
}
/** Errors for a draft save (language and wording only) or a submission (also completeness). */
function validate(form, { submit = false } = {}) {
  const errors = [];
  for (const f of FIELDS) {
    const v = form[f.key];
    if (f.type === 'checkboxes') { if (submit && f.required && !v?.length) errors.push({ field: f.key, message: `${f.label}: choose at least one.` }); continue; }
    if (!v) { if (submit && f.required) errors.push({ field: f.key, message: `${f.label}: this is required.` }); continue; }
    if (hasNonLatin(v)) errors.push({ field: f.key, message: `${f.label}: write in English (Latin letters). Nothing is translated or converted.` });
  }
  if (form.title && CLAIMS.test(form.title)) errors.push({ field: 'title', message: 'The title implies an approval or professional status that a LIV Training Completion Credential does not carry. Describe the training instead (for example "Workplace Safety Awareness").' });
  if (submit && form.objectives && lines(form.objectives).length < MIN_OBJECTIVES) errors.push({ field: 'objectives', message: `Learning objectives: give at least ${MIN_OBJECTIVES}, one per line.` });
  return errors;
}
module.exports = { FIELDS, MODES, MIN_OBJECTIVES, CLAIMS, lines, clean, validate };
