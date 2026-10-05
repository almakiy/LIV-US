// Quality records (docs/QMS-RECORDS.md): pure helpers for numbering, deadlines, workflow rules and exports.
const KINDS = { complaint: 'Complaint', appeal: 'Appeal', feedback: 'Feedback' };
const CASE_STATUS = ['received', 'acknowledged', 'investigating', 'decided', 'closed'];
const OUTCOMES = { upheld: 'Upheld', partially_upheld: 'Partially upheld', not_upheld: 'Not upheld', withdrawn: 'Withdrawn' };
const DOC_TYPES = { policy: 'Policy', procedure: 'Procedure', form: 'Form', standard: 'Standard', handbook: 'Handbook', plan: 'Plan' };
const ACTION_SOURCES = { internal_audit: 'Internal audit', complaint: 'Complaint', appeal: 'Appeal', partner_review: 'Partner review', management_review: 'Management review', external_audit: 'External audit', other: 'Other' };
const MEETING_KINDS = { management_review: 'Management review', internal_audit: 'Internal audit', impartiality_committee: 'Impartiality committee' };
const REVIEW_TYPES = { initial: 'Initial', periodic: 'Periodic', special: 'Special' };
const REVIEW_OUTCOMES = { satisfactory: 'Satisfactory', conditions: 'Satisfactory with conditions', suspend: 'Suspend accreditation', withdraw: 'Withdraw accreditation' };

// Service levels (defaults; publish them in the complaints and appeals procedure).
const ACK_BUSINESS_DAYS = 5;
const DECISION_DAYS = 30;

