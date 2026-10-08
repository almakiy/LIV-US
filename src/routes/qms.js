// Quality records for recognition readiness (docs/QMS-RECORDS.md). Super admin only.
const express = require('express');
const archiver = require('archiver');
const cfg = require('../config');
const { q, tx } = require('../db');
const { audit } = require('../lib/audit');
const { renderMarkdown } = require('../lib/content');
const qms = require('../lib/qms');
const { createCase, addCaseEvent } = require('../lib/qms-store');
const { requireSuper, wrap, flash } = require('../lib/guards');

const r = express.Router();
r.use(requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const who = (req) => req.user.full_name || req.user.email;
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const back = (req, res, to, type, text) => { if (text) flash(req, type, text); res.redirect(to); };
const idParam = (req, res, next) => (UUID_RE.test(req.params.id) ? next() : next('route'));

// ---------- Readiness dashboard ----------
r.get('/', wrap(async (req, res) => {
  const year = new Date().getUTCFullYear();
  const [docs, cases, acts, rev, decl, meet, chain] = await Promise.all([
    q(`SELECT count(*) FILTER (WHERE status='approved')::int AS approved, count(*) FILTER (WHERE status='draft')::int AS draft,
        count(*) FILTER (WHERE status='approved' AND next_review_at < CURRENT_DATE)::int AS overdue FROM qms_documents`),
    q(`SELECT count(*) FILTER (WHERE status <> 'closed')::int AS open,
        count(*) FILTER (WHERE status='received' AND ack_due < CURRENT_DATE)::int AS ack_overdue,
        count(*) FILTER (WHERE status IN ('received','acknowledged','investigating') AND decision_due < CURRENT_DATE)::int AS decision_overdue, count(*)::int AS total FROM qms_cases`),
    q(`SELECT count(*) FILTER (WHERE status <> 'closed')::int AS open, count(*) FILTER (WHERE status <> 'closed' AND due_date < CURRENT_DATE)::int AS overdue, count(*)::int AS total FROM qms_actions`),
    q(`SELECT count(*)::int AS partners,
        count(*) FILTER (WHERE lr.next_due IS NULL OR lr.next_due < CURRENT_DATE)::int AS due
       FROM platforms p LEFT JOIN LATERAL (SELECT next_review_due AS next_due FROM qms_partner_reviews x WHERE x.platform_id = p.id ORDER BY reviewed_on DESC, created_at DESC LIMIT 1) lr ON true
       WHERE p.accreditation_status = 'active'`),
    q(`SELECT (SELECT count(*)::int FROM users WHERE role='super_admin') AS staff, (SELECT count(*)::int FROM qms_declarations WHERE year = $1) AS declared`, [year]),
    q(`SELECT kind, max(held_on)::text AS last FROM qms_meetings GROUP BY kind`),
    q('SELECT * FROM audit_verify_chain()'),
  ]);
  const last = Object.fromEntries(meet.rows.map((m) => [m.kind, m.last]));
  const recent = (d) => d && new Date(d) > new Date(Date.now() - 366 * 864e5);
  const items = [
    { name: 'Controlled documents', ok: docs.rows[0].approved > 0 && docs.rows[0].overdue === 0, detail: `${docs.rows[0].approved} approved, ${docs.rows[0].draft} draft, ${docs.rows[0].overdue} overdue for review`, href: '/admin/qms/documents' },
    { name: 'Complaints and appeals', ok: cases.rows[0].ack_overdue === 0 && cases.rows[0].decision_overdue === 0, detail: `${cases.rows[0].open} open of ${cases.rows[0].total}; ${cases.rows[0].ack_overdue} acknowledgement and ${cases.rows[0].decision_overdue} decision deadlines missed`, href: '/admin/qms/cases' },
    { name: 'Corrective actions', ok: acts.rows[0].overdue === 0, detail: `${acts.rows[0].open} open of ${acts.rows[0].total}; ${acts.rows[0].overdue} overdue`, href: '/admin/qms/actions' },
    { name: 'Partner surveillance', ok: rev.rows[0].due === 0, detail: `${rev.rows[0].partners} active partners; ${rev.rows[0].due} without a current review`, href: '/admin/qms/partners' },
    { name: `Impartiality declarations ${year}`, ok: decl.rows[0].staff > 0 && decl.rows[0].declared >= decl.rows[0].staff, detail: `${decl.rows[0].declared} of ${decl.rows[0].staff} staff declared`, href: '/admin/qms/declarations' },
    { name: 'Management review (last 12 months)', ok: recent(last.management_review), detail: last.management_review ? `Last held ${last.management_review}` : 'Never held', href: '/admin/qms/meetings' },
    { name: 'Internal audit (last 12 months)', ok: recent(last.internal_audit), detail: last.internal_audit ? `Last held ${last.internal_audit}` : 'Never held', href: '/admin/qms/meetings' },
    { name: 'Impartiality committee (last 12 months)', ok: recent(last.impartiality_committee), detail: last.impartiality_committee ? `Last held ${last.impartiality_committee}` : 'Never held', href: '/admin/qms/meetings' },
    { name: 'Audit log integrity', ok: chain.rows[0].broken_id === null, detail: chain.rows[0].broken_id === null ? `${chain.rows[0].checked} chained entries verified` : `Chain broken at entry ${chain.rows[0].broken_id}`, href: '/admin/audit' },
  ];
  res.render('admin/qms/index', { title: 'Compliance and quality records', items, allowSelf: cfg.qmsAllowSelfApproval });
}));

// ---------- Assessor pack (ZIP of registers) ----------
r.get('/export.zip', wrap(async (req, res) => {
  const tables = [
    ['documents', 'SELECT doc_no, title, doc_type, owner_name, status, current_version, review_months, next_review_at, created_at, updated_at FROM qms_documents ORDER BY doc_no'],
    ['document_versions', 'SELECT d.doc_no, v.version, v.status, v.change_summary, v.author_name, v.approver_name, v.self_approved, v.approved_at, v.effective_date FROM qms_document_versions v JOIN qms_documents d ON d.id = v.document_id ORDER BY d.doc_no, v.version'],
    ['cases', 'SELECT case_no, kind, received_at, channel, complainant_name, complainant_email, subject_type, cert_number, summary, status, ack_due, ack_at, decision_due, handler_name, original_decider_name, reviewer_name, outcome, decision, decided_at, closed_at FROM qms_cases ORDER BY received_at'],
    ['case_events', 'SELECT c.case_no, e.at, e.actor_name, e.event, e.note FROM qms_case_events e JOIN qms_cases c ON c.id = e.case_id ORDER BY e.id'],
    ['corrective_actions', 'SELECT ref_no, source, source_ref, description, root_cause, correction, corrective_action, owner_name, due_date, status, verified_by_name, verified_at, effectiveness_note, closed_at, created_at FROM qms_actions ORDER BY created_at'],
    ['partner_reviews', 'SELECT p.company_name, v.review_type, v.reviewed_on, v.reviewer_name, v.scope, v.findings, v.outcome, v.next_review_due FROM qms_partner_reviews v JOIN platforms p ON p.id = v.platform_id ORDER BY v.reviewed_on'],
    ['declarations', 'SELECT u.full_name, u.email, d.year, d.has_conflict, d.details, d.declared_at FROM qms_declarations d JOIN users u ON u.id = d.user_id ORDER BY d.year, u.full_name'],
    ['meetings', 'SELECT kind, held_on, participants, inputs, decisions, next_due FROM qms_meetings ORDER BY held_on'],
    ['partner_agreements', 'SELECT version, title, status, created_at, activated_at FROM agreements ORDER BY version'],
    ['agreement_acceptances', 'SELECT p.company_name, a.version, c.accepted_name, c.accepted_at FROM agreement_acceptances c JOIN platforms p ON p.id = c.platform_id JOIN agreements a ON a.id = c.agreement_id ORDER BY c.accepted_at'],
    ['audit_log', 'SELECT id, created_at, actor_label, action, target, metadata, prev_hash, entry_hash FROM audit_logs ORDER BY id'],
  ];
  const chain = (await q('SELECT * FROM audit_verify_chain()')).rows[0];
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="liv-quality-records-${qms.iso(new Date())}.zip"` });
  const zip = archiver('zip', { zlib: { level: 9 } });
  zip.on('error', (e) => { console.error(e); res.destroy(e); });
  zip.pipe(res);
  for (const [name, sql] of tables) {
    const { rows, fields } = await q(sql);
    zip.append(qms.toCsv(rows, fields.map((f) => f.name)), { name: `${name}.csv` });
  }
  const { rows: docs } = await q(`SELECT d.doc_no, d.title, v.version, v.body_md FROM qms_documents d JOIN qms_document_versions v ON v.document_id = d.id AND v.version = d.current_version WHERE d.status = 'approved'`);
  docs.forEach((d) => zip.append(`${d.body_md}\n`, { name: `documents/${d.doc_no}-v${d.version}.md` }));
  zip.append(`LIV quality records export\nGenerated: ${new Date().toISOString()}\nGenerated by: ${who(req)}\nAudit log chain: ${chain.broken_id === null ? `verified, ${chain.checked} chained entries` : `BROKEN at entry ${chain.broken_id}`}\n\nThese are working records; the audit log hashes allow an assessor to verify that entries were not altered.\n`, { name: 'README.txt' });
  await audit({ user: req.user, action: 'qms.export', target: 'quality records' });
  await zip.finalize();
}));

// ---------- Controlled documents ----------
r.get('/documents', wrap(async (req, res) => {
  const { rows } = await q(`SELECT *, (status='approved' AND next_review_at < CURRENT_DATE) AS overdue FROM qms_documents ORDER BY doc_no`);
  res.render('admin/qms/documents', { title: 'Controlled documents', rows, DOC_TYPES: qms.DOC_TYPES });
}));
r.post('/documents/starter', wrap(async (req, res) => {
  let added = 0;
  await tx(async (c) => {
    for (const [no, title, type, heads] of qms.STARTER_DOCS) {
      const { rows: [d] } = await c.query(`INSERT INTO qms_documents (doc_no, title, doc_type, owner_name, created_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (doc_no) DO NOTHING RETURNING id`, [no, title, type, who(req), req.user.id]);
      if (d) { added++; await c.query(`INSERT INTO qms_document_versions (document_id, version, body_md, change_summary, author_id, author_name) VALUES ($1,1,$2,'Starter outline',$3,$4)`, [d.id, qms.starterBody(title, heads), req.user.id, who(req)]); }
    }
  });
  await audit({ user: req.user, action: 'qms.document.starter', target: `${added} documents` });
  back(req, res, '/admin/qms/documents', 'success', added ? `${added} starter documents created as drafts. Complete and approve them.` : 'The starter set already exists.');
}));
r.get('/documents/new', (req, res) => res.render('admin/qms/document-new', { title: 'New document', DOC_TYPES: qms.DOC_TYPES, error: null, f: { owner_name: who(req), review_months: 12 } }));
r.post('/documents', wrap(async (req, res) => {
  const f = { doc_no: str(req.body.doc_no, 30).toUpperCase(), title: str(req.body.title, 200), doc_type: req.body.doc_type, owner_name: str(req.body.owner_name, 150), review_months: Math.min(60, Math.max(1, parseInt(req.body.review_months, 10) || 12)) };
  const fail = (m) => res.status(400).render('admin/qms/document-new', { title: 'New document', DOC_TYPES: qms.DOC_TYPES, error: m, f });
  if (!/^[A-Z0-9][A-Z0-9-]{2,29}$/.test(f.doc_no)) return fail('Document number: letters, digits and dashes, e.g. LIV-PRO-009.');
  if (!f.title) return fail('A title is required.');
  if (!qms.DOC_TYPES[f.doc_type]) return fail('Choose a document type.');
  const { rows: ex } = await q('SELECT 1 FROM qms_documents WHERE doc_no = $1', [f.doc_no]);
  if (ex.length) return fail('That document number already exists.');
  const id = await tx(async (c) => {
    const { rows: [d] } = await c.query(`INSERT INTO qms_documents (doc_no, title, doc_type, owner_name, review_months, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [f.doc_no, f.title, f.doc_type, f.owner_name, f.review_months, req.user.id]);
    await c.query(`INSERT INTO qms_document_versions (document_id, version, body_md, change_summary, author_id, author_name) VALUES ($1,1,$2,'Created',$3,$4)`, [d.id, `# ${f.title}\n`, req.user.id, who(req)]);
    return d.id;
  });
  await audit({ user: req.user, action: 'qms.document.create', target: f.doc_no });
  res.redirect(`/admin/qms/documents/${id}`);
}));
r.get('/documents/:id', idParam, wrap(async (req, res, next) => {
  const { rows: [d] } = await q('SELECT * FROM qms_documents WHERE id = $1', [req.params.id]);
  if (!d) return next();
  const { rows: versions } = await q('SELECT * FROM qms_document_versions WHERE document_id = $1 ORDER BY version DESC', [d.id]);
  const draft = versions.find((v) => v.status === 'draft');
  const shown = draft || versions[0];
  res.render('admin/qms/document', { title: `${d.doc_no} ${d.title}`, d, versions, draft, shown, html: renderMarkdown(shown.body_md), DOC_TYPES: qms.DOC_TYPES, allowSelf: cfg.qmsAllowSelfApproval });
}));
r.post('/documents/:id/save', idParam, wrap(async (req, res, next) => {
  const { rows: [v] } = await q(`SELECT v.id, d.doc_no FROM qms_document_versions v JOIN qms_documents d ON d.id = v.document_id WHERE v.document_id = $1 AND v.status = 'draft'`, [req.params.id]);
  if (!v) return back(req, res, `/admin/qms/documents/${req.params.id}`, 'error', 'Only a draft can be edited. Start a new revision first.');
  await q('UPDATE qms_document_versions SET body_md = $1, change_summary = $2 WHERE id = $3', [String(req.body.body_md || '').slice(0, 200000), str(req.body.change_summary, 300), v.id]);
  await q('UPDATE qms_documents SET title = $1, owner_name = $2, review_months = $3, updated_at = now() WHERE id = $4', [str(req.body.title, 200) || 'Untitled', str(req.body.owner_name, 150), Math.min(60, Math.max(1, parseInt(req.body.review_months, 10) || 12)), req.params.id]);
  await audit({ user: req.user, action: 'qms.document.save', target: v.doc_no });
  back(req, res, `/admin/qms/documents/${req.params.id}`, 'success', 'Draft saved.');
}));
r.post('/documents/:id/approve', idParam, wrap(async (req, res) => {
  const { rows: [v] } = await q(`SELECT v.*, d.doc_no, d.review_months FROM qms_document_versions v JOIN qms_documents d ON d.id = v.document_id WHERE v.document_id = $1 AND v.status = 'draft'`, [req.params.id]);
  if (!v) return back(req, res, `/admin/qms/documents/${req.params.id}`, 'error', 'There is no draft to approve.');
  if (!v.body_md.trim() || /_To be completed\._/.test(v.body_md)) return back(req, res, `/admin/qms/documents/${req.params.id}`, 'error', 'Complete the document before approving it (placeholders remain).');
  const err = qms.approvalError(v.author_id, req.user.id, cfg.qmsAllowSelfApproval);
  if (err) return back(req, res, `/admin/qms/documents/${req.params.id}`, 'error', err);
  const self = v.author_id === req.user.id; const today = qms.iso(new Date());
  await tx(async (c) => {
    await c.query(`UPDATE qms_document_versions SET status = 'superseded' WHERE document_id = $1 AND status = 'approved'`, [req.params.id]);
    await c.query(`UPDATE qms_document_versions SET status = 'approved', approver_id = $1, approver_name = $2, self_approved = $3, approved_at = now(), effective_date = $4 WHERE id = $5`, [req.user.id, who(req), self, today, v.id]);
    await c.query(`UPDATE qms_documents SET status = 'approved', current_version = $1, next_review_at = $2, updated_at = now() WHERE id = $3`, [v.version, qms.addMonthsISO(today, v.review_months), req.params.id]);
  });
  await audit({ user: req.user, action: 'qms.document.approve', target: `${v.doc_no} v${v.version}`, metadata: { self_approved: self } });
  back(req, res, `/admin/qms/documents/${req.params.id}`, 'success', `Version ${v.version} approved${self ? ' (self-approved; recorded on the version)' : ''}.`);
}));
r.post('/documents/:id/revise', idParam, wrap(async (req, res) => {
  const { rows: [d] } = await q('SELECT * FROM qms_documents WHERE id = $1', [req.params.id]);
  if (!d) return res.redirect('/admin/qms/documents');
  const { rows: [open] } = await q(`SELECT 1 FROM qms_document_versions WHERE document_id = $1 AND status = 'draft'`, [d.id]);
  if (open) return back(req, res, `/admin/qms/documents/${d.id}`, 'error', 'A draft revision already exists.');
  const { rows: [cur] } = await q('SELECT body_md, version FROM qms_document_versions WHERE document_id = $1 ORDER BY version DESC LIMIT 1', [d.id]);
  await q(`INSERT INTO qms_document_versions (document_id, version, body_md, change_summary, author_id, author_name) VALUES ($1,$2,$3,'Revision',$4,$5)`, [d.id, cur.version + 1, cur.body_md, req.user.id, who(req)]);
  await q(`UPDATE qms_documents SET status = CASE WHEN status = 'obsolete' THEN 'draft' ELSE status END, updated_at = now() WHERE id = $1`, [d.id]);
  await audit({ user: req.user, action: 'qms.document.revise', target: `${d.doc_no} v${cur.version + 1}` });
  back(req, res, `/admin/qms/documents/${d.id}`, 'success', `Draft version ${cur.version + 1} started.`);
}));
r.post('/documents/:id/obsolete', idParam, wrap(async (req, res) => {
  const { rows: [d] } = await q(`UPDATE qms_documents SET status = 'obsolete', updated_at = now() WHERE id = $1 RETURNING doc_no`, [req.params.id]);
  if (d) await audit({ user: req.user, action: 'qms.document.obsolete', target: d.doc_no });
  back(req, res, `/admin/qms/documents/${req.params.id}`, 'success', 'Document marked obsolete.');
}));

