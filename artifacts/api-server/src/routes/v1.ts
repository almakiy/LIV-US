import { Router } from "express";
import rateLimit from "express-rate-limit";
import { ApiIssueCertificatesBody, ApiRevokeCertificateBody } from "@workspace/api-zod";
import { apiKeyMiddleware, baseUrl, platformId, requireActor, validate, sha256, HttpError } from "../lib/security";
import { getCert, issueBatch, requireCertScope, revokeCert, serializeCert, type IssueInput } from "../lib/certificates";

const router = Router();
router.use("/v1/certificates", apiKeyMiddleware, rateLimit({
  windowMs: 60 * 1000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false,
  keyGenerator: req => sha256(req.get("X-API-Key") || ""), message: { error: "API rate limit exceeded. Retry in one minute." },
}));
router.post("/v1/certificates", async (req, res) => {
  const body = req.body;
  let payload;
  if (Array.isArray(body)) {
    if (body.some(row => row.template_id !== body[0]?.template_id)) throw new HttpError(400, "All rows in an array must use the same template_id.");
    payload = { template_id: body[0]?.template_id, rows: body };
  }
  else if (body && !body.rows) payload = { template_id: body.template_id, rows: [body] };
  else payload = body;
  const input = validate(ApiIssueCertificatesBody, payload) as IssueInput;
  res.json(await issueBatch(platformId(req), requireActor(req), input, baseUrl(req), req.get("Idempotency-Key")));
});
router.get("/v1/certificates/:certNumber", async (req, res) => {
  const cert = await getCert(String(req.params.certNumber));
  requireCertScope(cert, requireActor(req));
  res.json(serializeCert(cert, baseUrl(req)));
});
router.post("/v1/certificates/:certNumber/revoke", async (req, res) => {
  const input = validate(ApiRevokeCertificateBody, req.body);
  res.json(serializeCert(await revokeCert(String(req.params.certNumber), requireActor(req), input.reason), baseUrl(req)));
});
export default router;