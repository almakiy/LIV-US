import { Router } from "express";
import { randomBytes } from "node:crypto";
import { ZipArchive } from "archiver";
import { pool } from "@workspace/db";
import { CreateTemplateBody, UpdateTemplateBody, UpdateSettingsBody, GenerateApiKeyBody, RequestLogoUploadBody, ValidateIssuanceBody, IssueCertificatesBody, RevokeCertificateBody, ListCertificatesQueryParams } from "@workspace/api-zod";
import { audit, baseUrl, HttpError, parseId, platformId, requireActor, sha256, validate } from "../lib/security";
import { batchLinks, certSelect, csvCell, getCert, issueBatch, requireCertScope, revokeCert, serializeCert, validateRows, type IssueInput } from "../lib/certificates";
import { logoUpload, readFileBytes } from "../lib/files";

const router = Router();
router.use("/portal", (req, _res, next) => { try { requireActor(req); next(); } catch (e) { next(e); } });
router.get("/portal/dashboard", async (req, res) => {
  const actor = requireActor(req), pid = actor.role === "super_admin" ? null : actor.platform_id;
  const totals = (await pool.query(`SELECT count(*)::int AS issued,count(*) FILTER(WHERE status='active' AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE))::int AS active,count(*) FILTER(WHERE status='revoked')::int AS revoked,count(*) FILTER(WHERE status='active' AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE+30)::int AS expiring FROM certificates WHERE ($1::int IS NULL OR platform_id=$1)`, [pid])).rows[0];
  const batches = (await pool.query("SELECT * FROM issuance_batches WHERE ($1::int IS NULL OR platform_id=$1) ORDER BY created_at DESC LIMIT 5", [pid])).rows.map(b => ({ ...b, ...batchLinks(b.id) }));
  const platform = pid ? (await pool.query("SELECT * FROM platforms WHERE id=$1", [pid])).rows[0] : null;
  const recent = (await pool.query(`${certSelect} WHERE ($1::int IS NULL OR c.platform_id=$1) ORDER BY c.created_at DESC LIMIT 5`, [pid])).rows;
  res.json({ totals, batches, platform, recent_certificates: recent.map(c => serializeCert(c, baseUrl(req))) });
});
router.get("/portal/certificates", async (req, res) => {
  const actor = requireActor(req);
  const query = validate(ListCertificatesQueryParams, req.query);
  const pid = actor.role === "super_admin" ? query.platform_id || null : actor.platform_id;
  const page = Math.max(1, Math.min(100000, Math.floor(query.page || 1))), search = (query.search || "").trim().slice(0, 200);
  const status = (query.status || "").toUpperCase();
  const conditions: Record<string, string> = { VALID: "c.status='active' AND (c.expiry_date IS NULL OR c.expiry_date>=CURRENT_DATE)", ACTIVE: "c.status='active' AND (c.expiry_date IS NULL OR c.expiry_date>=CURRENT_DATE)", REVOKED: "c.status='revoked'", EXPIRED: "c.status='active' AND c.expiry_date<CURRENT_DATE", ALL: "true", "": "true" };
  if (!conditions[status]) throw new HttpError(400, "Unknown status filter.");
  const where = `WHERE ($1::int IS NULL OR c.platform_id=$1) AND ($2='' OR concat_ws(' ',c.first_name,c.last_name,c.email,c.course_name,c.cert_number) ILIKE '%'||$2||'%') AND (${conditions[status]})`;
  const count = (await pool.query(`SELECT count(*)::int AS total FROM certificates c ${where}`, [pid, search])).rows[0].total;
  const records = (await pool.query(`${certSelect} ${where} ORDER BY c.created_at DESC,c.id DESC LIMIT 10 OFFSET $3`, [pid, search, (page - 1) * 10])).rows;
  res.json({ items: records.map(c => serializeCert(c, baseUrl(req))), total: count, page, page_size: 10 });
});
router.get("/portal/certificates/:certNumber", async (req, res) => {
  const cert = await getCert(String(req.params.certNumber));
  requireCertScope(cert, requireActor(req));
  res.json(serializeCert(cert, baseUrl(req)));
});
router.post("/portal/certificates/:certNumber/revoke", async (req, res) => {
  const input = validate(RevokeCertificateBody, req.body);
  res.json(serializeCert(await revokeCert(String(req.params.certNumber), requireActor(req), input.reason), baseUrl(req)));
});
router.get("/portal/templates", async (req, res) => {
  res.json((await pool.query("SELECT * FROM certificate_templates WHERE platform_id=$1 ORDER BY id", [platformId(req)])).rows);
});
function templateData(input: any) {
  if (!input.signatory_name.trim() || !input.signatory_title.trim() || input.signatory_name.length > 100 || input.signatory_title.length > 100) throw new HttpError(400, "Provide a signatory name and title.");
  const months = input.validity_months;
  if (months != null && (!Number.isInteger(months) || months < 1 || months > 120)) throw new HttpError(400, "Validity must be blank or between 1 and 120 months.");
  const paper_size = input.settings?.paper_size || "A4";
  if (!["A4", "Letter"].includes(paper_size)) throw new HttpError(400, "Paper size must be A4 or Letter.");
  return { ...input, validity_months: months ?? null, settings: { paper_size } };
}
router.post("/portal/templates", async (req, res) => {
  const input = templateData(validate(CreateTemplateBody, req.body)), pid = platformId(req);
  const result = await pool.query("INSERT INTO certificate_templates(platform_id,design,signatory_name,signatory_title,validity_months,settings) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [pid, input.design, input.signatory_name.trim(), input.signatory_title.trim(), input.validity_months, JSON.stringify(input.settings)]);
  await audit(req.actor, "template.create", String(result.rows[0].id), { platform_id: pid });
  res.json(result.rows[0]);
});
router.put("/portal/templates/:id", async (req, res) => {
  const input = templateData(validate(UpdateTemplateBody, req.body)), pid = platformId(req);
  const result = await pool.query("UPDATE certificate_templates SET design=$1,signatory_name=$2,signatory_title=$3,validity_months=$4,settings=$5 WHERE id=$6 AND platform_id=$7 RETURNING *", [input.design, input.signatory_name.trim(), input.signatory_title.trim(), input.validity_months, JSON.stringify(input.settings), parseId(req.params.id), pid]);
  if (!result.rows[0]) throw new HttpError(404, "Template not found.");
  await audit(req.actor, "template.update", String(result.rows[0].id));
  res.json(result.rows[0]);
});
router.post("/portal/issuance/validate", async (req, res) => {
  const pid = platformId(req), input = validate(ValidateIssuanceBody, req.body) as IssueInput;
  const tpl = await pool.query("SELECT id FROM certificate_templates WHERE id=$1 AND platform_id=$2", [input.template_id, pid]);
  if (!tpl.rows[0]) throw new HttpError(404, "Template not found.");
  res.json(await validateRows(pid, input.rows));
});
router.post("/portal/issuance/issue", async (req, res) => {
  const pid = platformId(req), input = validate(IssueCertificatesBody, req.body) as IssueInput;
  res.json(await issueBatch(pid, requireActor(req), input, baseUrl(req), req.get("Idempotency-Key")));
});
router.get("/portal/batches", async (req, res) => {
  const actor = requireActor(req), pid = actor.role === "super_admin" ? null : actor.platform_id;
  res.json((await pool.query("SELECT * FROM issuance_batches WHERE ($1::int IS NULL OR platform_id=$1) ORDER BY created_at DESC LIMIT 100", [pid])).rows.map(b => ({ ...b, ...batchLinks(b.id) })));
});
async function batchCerts(req: any) {
  const actor = requireActor(req), id = parseId(req.params.id);
  const batch = (await pool.query("SELECT * FROM issuance_batches WHERE id=$1", [id])).rows[0];
  if (!batch || (actor.role !== "super_admin" && batch.platform_id !== actor.platform_id)) throw new HttpError(404, "Batch not found.");
  return (await pool.query(`${certSelect} WHERE c.batch_id=$1 ORDER BY c.id`, [id])).rows;
}
router.get("/portal/batches/:id/results.csv", async (req, res) => {
  const certs = await batchCerts(req);
  const rows = [["first_name", "last_name", "email", "course_name", "cert_number", "verify_url"], ...certs.map(c => [c.first_name, c.last_name, c.email, c.course_name, c.cert_number, serializeCert(c, baseUrl(req)).verify_url])];
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="batch-${req.params.id}-results.csv"`, "Cache-Control": "no-store" }).send(rows.map(r => r.map(csvCell).join(",")).join("\r\n"));
});
router.get("/portal/batches/:id/pdfs.zip", async (req, res) => {
  const certs = await batchCerts(req);
  // Fetch before writing headers: storage errors must not return a partial ZIP.
  const files = [];
  for (const cert of certs) files.push({ name: `${cert.cert_number}.pdf`, bytes: await readFileBytes(cert.pdf_url) });
  res.set({ "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="batch-${req.params.id}-certificates.zip"`, "Cache-Control": "no-store" });
  const zip = new ZipArchive({ zlib: { level: 6 } });
  zip.on("error", e => { req.log.error({ message: e.message }, "ZIP generation failed"); res.destroy(e); });
  zip.pipe(res);
  for (const f of files) zip.append(f.bytes, { name: f.name });
  await zip.finalize();
});
router.get("/portal/sample.csv", (_req, res) => {
  res.set({ "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="liv-trainee-template.csv"' }).send("first_name,last_name,email,course_name,completion_date,grade\r\nAlex,Morgan,alex@example.com,Workplace Safety Fundamentals,2026-01-15,Pass\r\nJordan,Lee,jordan@example.com,Project Management Essentials,2026-01-15,\r\n");
});
router.get("/portal/settings", async (req, res) => {
  const pid = platformId(req);
  const platform = (await pool.query("SELECT * FROM platforms WHERE id=$1", [pid])).rows[0];
  const users = (await pool.query("SELECT id,name,email,role FROM users WHERE platform_id=$1 ORDER BY id", [pid])).rows;
  const api_keys = (await pool.query("SELECT id,name,prefix,created_at,last_used_at,revoked_at FROM api_keys WHERE platform_id=$1 ORDER BY created_at DESC", [pid])).rows;
  res.json({ platform, users, api_keys });
});
router.put("/portal/settings", async (req, res) => {
  const pid = platformId(req), input = validate(UpdateSettingsBody, req.body);
  const current = (await pool.query("SELECT * FROM platforms WHERE id=$1", [pid])).rows[0];
  if (input.primary_color && !/^#[0-9a-f]{6}$/i.test(input.primary_color)) throw new HttpError(400, "Primary color must be a hex color.");
  if (input.company_name !== undefined && (!input.company_name.trim() || input.company_name.length > 200)) throw new HttpError(400, "Company name is required (up to 200 characters).");
  if (input.website && !/^https?:\/\/[^ ]+$/i.test(input.website)) throw new HttpError(400, "Use an http:// or https:// website URL.");
  if (input.logo_url && !new RegExp(`^/objects/logos/${pid}/[a-f0-9-]{36}$`).test(input.logo_url)) throw new HttpError(400, "Upload your logo first.");
  if (input.logo_url) {
    const bytes = await readFileBytes(input.logo_url);
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (bytes.length > 2 * 1024 * 1024 || (!png && !jpeg)) throw new HttpError(400, "Logo must be a PNG or JPEG under 2 MB.");
  }
  const result = await pool.query("UPDATE platforms SET company_name=$1,primary_color=$2,logo_url=$3,phone=$4,website=$5 WHERE id=$6 RETURNING *", [
    input.company_name?.trim() ?? current.company_name, input.primary_color ?? current.primary_color,
    input.logo_url === undefined ? current.logo_url : input.logo_url, input.phone === undefined ? current.phone : input.phone.slice(0, 80),
    input.website ?? current.website, pid,
  ]);
  await audit(req.actor, "platform.profile.update", String(pid));
  res.json({ platform: result.rows[0] });
});
router.post("/portal/keys", async (req, res) => {
  const pid = platformId(req), input = validate(GenerateApiKeyBody, req.body);
  const key = `liv_live_${randomBytes(32).toString("hex")}`;
  const api_key = (await pool.query("INSERT INTO api_keys(platform_id,name,prefix,key_hash) VALUES($1,$2,$3,$4) RETURNING id,name,prefix,created_at,last_used_at,revoked_at", [pid, (input.name || "API key").slice(0, 100), key.slice(0, 17), sha256(key)])).rows[0];
  await audit(req.actor, "api_key.create", String(api_key.id), { platform_id: pid, prefix: api_key.prefix });
  res.set("Cache-Control", "no-store").json({ key, api_key });
});
router.post("/portal/keys/:id/revoke", async (req, res) => {
  const pid = platformId(req), id = parseId(req.params.id);
  const result = await pool.query("UPDATE api_keys SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND platform_id=$2 RETURNING id", [id, pid]);
  if (!result.rows[0]) throw new HttpError(404, "API key not found.");
  await audit(req.actor, "api_key.revoke", String(id), { platform_id: pid });
  res.json({ success: true });
});
router.post("/storage/logo/request-url", async (req, res) => {
  const pid = platformId(req), input = validate(RequestLogoUploadBody, req.body);
  if (!["image/png", "image/jpeg"].includes(input.contentType) || input.size <= 0 || input.size > 2 * 1024 * 1024) throw new HttpError(400, "Choose a PNG or JPEG logo under 2 MB.");
  res.json(await logoUpload(pid, input.contentType));
});
export default router;