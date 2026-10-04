import { Router } from "express";
import { pool } from "@workspace/db";
import { baseUrl, equal, HttpError, keyedHash } from "../lib/security";
import { certToken, displayStatus, getCert, serializeCert } from "../lib/certificates";
import { readFileBytes } from "../lib/files";
import { demoState } from "../lib/seed";

const router = Router();
router.get("/public/stats", async (_req, res) => {
  const result = await pool.query(`SELECT (SELECT count(*)::int FROM platforms WHERE accreditation_status='active') AS active_platforms,(SELECT count(*)::int FROM certificates) AS certificates_issued,(SELECT count(*)::int FROM verification_logs) AS verification_lookups`);
  res.json(result.rows[0]);
});
router.get("/public/demo", (_req, res) => {
  if (process.env.NODE_ENV === "production") { res.status(404).json({ error: "Not found." }); return; }
  res.set("Cache-Control", "no-store").json(demoState);
});
router.get("/v1/verify/:certNumber", async (req, res) => {
  const number = String(req.params.certNumber).toUpperCase().trim().slice(0, 80);
  const ipHash = keyedHash("verification-ip", req.ip || "unknown");
  const recent = await pool.query("SELECT count(*)::int AS n FROM verification_logs WHERE ip_hash=$1 AND created_at>now()-interval '1 minute'", [ipHash]);
  if (recent.rows[0].n >= 30) {
    await pool.query("INSERT INTO verification_logs(cert_number,ip_hash,result) VALUES($1,$2,'RATE_LIMITED')", [number, ipHash]);
    res.set("Retry-After", "60");
    throw new HttpError(429, "Too many verification requests. Please wait one minute.");
  }
  const cert = /^LIV-\d{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(number) ? await getCert(number) : undefined;
  let status = cert ? displayStatus(cert) : "NOT_FOUND";
  if (cert && req.query.t !== undefined && (typeof req.query.t !== "string" || !equal(req.query.t, certToken(cert)))) status = "TAMPERED";
  if (cert && req.query.last_name && (typeof req.query.last_name !== "string" || req.query.last_name.trim().toLowerCase() !== cert.last_name.toLowerCase())) status = "NOT_FOUND";
  await pool.query("INSERT INTO verification_logs(certificate_id,cert_number,ip_hash,result) VALUES($1,$2,$3,$4)", [cert?.id || null, number, ipHash, status]);
  const visible = cert && !["TAMPERED", "NOT_FOUND"].includes(status);
  res.set("Cache-Control", "no-store").json({ status, certificate: visible ? serializeCert(cert, baseUrl(req), true) : null });
});
router.get("/certificates/:certNumber/pdf", async (req, res) => {
  const cert = await getCert(String(req.params.certNumber).toUpperCase());
  if (!cert) throw new HttpError(404, "Certificate not found.");
  const scoped = req.actor && (req.actor.role === "super_admin" || req.actor.platform_id === cert.platform_id);
  const token = typeof req.query.t === "string" ? req.query.t : "";
  if (!scoped && !equal(token, certToken(cert))) throw new HttpError(403, "A valid verification link is required.");
  if (displayStatus(cert) === "TAMPERED") throw new HttpError(409, "Certificate integrity check failed.");
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${cert.cert_number}.pdf"`, "Cache-Control": "private, no-store" }).send(await readFileBytes(cert.pdf_url));
});
router.get("/storage/objects/logos/:platformId/:file", async (req, res) => {
  const path = `/objects/logos/${req.params.platformId}/${req.params.file}`;
  const exists = (await pool.query("SELECT id FROM platforms WHERE logo_url=$1", [path])).rows.length;
  if (!exists) throw new HttpError(404, "Logo not found.");
  const bytes = await readFileBytes(path);
  const contentType = bytes[0] === 0x89 ? "image/png" : "image/jpeg";
  res.set({ "Content-Type": contentType, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" }).send(bytes);
});
export default router;