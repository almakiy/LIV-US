import { Router } from "express";
import { pool } from "@workspace/db";
import { ChangePlatformStatusBody } from "@workspace/api-zod";
import { audit, HttpError, parseId, requireSuper, validate } from "../lib/security";

const router = Router();
router.use("/admin", (req, _res, next) => { try { requireSuper(req); next(); } catch (e) { next(e); } });
router.get("/admin/platforms", async (_req, res) => {
  res.json((await pool.query(`SELECT p.*,(SELECT count(*)::int FROM certificates c WHERE c.platform_id=p.id) AS certificate_count FROM platforms p ORDER BY CASE WHEN p.accreditation_status='pending' THEN 0 ELSE 1 END,p.created_at DESC`)).rows);
});
router.post("/admin/platforms/:id/status", async (req, res) => {
  const id = parseId(req.params.id), input = validate(ChangePlatformStatusBody, req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const platform = (await client.query("SELECT * FROM platforms WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!platform) throw new HttpError(404, "Provider not found.");
    const updated = (await client.query("UPDATE platforms SET accreditation_status=$1 WHERE id=$2 RETURNING *", [input.status, id])).rows[0];
    await audit(req.actor, "platform.status.change", String(id), { from: platform.accreditation_status, to: input.status }, client);
    await client.query("COMMIT");
    res.json(updated);
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});
router.get("/admin/audit", async (req, res) => {
  const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
  if (!Number.isInteger(page)) throw new HttpError(400, "Page must be an integer.");
  const items = (await pool.query("SELECT a.*,u.email AS actor_email FROM audit_logs a LEFT JOIN users u ON a.actor_id=u.id ORDER BY a.created_at DESC,a.id DESC LIMIT 25 OFFSET $1", [(page - 1) * 25])).rows;
  const total = (await pool.query("SELECT count(*)::int AS n FROM audit_logs")).rows[0].n;
  res.json({ items, total, page });
});
router.get("/admin/messages", async (_req, res) => {
  res.json((await pool.query("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 500")).rows);
});
router.get("/admin/analytics", async (_req, res) => {
  const days = (await pool.query(`SELECT d::date::text AS date,count(v.id)::int AS count FROM generate_series(CURRENT_DATE-29,CURRENT_DATE,interval '1 day') d LEFT JOIN verification_logs v ON v.created_at>=d AND v.created_at<d+interval '1 day' GROUP BY d ORDER BY d`)).rows;
  const total = (await pool.query("SELECT count(*)::int AS n FROM verification_logs")).rows[0].n;
  res.json({ days, total, today: days[days.length - 1]?.count || 0 });
});
export default router;