// ---------- Complaints, appeals and feedback ----------
r.get('/cases', wrap(async (req, res) => {
  const { rows } = await q(`SELECT *, (status = 'received' AND ack_due < CURRENT_DATE) AS ack_late, (status <> 'closed' AND status <> 'decided' AND decision_due < CURRENT_DATE) AS decision_late FROM qms_cases ORDER BY received_at DESC LIMIT 300`);
  res.render('admin/qms/cases', { title: 'Complaints and appeals', rows, KINDS: qms.KINDS });
}));
r.get('/cases/new', wrap(async (req, res) => {
  const { rows: partners } = await q('SELECT id, company_name FROM platforms ORDER BY company_name');
  res.render('admin/qms/case-new', { title: 'Log a case', partners, KINDS: qms.KINDS, error: null, f: { kind: 'complaint', channel: 'email', subject_type: 'liv' } });
}));
r.post('/cases', wrap(async (req, res) => {
  const f = { kind: req.body.kind, channel: req.body.channel, complainant_name: str(req.body.complainant_name, 200), complainant_email: str(req.body.complainant_email, 255), subject_type: req.body.subject_type,
    platform_id: UUID_RE.test(req.body.platform_id || '') ? req.body.platform_id : null, cert_number: str(req.body.cert_number, 30) || null, summary: str(req.body.summary, 10000), original_decider_name: str(req.body.original_decider_name, 150) };
  const { rows: partners } = await q('SELECT id, company_name FROM platforms ORDER BY company_name');
  const fail = (m) => res.status(400).render('admin/qms/case-new', { title: 'Log a case', partners, KINDS: qms.KINDS, error: m, f });
  if (!qms.KINDS[f.kind]) return fail('Choose the case type.');
  if (!['web', 'email', 'phone', 'partner', 'other'].includes(f.channel)) f.channel = 'other';
  if (!['partner', 'certificate', 'liv', 'other'].includes(f.subject_type)) f.subject_type = 'other';
  if (f.summary.length < 10) return fail('Describe the case (at least 10 characters).');
  if (f.kind === 'appeal' && !f.original_decider_name) return fail('For an appeal, name the person who made the original decision (needed to guarantee an independent review).');
  const c = await createCase(f, req.user.id, who(req));
  await audit({ user: req.user, action: 'qms.case.open', target: c.case_no });
  res.redirect(`/admin/qms/cases/${c.id}`);
}));
r.get('/cases/:id', idParam, wrap(async (req, res, next) => {
  const { rows: [c] } = await q(`SELECT c.*, p.company_name FROM qms_cases c LEFT JOIN platforms p ON p.id = c.platform_id WHERE c.id = $1`, [req.params.id]);
  if (!c) return next();
  const { rows: events } = await q('SELECT * FROM qms_case_events WHERE case_id = $1 ORDER BY id', [c.id]);
  res.render('admin/qms/case', { title: c.case_no, c, events, KINDS: qms.KINDS, OUTCOMES: qms.OUTCOMES });
}));
const caseStep = (event, nextStatus, from, extraSql = '') => wrap(async (req, res) => {
  const { rows: [c] } = await q('SELECT * FROM qms_cases WHERE id = $1', [req.params.id]);
  if (!c) return res.redirect('/admin/qms/cases');
  if (!from.includes(c.status)) return back(req, res, `/admin/qms/cases/${c.id}`, 'error', `Not possible while the case is "${c.status}".`);
  await q(`UPDATE qms_cases SET status = $1, updated_at = now() ${extraSql} WHERE id = $2`, [nextStatus, c.id]);
  await addCaseEvent(c.id, who(req), event, str(req.body.note, 5000));
  await audit({ user: req.user, action: `qms.case.${event}`, target: c.case_no });
  back(req, res, `/admin/qms/cases/${c.id}`, 'success', 'Recorded.');
});
r.post('/cases/:id/acknowledge', idParam, caseStep('acknowledged', 'acknowledged', ['received'], ', ack_at = now()'));
r.post('/cases/:id/investigate', idParam, wrap(async (req, res) => {
  const { rows: [c] } = await q('SELECT * FROM qms_cases WHERE id = $1', [req.params.id]);
  if (!c) return res.redirect('/admin/qms/cases');
  if (!['received', 'acknowledged', 'investigating'].includes(c.status)) return back(req, res, `/admin/qms/cases/${c.id}`, 'error', `Not possible while the case is "${c.status}".`);
  const handler = str(req.body.handler_name, 150) || who(req);
  await q(`UPDATE qms_cases SET status = 'investigating', handler_name = $1, updated_at = now(), ack_at = COALESCE(ack_at, now()) WHERE id = $2`, [handler, c.id]);
  await addCaseEvent(c.id, who(req), 'investigating', `Handler: ${handler}. ${str(req.body.note, 5000)}`);
  await audit({ user: req.user, action: 'qms.case.investigate', target: c.case_no });
  back(req, res, `/admin/qms/cases/${c.id}`, 'success', 'Investigation recorded.');
}));
r.post('/cases/:id/decide', idParam, wrap(async (req, res) => {
  const { rows: [c] } = await q('SELECT * FROM qms_cases WHERE id = $1', [req.params.id]);
  if (!c) return res.redirect('/admin/qms/cases');
  const d = { decision: str(req.body.decision, 10000), outcome: req.body.outcome, reviewer_name: str(req.body.reviewer_name, 150) };
  const err = qms.canDecide(c, d);
  if (err) return back(req, res, `/admin/qms/cases/${c.id}`, 'error', err);
  await q(`UPDATE qms_cases SET status = 'decided', decision = $1, outcome = $2, reviewer_name = $3, decided_at = now(), updated_at = now() WHERE id = $4`, [d.decision, d.outcome, d.reviewer_name, c.id]);
  await addCaseEvent(c.id, who(req), 'decided', `${qms.OUTCOMES[d.outcome]}${d.reviewer_name ? ` (independent reviewer: ${d.reviewer_name})` : ''}. ${d.decision}`);
  await audit({ user: req.user, action: 'qms.case.decide', target: c.case_no, metadata: { outcome: d.outcome } });
  back(req, res, `/admin/qms/cases/${c.id}`, 'success', 'Decision recorded.');
}));
r.post('/cases/:id/close', idParam, caseStep('closed', 'closed', ['decided'], ', closed_at = now()'));

