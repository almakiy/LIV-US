// The partner application form (docs/PARTNER-AUTHORIZATION.md §3, §4; Batch F): fields, language rule and readiness.
// English is the only language for application data. Text is checked, never converted or transliterated; letters must be
// Latin script (accents such as in "José" are fine), digits and punctuation are free.
const hasNonLatin = (v) => [...String(v ?? '')].some((ch) => /\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch));

const MODES = { classroom: 'In person', live_online: 'Live online', self_paced: 'Self-paced online' };

// criterion: the authorization criterion the field supports (shown with the field); required: needed to submit.
const FIELDS = [
  { key: 'legal_name', label: 'Legal name of the organization', type: 'text', max: 200, required: true, criterion: 'C1' },
  { key: 'trading_name', label: 'Trading name (if different)', type: 'text', max: 200, criterion: 'C1' },
  { key: 'country', label: 'Country of registration', type: 'text', max: 100, required: true, criterion: 'C1' },
  { key: 'registration_number', label: 'Registration or license number', type: 'text', max: 100, criterion: 'C1' },
  { key: 'website', label: 'Website', type: 'url', max: 200, criterion: 'C1' },
  { key: 'representative_name', label: 'Authorized representative: full name', type: 'text', max: 200, required: true, criterion: 'C1' },
  { key: 'representative_title', label: 'Authorized representative: position', type: 'text', max: 200, criterion: 'C1' },
  { key: 'representative_email', label: 'Authorized representative: email', type: 'email', max: 255, required: true, criterion: 'C1' },
  { key: 'academic_lead', label: 'Academic lead: name, role and relevant experience', type: 'textarea', max: 2000, required: true, criterion: 'C2' },
  { key: 'domain_requested', label: 'Field and subjects you ask to be authorized for', type: 'textarea', max: 2000, required: true, criterion: 'C4', help: 'For example: workplace safety awareness; first aid. List each subject you plan to deliver.' },
  { key: 'delivery_modes', label: 'How you deliver training', type: 'checkboxes', options: MODES, required: true, criterion: 'C5' },
  { key: 'delivery_setting', label: 'Platform or training site, and equipment', type: 'textarea', max: 2000, required: true, criterion: 'C5' },
  { key: 'trainers', label: 'Trainers: names, qualifications and experience', type: 'textarea', max: 3000, required: true, criterion: 'C3', help: 'Upload each trainer\'s CV and certificates as C3 evidence.' },
  { key: 'completion_rules', label: 'How you decide a learner has completed a course', type: 'textarea', max: 2000, required: true, criterion: 'C6' },
  { key: 'learner_protection', label: 'Learner protection: enrollment terms, fees and refunds, complaints', type: 'textarea', max: 2000, criterion: 'C7' },
  { key: 'records', label: 'Records: how attendance and completion are kept, retention and access', type: 'textarea', max: 2000, criterion: 'C8' },
  { key: 'interests', label: 'Declared interests (ownership, employment, referral or other links with LIV; write "None" if there are none)', type: 'textarea', max: 1000, required: true, criterion: 'C9' },
];
const REQUIRED_EVIDENCE = ['C1', 'C3'];

// The application is filled in stages (docs/PARTNER-AUTHORIZATION.md §4.1). Each stage saves on its own; only submission checks completeness.
const STAGES = [
  { key: 'org', title: 'Organization', minutes: 5, hint: 'Who you are and who speaks for the organization.', fields: ['legal_name', 'trading_name', 'country', 'registration_number', 'website', 'representative_name', 'representative_title', 'representative_email'] },
  { key: 'training', title: 'Training', minutes: 10, hint: 'What you teach, how, and who teaches it.', fields: ['academic_lead', 'domain_requested', 'delivery_modes', 'delivery_setting', 'trainers', 'completion_rules'] },
  { key: 'policies', title: 'Policies and declarations', minutes: 5, hint: 'How learners and records are protected, and any interests to declare.', fields: ['learner_protection', 'records', 'interests'] },
  { key: 'documents', title: 'Documents', minutes: 5, hint: 'Supporting files for each criterion. Legal and trainer documents are needed.', fields: [] },
  { key: 'review', title: 'Review and submit', minutes: 2, hint: 'Check what is missing, pay the application fee and submit.', fields: [] },
];
const stageKeys = (stage) => (STAGES.find((s) => s.key === stage) || {}).fields || [];
const CRITERIA_TITLES = {
  C1: 'Legal entity and accountability', C2: 'Training management', C3: 'Trainer eligibility', C4: 'Course content', C5: 'Delivery',
  C6: 'Completion and learning assessment', C7: 'Learner protection', C8: 'Records and data', C9: 'Integrity and marketing',
};

/** Reads the form body into the stored shape: trimmed strings and a list of delivery modes. Unknown keys are dropped. */
function clean(body = {}, only = null) {
  const out = {};
  for (const f of FIELDS) {
    if (only && !only.includes(f.key)) continue;
    if (f.type === 'checkboxes') out[f.key] = [].concat(body[f.key] || []).filter((m) => MODES[m]);
    else out[f.key] = String(body[f.key] ?? '').trim().slice(0, f.max);
  }
  return out;
}

/** Errors for a draft save (language and format only) or a submission (also completeness). evidence: criteria that have a file. */
function validate(form, { submit = false, evidence = [], only = null } = {}) {
  const errors = [];
  for (const f of FIELDS) {
    if (only && !only.includes(f.key)) continue;
    const v = form[f.key];
    if (f.type === 'checkboxes') { if (submit && f.required && !v?.length) errors.push({ field: f.key, message: `${f.label}: choose at least one.` }); continue; }
    if (!v) { if (submit && f.required) errors.push({ field: f.key, message: `${f.label}: this is required.` }); continue; }
    if (hasNonLatin(v)) errors.push({ field: f.key, message: `${f.label}: write in English (Latin letters). Names keep their own spelling in Latin letters; the platform does not translate or convert them.` });
    else if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) errors.push({ field: f.key, message: `${f.label}: enter a valid email address.` });
    else if (f.type === 'url' && !/^https?:\/\/\S+\.\S+$/i.test(v)) errors.push({ field: f.key, message: `${f.label}: enter a full address starting with http:// or https://.` });
  }
  if (submit && !only) for (const c of REQUIRED_EVIDENCE) if (!evidence.includes(c)) errors.push({ field: `evidence_${c}`, message: `Upload at least one ${c} (${CRITERIA_TITLES[c]}) document before submitting.` });
  return errors;
}

/** Readiness for the applicant: what is still missing. It describes completeness only, never a likelihood of acceptance. */
function readiness(form, evidence) {
  return validate(form, { submit: true, evidence }).filter((e) => !/write in English|valid email|full address/.test(e.message));
}

/** Which stages are complete: every required field of the stage is filled (and, for documents, C1 and C3 are uploaded). */
function stageStatus(form, evidence = []) {
  const done = {};
  for (const st of STAGES) {
    if (st.key === 'documents') done[st.key] = REQUIRED_EVIDENCE.every((c) => evidence.includes(c));
    else if (st.key === 'review') done[st.key] = false;
    else done[st.key] = validate(form, { submit: true, only: st.fields }).length === 0;
  }
  return done;
}

module.exports = { STAGES, stageKeys, stageStatus, FIELDS, MODES, CRITERIA_TITLES, REQUIRED_EVIDENCE, hasNonLatin, clean, validate, readiness };
