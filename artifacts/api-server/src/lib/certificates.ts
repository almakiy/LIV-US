import { randomInt } from "node:crypto";
import { pool } from "@workspace/db";
import { certificatePdf } from "./pdf";
import { saveFile, removeFile } from "./files";
import { audit, equal, HttpError, keyedHash, sha256, type Actor } from "./security";

type Queryable = { query: (sql: string, values?: any[]) => Promise<any> };
export type TraineeRow = { first_name: string; last_name: string; email: string; course_name: string; completion_date: string; grade?: string };
export type IssueInput = { rows: TraineeRow[]; template_id: number; file_name?: string; skip_invalid?: boolean };
export const today = () => new Date().toISOString().slice(0, 10);
export const certSelect = `SELECT c.*,c.issue_date::text AS issue_date,c.expiry_date::text AS expiry_date,c.completion_date::text AS completion_date,p.company_name,p.logo_url,p.accreditation_status FROM certificates c JOIN platforms p ON c.platform_id=p.id`;
export function verificationHash(cert: Record<string, any>) {
  return keyedHash("certificate-v1", JSON.stringify([
    cert.cert_number, `${cert.first_name} ${cert.last_name}`, cert.email,
    cert.course_name, cert.issue_date, cert.expiry_date || "", String(cert.platform_id),
  ]));
}
export const certToken = (cert: Record<string, any>) => cert.verification_hash.slice(0, 24);
export function verifyPath(cert: Record<string, any>) { return `/verify/${cert.cert_number}?t=${certToken(cert)}`; }
export function displayStatus(cert: Record<string, any>) {
  if (!equal(verificationHash(cert), cert.verification_hash)) return "TAMPERED";
  if (cert.status === "revoked") return "REVOKED";
  if (cert.expiry_date && cert.expiry_date < today()) return "EXPIRED";
  return "VALID";
}
export function serializeCert(cert: Record<string, any>, origin: string, publicView = false) {
  const { verification_hash: _hash, pdf_url: _object, ...data } = cert;
  if (publicView) { delete data.email; delete data.trainee_id; delete data.revoked_by; delete data.revocation_reason; }
  return { ...data, status: displayStatus(cert), verify_url: `${origin}${verifyPath(cert)}`, pdf_url: `/api/certificates/${cert.cert_number}/pdf?t=${certToken(cert)}` };
}
export async function getCert(number: string, client: Queryable = pool) {
  const { rows } = await client.query(`${certSelect} WHERE c.cert_number=$1`, [number]);
  return rows[0];
}
export function requireCertScope(cert: Record<string, any> | undefined, actor: Actor) {
  if (!cert || (actor.role !== "super_admin" && cert.platform_id !== actor.platform_id)) throw new HttpError(404, "Certificate not found.");
}
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validEmail(email: string) { return email.length <= 254 && emailRegex.test(email); }
export async function validateRows(platform_id: number, inputs: TraineeRow[], client: Queryable = pool) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 500) throw new HttpError(400, "Provide between 1 and 500 rows.");
  const seen = new Set<string>();
  const rows = [];
  for (const [i, input] of inputs.entries()) {
    const row = {
      first_name: String(input.first_name || "").trim(),
      last_name: String(input.last_name || "").trim(),
      email: String(input.email || "").trim().toLowerCase(),
      course_name: String(input.course_name || "").trim().replace(/\s+/g, " "),
      completion_date: String(input.completion_date || "").trim(),
      grade: input.grade ? String(input.grade).trim() : undefined,
    };
    const errors: string[] = [];
    for (const f of ["first_name", "last_name", "email", "course_name", "completion_date"] as const) if (!row[f]) errors.push(`${f} is required`);
    if (row.first_name.length > 100 || row.last_name.length > 100) errors.push("Names must be 100 characters or fewer");
    if (row.course_name.length > 180) errors.push("Course name must be 180 characters or fewer");
    if (row.grade && row.grade.length > 60) errors.push("Grade must be 60 characters or fewer");
    if (row.email && !validEmail(row.email)) errors.push("Invalid email address");
    const parsed = new Date(`${row.completion_date}T00:00:00Z`);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(row.completion_date) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === row.completion_date && row.completion_date >= "1900-01-01";
    if (!validDate) errors.push("Invalid completion date (use YYYY-MM-DD)");
    else if (row.completion_date > today()) errors.push("Completion date cannot be in the future");
    const signature = JSON.stringify([row.email, row.course_name.toLowerCase(), row.completion_date]);
    if (seen.has(signature)) errors.push("Duplicate row within this file");
    seen.add(signature);
    if (validDate && row.email && row.course_name) {
      const existing = await client.query(`SELECT id FROM certificates WHERE platform_id=$1 AND email=$2 AND lower(course_name)=lower($3) AND completion_date=$4 AND status='active' AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE) LIMIT 1`, [platform_id, row.email, row.course_name, row.completion_date]);
      if (existing.rows.length) errors.push("An active certificate already exists for this email, course and date");
    }
    rows.push({ ...row, row_number: i + 1, errors, valid: errors.length === 0 });
  }
  return { rows, valid_count: rows.filter(r => r.valid).length, invalid_count: rows.filter(r => !r.valid).length };
}
function certificateNumber() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += alphabet[randomInt(alphabet.length)];
  return `LIV-${new Date().getUTCFullYear()}-${suffix}`;
}
function addMonths(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, end));
  return d.toISOString().slice(0, 10);
}
export function batchLinks(id: number) {
  return { csv_url: `/api/portal/batches/${id}/results.csv`, zip_url: `/api/portal/batches/${id}/pdfs.zip` };
}
export async function issueBatch(platform_id: number, actor: Actor, input: IssueInput, origin: string, idempotencyKey?: string) {
  const client = await pool.connect();
  const uploaded: string[] = [];
  try {
    await client.query("BEGIN");
    const { rows: platforms } = await client.query("SELECT * FROM platforms WHERE id=$1 FOR UPDATE", [platform_id]);
    const platform = platforms[0];
    if (!platform || platform.accreditation_status !== "active") throw new HttpError(403, "Only actively accredited providers can issue certificates.");
    const requestHash = sha256(JSON.stringify(input));
    if (idempotencyKey) {
      if (idempotencyKey.length > 128) throw new HttpError(400, "Idempotency key is too long.");
      const previous = await client.query("SELECT * FROM idempotency_keys WHERE platform_id=$1 AND key=$2", [platform_id, idempotencyKey]);
      if (previous.rows[0]) {
        if (previous.rows[0].request_hash !== requestHash) throw new HttpError(409, "Idempotency key was used for a different request.");
        await client.query("COMMIT");
        return previous.rows[0].response;
      }
    }
    const { rows: templates } = await client.query("SELECT * FROM certificate_templates WHERE id=$1 AND platform_id=$2", [input.template_id, platform_id]);
    const template = templates[0];
    if (!template) throw new HttpError(404, "Template not found.");
    const preview = await validateRows(platform_id, input.rows, client);
    if (preview.invalid_count && !input.skip_invalid) throw new HttpError(400, "Fix invalid rows or enable Skip invalid rows.", preview);
    const validRows = preview.rows.filter(r => r.valid);
    if (!validRows.length) throw new HttpError(400, "No valid rows to issue.");
    const { rows: batches } = await client.query(`INSERT INTO issuance_batches(platform_id,created_by,file_name,total_rows,issued,skipped) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [platform_id, actor.id, (input.file_name || "API issuance").slice(0, 200), input.rows.length, validRows.length, preview.invalid_count]);
    const batch = batches[0];
    const issued = [];
    for (const row of validRows) {
      const trainee = await client.query(`INSERT INTO trainees(platform_id,email,first_name,last_name) VALUES($1,$2,$3,$4) ON CONFLICT(platform_id,email) DO UPDATE SET first_name=excluded.first_name,last_name=excluded.last_name RETURNING id`, [platform_id, row.email, row.first_name, row.last_name]);
      let cert_number: string;
      do { cert_number = certificateNumber(); } while ((await client.query("SELECT 1 FROM certificates WHERE cert_number=$1", [cert_number])).rows.length);
      const cert: Record<string, any> = {
        ...row, cert_number, platform_id, trainee_id: trainee.rows[0].id, template_id: template.id,
        batch_id: batch.id, issue_date: today(), expiry_date: template.validity_months ? addMonths(today(), template.validity_months) : null,
        status: "active", company_name: platform.company_name, logo_url: platform.logo_url, accreditation_status: platform.accreditation_status,
      };
      cert.verification_hash = verificationHash(cert);
      const verifyUrl = `${origin}${verifyPath(cert)}`;
      const pdf = await certificatePdf(cert, template, platform, verifyUrl);
      cert.pdf_url = await saveFile(pdf, "application/pdf", `certificates/${platform_id}`);
      uploaded.push(cert.pdf_url);
      const result = await client.query(`INSERT INTO certificates(cert_number,platform_id,trainee_id,template_id,batch_id,first_name,last_name,email,course_name,grade,completion_date,issue_date,expiry_date,pdf_url,verification_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id,created_at`, [cert_number, platform_id, cert.trainee_id, template.id, batch.id, row.first_name, row.last_name, row.email, row.course_name, row.grade || null, row.completion_date, cert.issue_date, cert.expiry_date, cert.pdf_url, cert.verification_hash]);
      Object.assign(cert, result.rows[0]);
      await audit(actor, "certificate.issue", cert_number, { platform_id, batch_id: batch.id }, client);
      issued.push(serializeCert(cert, origin));
    }
    const response = { batch: { ...batch, ...batchLinks(batch.id) }, certificates: issued, issued: issued.length, skipped: preview.invalid_count, ...batchLinks(batch.id) };
    if (idempotencyKey) await client.query("INSERT INTO idempotency_keys(platform_id,key,request_hash,response) VALUES($1,$2,$3,$4)", [platform_id, idempotencyKey, requestHash, JSON.stringify(response)]);
    await client.query("COMMIT");
    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    await Promise.allSettled(uploaded.map(removeFile));
    throw error;
  } finally { client.release(); }
}
export async function revokeCert(certNumber: string, actor: Actor, reason: string) {
  if (!reason || reason.trim().length < 3 || reason.length > 1000) throw new HttpError(400, "Provide a revocation reason between 3 and 1000 characters.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cert = await getCert(certNumber, client);
    requireCertScope(cert, actor);
    const result = await client.query(`UPDATE certificates SET status='revoked',revoked_at=now(),revoked_by=$1,revocation_reason=$2 WHERE id=$3 AND status<>'revoked' RETURNING id`, [actor.id, reason.trim(), cert.id]);
    if (result.rows.length) await audit(actor, "certificate.revoke", certNumber, { reason: reason.trim(), platform_id: cert.platform_id }, client);
    await client.query("COMMIT");
    return await getCert(certNumber);
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export function csvCell(value: unknown) {
  const s = String(value ?? "");
  return `"${(/^[=+\-@\t\r]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"`;
}