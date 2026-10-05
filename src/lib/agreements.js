// Partner agreement versions and acceptance. Counsel's text is entered by an administrator; the starter outline carries a placeholder
// marker, and an agreement that still contains it cannot be made active.
const { q } = require('../db');

const PLACEHOLDER = '[PLACEHOLDER';
const hasPlaceholder = (body) => String(body || '').includes(PLACEHOLDER);
const STARTER_TITLE = 'Accredited Partner Agreement';
const STARTER_BODY = `# Accredited Partner Agreement

${['Parties and definitions', 'Scope of accreditation', 'Partner obligations (trainers, curricula, methods, records)', 'Completion reports and certificates', 'Use of the LIV name and marks', 'Fees and payment', 'Reviews, audits and surveillance', 'Impartiality, complaints and appeals', 'Suspension and withdrawal', 'Data protection', 'Limitation of liability', 'Governing law and disputes', 'General provisions'].map((h, i) => `## ${i + 1}. ${h}\n\n${PLACEHOLDER}: text to be supplied by counsel.]\n`).join('\n')}`;

/** The active agreement the partner has not accepted yet (null when none is active or it was accepted). */
async function pendingAgreement(platformId) {
  const { rows: [a] } = await q(`SELECT a.id, a.version, a.title, a.body_md FROM agreements a WHERE a.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM agreement_acceptances c WHERE c.agreement_id = a.id AND c.platform_id = $1)`, [platformId]);
  return a || null;
}
module.exports = { hasPlaceholder, pendingAgreement, STARTER_TITLE, STARTER_BODY, PLACEHOLDER };
