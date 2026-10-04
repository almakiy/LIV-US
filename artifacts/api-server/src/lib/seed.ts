import { randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { hashPassword, keyedHash } from "./security";
import { getCert, issueBatch, verificationHash, verifyPath, today } from "./certificates";
import { certificatePdf } from "./pdf";
import { readFileBytes, removeFile, saveFile } from "./files";
import { logger } from "./logger";

export const demoState: { accounts: { email: string; password: string; role: string }[]; certificate?: { cert_number: string; verify_url: string } } = { accounts: [] };
export async function seedDevelopment(origin: string) {
  if (process.env.NODE_ENV === "production") return;
  const accountSpecs = [
    { email: "staff@liv.example", role: "super_admin", name: "LIV Demo Staff" },
    { email: "admin@meridian.example", role: "platform_admin", name: "Morgan Bennett" },
  ];
  let platform = (await pool.query("SELECT p.* FROM platforms p JOIN users u ON u.platform_id=p.id WHERE u.email=$1", [accountSpecs[1].email])).rows[0];
  if (!platform) platform = (await pool.query(`INSERT INTO platforms(company_name,email,accreditation_status,primary_color,website) VALUES('Meridian Training Institute',$1,'active','#102943','https://example.com') RETURNING *`, [accountSpecs[1].email])).rows[0];
  for (const spec of accountSpecs) {
    const password = `Demo-${randomBytes(12).toString("base64url")}!`;
    const hashed = await hashPassword(password);
    await pool.query(`INSERT INTO users(platform_id,name,role,email,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash`, [spec.role === "platform_admin" ? platform.id : null, spec.name, spec.role, spec.email, hashed]);
    demoState.accounts.push({ email: spec.email, password, role: spec.role });
  }
  let templates = (await pool.query("SELECT * FROM certificate_templates WHERE platform_id=$1 ORDER BY id", [platform.id])).rows;
  if (!templates.length) {
    for (const design of ["classic", "modern"]) await pool.query(`INSERT INTO certificate_templates(platform_id,design,signatory_name,signatory_title,validity_months,settings) VALUES($1,$2,'Morgan Bennett','Director of Training',24,'{"paper_size":"A4"}')`, [platform.id, design]);
    templates = (await pool.query("SELECT * FROM certificate_templates WHERE platform_id=$1 ORDER BY id", [platform.id])).rows;
  }
  const count = (await pool.query("SELECT count(*)::int AS n FROM certificates WHERE platform_id=$1", [platform.id])).rows[0].n;
  if (!count) {
    const actor = (await pool.query("SELECT id,platform_id,role FROM users WHERE email=$1", [accountSpecs[1].email])).rows[0];
    const completion = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const issued = await issueBatch(platform.id, actor, { template_id: templates[0].id, file_name: "sample-trainees.csv", rows: [
      { first_name: "Alex", last_name: "Morgan", email: "alex@example.com", course_name: "Workplace Safety Fundamentals", completion_date: completion, grade: "Distinction" },
      { first_name: "Jordan", last_name: "Lee", email: "jordan@example.com", course_name: "Project Management Essentials", completion_date: completion, grade: "Pass" },
      { first_name: "Taylor", last_name: "Reed", email: "taylor@example.com", course_name: "Occupational Health & Safety", completion_date: completion },
    ] }, origin);
    const expired = await getCert(issued.certificates[1]!.cert_number);
    expired.issue_date = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
    expired.completion_date = expired.issue_date;
    expired.expiry_date = new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10);
    expired.verification_hash = verificationHash(expired);
    const path = await saveFile(await certificatePdf(expired, templates[0], platform, origin + verifyPath(expired)), "application/pdf", `certificates/${platform.id}`);
    await pool.query("UPDATE certificates SET issue_date=$1,completion_date=$1,expiry_date=$2,verification_hash=$3,pdf_url=$4 WHERE id=$5", [expired.issue_date, expired.expiry_date, expired.verification_hash, path, expired.id]);
    await removeFile(expired.pdf_url);
    await pool.query("UPDATE certificates SET status='revoked',revoked_at=now(),revoked_by=$1,revocation_reason='Demo: completion record corrected' WHERE cert_number=$2", [actor.id, issued.certificates[2]!.cert_number]);
  }
  const sample = (await pool.query(`SELECT cert_number FROM certificates WHERE platform_id=$1 AND status='active' AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE) ORDER BY id LIMIT 1`, [platform.id])).rows[0];
  if (sample) {
    const certificate = await getCert(sample.cert_number);
    demoState.certificate = { cert_number: sample.cert_number, verify_url: origin + verifyPath(certificate) };
  }
  logger.info("Development demo accounts and certificates are ready; credentials are available only on the development login page.");
}