const iso = (d) => d.toISOString().slice(0, 10);
function addDays(date, n) { const d = new Date(date); d.setUTCDate(d.getUTCDate() + n); return d; }
function addBusinessDays(date, n) {
  const d = new Date(date); let left = n;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) left--; }
  return d;
}
/** Deadlines for a case received at `received` (Date). */
const caseDeadlines = (received = new Date()) => ({ ack_due: iso(addBusinessDays(received, ACK_BUSINESS_DAYS)), decision_due: iso(addDays(received, DECISION_DAYS)) });
const addMonthsISO = (dateStr, months) => { const d = new Date(`${dateStr}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + months); return iso(d); };
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase() && String(a || '').trim() !== '';
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

/**
 * Checks whether a case may be decided. Appeals must be decided by a reviewer independent of the handler and of the original decision-maker.
 * Returns an error string or null.
 */
function canDecide(c, { decision, outcome, reviewer_name }) {
  if (!['investigating', 'acknowledged'].includes(c.status)) return 'Only an acknowledged or investigated case can be decided.';
  if (!String(decision || '').trim()) return 'The decision text is required.';
  if (!OUTCOMES[outcome]) return 'Choose an outcome.';
  if (c.kind === 'appeal') {
    if (!String(reviewer_name || '').trim()) return 'An appeal needs an independent reviewer.';
    if (sameName(reviewer_name, c.handler_name) || sameName(reviewer_name, c.original_decider_name)) return 'The reviewer of an appeal must be independent of the handler and of the original decision-maker.';
  }
  return null;
}

/** Corrective action may only be closed with root cause, action, verified effectiveness, and a verifier. */
function canCloseAction(a, { verified_by_name, effectiveness_note }, allowSelfVerification) {
  if (!String(a.root_cause || '').trim()) return 'Record the root cause first.';
  if (!String(a.corrective_action || '').trim()) return 'Record the corrective action first.';
  if (!String(effectiveness_note || '').trim()) return 'Describe how effectiveness was verified.';
  if (!String(verified_by_name || '').trim()) return 'Name the person who verified the action.';
  if (!allowSelfVerification && sameName(verified_by_name, a.owner_name)) return 'The verifier must be different from the action owner.';
  return null;
}

/** Same person may not author and approve a controlled document unless self-approval is explicitly allowed (it is then recorded on the version). */
const approvalError = (authorId, approverId, allowSelf) => (!allowSelf && authorId && authorId === approverId ? 'A different person must approve this document.' : null);

/** CSV with RFC 4180 quoting and protection against spreadsheet formula injection. */
function toCsv(rows, cols) {
  const cell = (v) => {
    let s = v == null ? '' : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}

/** Starter outlines for the controlled documents an assessor typically expects. Headings only: the owner completes and approves them. */
const STARTER_DOCS = [
  ['LIV-POL-001', 'Impartiality policy', 'policy', ['Purpose and scope', 'Commitment to impartiality', 'Identification and review of threats to impartiality', 'Separation of curriculum design, training, examination and certification decisions', 'Impartiality committee', 'Declarations of interest', 'Review of this policy']],
  ['LIV-PRO-001', 'Document control procedure', 'procedure', ['Purpose and scope', 'Document numbering and types', 'Authoring, review and approval', 'Revision and obsolescence', 'Periodic review', 'Distribution and access']],
  ['LIV-PRO-002', 'Records control procedure', 'procedure', ['Purpose and scope', 'Records kept and owners', 'Retention periods', 'Protection and confidentiality', 'Disposal', 'Provision of records to assessors']],
  ['LIV-PRO-003', 'Complaints and appeals procedure', 'procedure', ['Purpose and scope', 'Who can complain or appeal', 'How to submit', 'Acknowledgement and decision deadlines', 'Independent review of appeals', 'Outcomes and notification', 'Escalation', 'Records']],
  ['LIV-PRO-004', 'Corrective action procedure', 'procedure', ['Purpose and scope', 'Sources of nonconformities', 'Containment and correction', 'Root-cause analysis', 'Corrective action and due dates', 'Verification of effectiveness', 'Closure']],
  ['LIV-PRO-005', 'Partner accreditation procedure', 'procedure', ['Purpose and scope', 'Application and eligibility', 'Documentary review of trainers, curricula and methods', 'Accreditation decision and conditions', 'Agreement with the partner', 'Public register', 'Suspension and withdrawal']],
  ['LIV-PRO-006', 'Partner surveillance procedure', 'procedure', ['Purpose and scope', 'Review frequency and triggers', 'Evidence reviewed', 'Findings and outcomes', 'Follow-up of conditions', 'Records']],
  ['LIV-PRO-007', 'Internal audit procedure', 'procedure', ['Purpose and scope', 'Audit programme and frequency', 'Auditor independence', 'Conducting and reporting', 'Nonconformities and follow-up']],
  ['LIV-PRO-008', 'Management review procedure', 'procedure', ['Purpose and scope', 'Frequency and participants', 'Review inputs', 'Review outputs and actions', 'Records']],
  ['LIV-POL-002', 'Data protection and retention policy', 'policy', ['Purpose and scope', 'Personal data held', 'Lawful basis and minimisation', 'Retention and deletion', 'Security measures', 'Data subject requests']],
  ['LIV-POL-003', 'Code of conduct for staff and reviewers', 'policy', ['Purpose and scope', 'Professional conduct', 'Confidentiality', 'Conflicts of interest', 'Reporting concerns']],
];
const starterBody = (title, headings) => `# ${title}\n\n> Starter outline. Complete, review and approve before use.\n\n${headings.map((h, i) => `## ${i + 1}. ${h}\n\n_To be completed._\n`).join('\n')}`;

module.exports = {
  KINDS, CASE_STATUS, OUTCOMES, DOC_TYPES, ACTION_SOURCES, MEETING_KINDS, REVIEW_TYPES, REVIEW_OUTCOMES, ACK_BUSINESS_DAYS, DECISION_DAYS,
  addDays, addBusinessDays, caseDeadlines, addMonthsISO, sameName, isoDate, canDecide, canCloseAction, approvalError, toCsv, STARTER_DOCS, starterBody, iso,
};
