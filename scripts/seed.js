// Seeds a super admin and a demo active platform with sample certificates.
require('../src/config');
const bcrypt = require('bcryptjs');
const { pool, q } = require('../src/db');
const { issue, validateRows } = require('../src/lib/issuance');
const { RECOMMENDED } = require('../src/lib/pdf-security');

(async () => {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@liv.local').toLowerCase();
  const adminPass = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe-Admin-2026';
  const demoEmail = 'demo@trainingco.example';
  const demoPass = 'ChangeMe-Demo-2026';

  const { rows: ex } = await q('SELECT 1 FROM users WHERE email = $1', [adminEmail]);
  if (!ex.length) {
    await q(`INSERT INTO users (role, full_name, email, password_hash) VALUES ('super_admin','LIV Administrator',$1,$2)`, [adminEmail, await bcrypt.hash(adminPass, 12)]);
    console.log(`Super admin: ${adminEmail} / ${adminPass}`);
  }
  const { rows: [has] } = await q('SELECT id FROM users WHERE email = $1', [demoEmail]);
  if (!has) {
    const { rows: [p] } = await q(`INSERT INTO platforms (company_name, website, country, contact_email, accreditation_status, primary_color)
      VALUES ('Demo Safety Training Co.','https://example.com','United States',$1,'active','#0B1F3A') RETURNING *`, [demoEmail]);
    await q(`INSERT INTO users (platform_id, role, full_name, email, password_hash) VALUES ($1,'platform_admin','Demo Admin',$2,$3)`, [p.id, demoEmail, await bcrypt.hash(demoPass, 12)]);
    const { rows: [tpl] } = await q(`INSERT INTO certificate_templates (platform_id, name, design, signatory_name, signatory_title, validity_months, security_config)
      VALUES ($1,'Classic – 3 year validity','classic','Dr. Sarah Mitchell','Director of Training',36,$2) RETURNING *`, [p.id, RECOMMENDED]);
    await q(`INSERT INTO certificate_templates (platform_id, name, design, signatory_name, signatory_title) VALUES ($1,'Modern – no expiry','modern','Dr. Sarah Mitchell','Director of Training')`, [p.id]);
    const sample = [
      ['Aisha', 'Rahman', 'aisha.rahman@example.com', 'Construction Site Safety Fundamentals', '2026-08-12', 'Pass'],
      ['Michael', 'Johnson', 'michael.j@example.com', 'ISO 45001 Internal Auditor', '2026-09-03', '91%'],
      ['Elena', 'Garcia', 'elena.garcia@example.com', 'Fire Safety & Emergency Response', '2026-09-21', 'Distinction'],
    ].map(([first_name, last_name, email, course_name, completion_date, grade]) => ({ first_name, last_name, email, course_name, completion_date, grade }));
    const rows = await validateRows(sample, p.id);
    const out = await issue({ rows, platform: p, template: tpl, source: 'csv', fileName: 'seed.csv', actorLabel: 'seed' });
    console.log(`Demo platform: ${demoEmail} / ${demoPass}`);
    out.certificates.forEach((c) => console.log(`  ${c.cert_number}  ${c.verify_url}`));
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