// ---------- Corrective actions ----------
r.get('/actions', wrap(async (req, res) => {
  const { rows } = await q(`SELECT *, (status <> 'closed' AND due_date < CURRENT_DATE) AS overdue FROM qms_actions ORDER BY (status = 'closed'), due_date NULLS LAST, created_at DESC LIMIT 300`);
  res.render('admin/qms/actions', { title: 'Corrective actions', rows, SOURCES: qms.ACTION_SOURCES });
}));
r.get('/actions/new', (req, res) => res.render('admin/qms/action-new', { title: 'New nonconformity', SOURCES: qms.ACTION_SOURCES, error: null, f: { source: 'internal_audit', owner_name: who(req) } }));
r.post('/actions', wrap(async (req, res) => {
  const f = { source: req.body.source, source_ref: str(req.body.source_ref, 60), description: str(req.body.description, 10000), owner_name: str(req.body.owner_name, 150), due_date: qms.isoDate(req.body.due_date) };
  const fail = (m) => res.status(400).render('admin/qms/action-new', { title: 'New nonconformity', SOURCES: qms.ACTION_SOURCES, error: m, f });
  if (!qms.ACTION_SOURCES[f.source]) return fail('Choose the source.');
  if (f.description.length < 10) return fail('Describe the nonconformity (at least 10 characters).');
  const { rows: [a] } = await q(`INSERT INTO qms_actions (ref_no, source, source_ref, description, owner_name, due_date, created_by)
    VALUES ('CAR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('qms_action_seq')::text, 4, '0'), $1,$2,$3,$4,$5,$6) RETURNING id, ref_no`, [f.source, f.source_ref, f.description, f.owner_name, f.due_date, req.user.id]);
  await audit({ user: req.user, action: 'qms.action.open', target: a.ref_no });
  res.redirect(`/admin/qms/actions/${a.id}`);
}));
r.get('/actions/:id', idParam, wrap(async (req, res, next) => {
  const { rows: [a] } = await q('SELECT * FROM qms_actions WHERE id = $1', [req.params.id]);
  if (!a) return next();
  res.render('admin/qms/action', { title: a.ref_no, a, SOURCES: qms.ACTION_SOURCES, allowSelf: cfg.qmsAllowSelfApproval });
}));
r.post('/actions/:id/update', idParam, wrap(async (req, res) => {
  const { rows: [a] } = await q('SELECT * FROM qms_actions WHERE id = $1', [req.params.id]);
  if (!a || a.status === 'closed') return back(req, res, '/admin/qms/actions', 'error', 'This action is closed.');
  const status = req.body.status === 'awaiting_verification' ? 'awaiting_verification' : 'in_progress';
  await q(`UPDATE qms_actions SET root_cause=$1, correction=$2, corrective_action=$3, owner_name=$4, due_date=$5, status=$6, updated_at=now() WHERE id=$7`,
    [str(req.body.root_cause, 10000), str(req.body.correction, 10000), str(req.body.corrective_action, 10000), str(req.body.owner_name, 150), qms.isoDate(req.body.due_date), status, a.id]);
  await audit({ user: req.user, action: 'qms.action.update', target: a.ref_no });
  back(req, res, `/admin/qms/actions/${a.id}`, 'success', 'Saved.');
}));
r.post('/actions/:id/close', idParam, wrap(async (req, res) => {
  const { rows: [a] } = await q('SELECT * FROM qms_actions WHERE id = $1', [req.params.id]);
  if (!a || a.status === 'closed') return back(req, res, '/admin/qms/actions', 'error', 'This action is already closed.');
  const d = { verified_by_name: str(req.body.verified_by_name, 150), effectiveness_note: str(req.body.effectiveness_note, 10000) };
  const err = qms.canCloseAction(a, d, cfg.qmsAllowSelfApproval);
  if (err) return back(req, res, `/admin/qms/actions/${a.id}`, 'error', err);
  await q(`UPDATE qms_actions SET status='closed', verified_by_name=$1, effectiveness_note=$2, verified_at=now(), closed_at=now(), updated_at=now() WHERE id=$3`, [d.verified_by_name, d.effectiveness_note, a.id]);
  await audit({ user: req.user, action: 'qms.action.close', target: a.ref_no });
  back(req, res, `/admin/qms/actions/${a.id}`, 'success', 'Action closed with verified effectiveness.');
}));

