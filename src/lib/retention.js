// Records retention schedule (Batch H). Lists each record type, where it is kept and who owns it. The retention periods are
// pending decision P-14 (counsel), so none is written here. Nothing is deleted automatically: deletion needs an approval.
const { q } = require('../db');

const RECORD_TYPES = [
  { key: 'applications', label: 'Partner applications, submitted versions and decisions', table: 'partner_applications', owner: 'Application Assessor' },
  { key: 'evidence', label: 'Applicant evidence files', table: 'partner_application_evidence', owner: 'Application Assessor' },
  { key: 'certificates', label: 'Issued credentials and their PDF files', table: 'certificates', owner: 'Provider (issuer) and LIV records' },
  { key: 'refusals', label: 'Refused upload attempts', table: 'issuance_refusals', owner: 'LIV records' },
  { key: 'cases', label: 'Monitoring cases', table: 'partner_audit_cases', owner: 'Authorization Decision-Maker' },
  { key: 'complaints', label: 'Complaints and appeals', table: 'qms_cases', owner: 'LIV quality records' },
  { key: 'changes', label: 'Material-change notices', table: 'partner_material_changes', owner: 'Application Assessor' },
  { key: 'sanctions', label: 'Sanctions screening records', table: 'partner_sanctions_checks', owner: 'Application Assessor' },
  { key: 'exceptions', label: 'Policy exceptions', table: 'policy_exceptions', owner: 'Main account' },
  { key: 'invoices', label: 'Invoices and payments', table: 'invoices', owner: 'Billing' },
  { key: 'email', label: 'Email messages sent or queued', table: 'email_outbox', owner: 'LIV records' },
  { key: 'verification', label: 'Verification lookups', table: 'verification_logs', owner: 'LIV records' },
  { key: 'audit', label: 'Audit log (hash-chained)', table: 'audit_logs', owner: 'LIV records' },
];

/** Row counts per record type, read-only. Table names come from the constant list above, never from input. */
async function counts() {
  const out = [];
  for (const r of RECORD_TYPES) {
    const { rows: [c] } = await q(`SELECT count(*)::int AS n FROM ${r.table}`);
    out.push({ ...r, n: c.n });
  }
  return out;
}

module.exports = { RECORD_TYPES, counts };
