import { pool } from "@workspace/db";
import { hashPassword } from "./security";
import { validEmail } from "./certificates";
import { logger } from "./logger";

// Production never seeds publicly disclosed demo credentials. The owner
// supplies initial staff credentials through Secrets, not through public HTTP.
export async function bootstrapProductionAdmin() {
  if (process.env.NODE_ENV !== "production") return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(70492101)");
    const existing = await client.query("SELECT id FROM users WHERE role='super_admin' LIMIT 1");
    if (existing.rows.length) { await client.query("COMMIT"); return; }
    const email = process.env.LIV_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.LIV_ADMIN_PASSWORD;
    if (!email || !validEmail(email) || !password || password.length < 16 || password.length > 1024) {
      throw new Error("Initial staff access is not configured. Add LIV_ADMIN_EMAIL and LIV_ADMIN_PASSWORD (at least 16 characters) in production Secrets before publishing.");
    }
    const hash = await hashPassword(password);
    const user = (await client.query("INSERT INTO users(name,role,email,password_hash) VALUES('LIV Staff Administrator','super_admin',$1,$2) RETURNING id", [email, hash])).rows[0];
    await client.query("INSERT INTO audit_logs(actor_id,action,target) VALUES($1,'staff.initialize',$2)", [user.id, String(user.id)]);
    await client.query("COMMIT");
    logger.info("Initial production staff account initialized.");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}