// ---------- Partner surveillance ----------
r.get('/partners', wrap(async (req, res) => {
  const { rows } = await q(`SELECT p.id, p.company_name, p.accreditation_status, lr.reviewed_on::text AS last_review, lr.outcome, lr.next_review_due::text AS next_due,
      (p.accreditation_status = 'active' AND (lr.next_review_due IS NULL OR lr.next_review_due < CURRENT_DATE)) AS due
    FROM platforms p LEFT JOIN LATERAL (SELECT * FROM qms_partner_reviews x WHERE x.platform_id = p.id ORDER BY reviewed_on DESC, created_at DESC LIMIT 1) lr ON true ORDER BY due DESC, p.company_name`);
  res.render('admin/qms/partners', { title: 'Partner surveillance', rows, OUTCOMES: qms.REVIEW_OUTCOMES });
}));
r.get('/partners/:id', idParam, wrap(async (req, res, next) => {
  const { rows: [p] } = await q('SELECT id, company_name, accreditation_status FROM platforms WHERE id = $1', [req.params.id]);
  if (!p) return next();
  const { rows: reviews } = await q('SELECT * FROM qms_partner_reviews WHERE platform_id = $1 ORDER BY reviewed_on DESC, created_at DESC', [p.id]);
  res.render('admin/qms/partner', { title: `Surveillance: ${p.company_name}`, p, reviews, TYPES: qms.REVIEW_TYPES, OUTCOMES: qms.REVIEW_OUTCOMES, error: null, f: { reviewer_name: who(req), reviewed_on: qms.iso(new Date()), next_review_due: qms.addMonthsISO(qms.iso(new Date()), 12) } });
}));
r.post('/partners/:id/reviews', idParam, wrap(async (req, res, next) => {
  const { rows: [p] } = await q('SELECT id, company_name FROM platforms WHERE id = $1', [req.params.id]);
  if (!p) return next();
  const f = { review_type: req.body.review_type, reviewed_on: qms.isoDate(req.body.reviewed_on), reviewer_name: str(req.body.reviewer_name, 150), scope: str(req.body.scope, 5000), findings: str(req.body.findings, 10000), outcome: req.body.outcome, next_review_due: qms.isoDate(req.body.next_review_due) };
  const err = !qms.REVIEW_TYPES[f.review_type] ? 'Choose the review type.' : !f.reviewed_on ? 'Enter the review date.' : !f.reviewer_name ? 'Name the reviewer.' : !qms.REVIEW_OUTCOMES[f.outcome] ? 'Choose the outcome.' : !f.next_review_due ? 'Set the next review due date.' : f.next_review_due <= f.reviewed_on ? 'The next review must be after this one.' : null;
  if (err) {
    const { rows: reviews } = await q('SELECT * FROM qms_partner_reviews WHERE platform_id = $1 ORDER BY reviewed_on DESC', [p.id]);
    return res.status(400).render('admin/qms/partner', { title: `Surveillance: ${p.company_name}`, p, reviews, TYPES: qms.REVIEW_TYPES, OUTCOMES: qms.REVIEW_OUTCOMES, error: err, f });
  }
  await q(`INSERT INTO qms_partner_reviews (platform_id, review_type, reviewed_on, reviewer_name, scope, findings, outcome, next_review_due, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [p.id, f.review_type, f.reviewed_on, f.reviewer_name, f.scope, f.findings, f.outcome, f.next_review_due, req.user.id]);
  await audit({ user: req.user, platformId: p.id, action: 'qms.partner.review', target: p.company_name, metadata: { outcome: f.outcome } });
  back(req, res, `/admin/qms/partners/${p.id}`, 'success', f.outcome === 'suspend' || f.outcome === 'withdraw' ? 'Review recorded. Update the partner\'s authorization status on its page to match the outcome.' : 'Review recorded.');
}));

// ---------- Impartiality declarations ----------
r.get('/declarations', wrap(async (req, res) => {
  const year = new Date().getUTCFullYear();
  const { rows } = await q(`SELECT u.id, u.full_name, u.email, d.has_conflict, d.details, d.declared_at FROM users u LEFT JOIN qms_declarations d ON d.user_id = u.id AND d.year = $1 WHERE u.role = 'super_admin' ORDER BY u.full_name`, [year]);
  res.render('admin/qms/declarations', { title: 'Impartiality declarations', rows, year, mine: rows.find((x) => x.id === req.user.id) });
}));
r.post('/declarations', wrap(async (req, res) => {
  const year = new Date().getUTCFullYear(); const has = req.body.has_conflict === 'yes'; const details = str(req.body.details, 5000);
  if (has && !details) return back(req, res, '/admin/qms/declarations', 'error', 'Describe the conflict or interest.');
  const { rowCount } = await q(`INSERT INTO qms_declarations (user_id, year, has_conflict, details) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, year) DO NOTHING`, [req.user.id, year, has, details]);
  if (rowCount) await audit({ user: req.user, action: 'qms.declaration', target: String(year), metadata: { has_conflict: has } });
  back(req, res, '/admin/qms/declarations', rowCount ? 'success' : 'error', rowCount ? 'Declaration recorded.' : `You already declared for ${year}. Declarations cannot be altered.`);
}));

// ---------- Management reviews, internal audits, impartiality committee ----------
r.get('/meetings', wrap(async (req, res) => {
  const { rows } = await q('SELECT * FROM qms_meetings ORDER BY held_on DESC LIMIT 200');
  res.render('admin/qms/meetings', { title: 'Reviews and audits', rows, KINDS: qms.MEETING_KINDS, error: null, f: { held_on: qms.iso(new Date()) } });
}));
r.post('/meetings', wrap(async (req, res) => {
  const f = { kind: req.body.kind, held_on: qms.isoDate(req.body.held_on), participants: str(req.body.participants, 3000), inputs: str(req.body.inputs, 10000), decisions: str(req.body.decisions, 10000), next_due: qms.isoDate(req.body.next_due) };
  const err = !qms.MEETING_KINDS[f.kind] ? 'Choose the kind.' : !f.held_on ? 'Enter the date held.' : !f.participants ? 'List the participants.' : !f.decisions ? 'Record the decisions or findings.' : null;
  if (err) { const { rows } = await q('SELECT * FROM qms_meetings ORDER BY held_on DESC LIMIT 200'); return res.status(400).render('admin/qms/meetings', { title: 'Reviews and audits', rows, KINDS: qms.MEETING_KINDS, error: err, f }); }
  await q(`INSERT INTO qms_meetings (kind, held_on, participants, inputs, decisions, next_due, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [f.kind, f.held_on, f.participants, f.inputs, f.decisions, f.next_due, req.user.id]);
  await audit({ user: req.user, action: 'qms.meeting', target: `${qms.MEETING_KINDS[f.kind]} ${f.held_on}` });
  back(req, res, '/admin/qms/meetings', 'success', 'Recorded.');
}));

module.exports = r;
