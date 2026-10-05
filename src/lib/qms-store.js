// Quality records persistence shared by the admin area and public intake (complaints/appeals from the contact form).
const { q } = require('../db');
const { caseDeadlines } = require('./qms');

async function addCaseEvent(caseId, actorName, event, note) {
  await q('INSERT INTO qms_case_events (case_id, actor_name, event, note) VALUES ($1,$2,$3,$4)', [caseId, String(actorName || '').slice(0, 150), event, String(note || '').slice(0, 5000)]);
}

/** Opens a complaint, appeal or feedback case with its service-level deadlines and a first timeline event. */
async function createCase(d, createdBy = null, actorName = '') {
  const dl = caseDeadlines(new Date());
  const { rows: [c] } = await q(`INSERT INTO qms_cases (case_no, kind, channel, complainant_name, complainant_email, subject_type, platform_id, cert_number, summary, ack_due, decision_due, original_decider_name, created_by)
    VALUES ('CMP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('qms_case_seq')::text, 4, '0'), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
  [d.kind, d.channel || 'web', String(d.complainant_name || '').slice(0, 200), String(d.complainant_email || '').slice(0, 255), d.subject_type || 'liv', d.platform_id || null,
    d.cert_number ? String(d.cert_number).slice(0, 30) : null, String(d.summary || '').slice(0, 10000), dl.ack_due, dl.decision_due, String(d.original_decider_name || '').slice(0, 150), createdBy]);
  await addCaseEvent(c.id, actorName || 'system', 'received', `Case opened via ${c.channel}.`);
  return c;
}
module.exports = { createCase, addCaseEvent };
