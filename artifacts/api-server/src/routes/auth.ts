import { Router } from "express";
import { randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import { pool } from "@workspace/db";
import { LoginBody, ApplyForAccreditationBody, SendContactBody } from "@workspace/api-zod";
import { audit, checkPassword, hashPassword, HttpError, requireActor, sha256, validate } from "../lib/security";
import { validEmail } from "../lib/certificates";

const router = Router();
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many sign-in attempts. Try again in 15 minutes." } });
const formLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 15, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many submissions. Please try again later." } });

async function sessionFor(userId: number, req: any, res: any) {
  if (req.cookies?.liv_session) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [sha256(req.cookies.liv_session)]);
  const token = randomBytes(32).toString("hex");
  await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')", [sha256(token), userId]);
  res.cookie("liv_session", token, { httpOnly: true, secure: req.secure || process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 12 * 60 * 60 * 1000 });
}
export async function accountPayload(actor: any) {
  const platform = actor.platform_id ? (await pool.query("SELECT * FROM platforms WHERE id=$1", [actor.platform_id])).rows[0] : null;
  return { user: { id: actor.id, platform_id: actor.platform_id, email: actor.email, name: actor.name, role: actor.role }, platform };
}
router.post("/auth/login", loginLimit, async (req, res) => {
  const input = validate(LoginBody, req.body);
  if (input.password.length > 1024 || !validEmail(input.email.trim())) throw new HttpError(400, "Enter a valid email and password.");
  const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [input.email.trim().toLowerCase()]);
  const user = rows[0];
  // Perform the same expensive password derivation for unknown emails.
  const fallbackHash = "scrypt:00000000000000000000000000000000:" + "0".repeat(128);
  const ok = await checkPassword(input.password, user?.password_hash || fallbackHash);
  if (!user || !ok) {
    await audit(undefined, "login.failed", "authentication");
    throw new HttpError(401, "Incorrect email or password.");
  }
  await sessionFor(user.id, req, res);
  await audit(user, "login.success", String(user.id));
  res.set("Cache-Control", "no-store").json(await accountPayload(user));
});
router.get("/auth/me", async (req, res) => {
  res.set("Cache-Control", "no-store").json(await accountPayload(requireActor(req)));
});
router.post("/auth/logout", async (req, res) => {
  if (req.cookies?.liv_session) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [sha256(req.cookies.liv_session)]);
  await audit(req.actor, "logout", "session");
  res.clearCookie("liv_session", { path: "/" }).json({ success: true });
});
router.post("/public/apply", formLimit, async (req, res) => {
  const input = validate(ApplyForAccreditationBody, req.body);
  const email = input.email.trim().toLowerCase();
  if (!validEmail(email) || !input.company_name.trim() || !input.admin_name.trim() || input.company_name.length > 200 || input.admin_name.length > 100 || input.password.length > 1024) throw new HttpError(400, "Please provide valid company, administrator and email details.");
  if (input.website && !/^https?:\/\/[^ ]+$/i.test(input.website)) throw new HttpError(400, "Website must start with https:// or http://.");
  const password_hash = await hashPassword(input.password);
  const client = await pool.connect();
  let user;
  try {
    await client.query("BEGIN");
    if ((await client.query("SELECT id FROM users WHERE email=$1", [email])).rows.length) throw new HttpError(409, "An account already exists for that email.");
    const platform = (await client.query("INSERT INTO platforms(company_name,email,phone,website,country) VALUES($1,$2,$3,$4,$5) RETURNING *", [input.company_name.trim(), email, (input.phone || "").slice(0, 80), input.website || "", (input.country || "United States").slice(0, 100)])).rows[0];
    user = (await client.query("INSERT INTO users(platform_id,name,role,email,password_hash) VALUES($1,$2,'platform_admin',$3,$4) RETURNING *", [platform.id, input.admin_name.trim(), email, password_hash])).rows[0];
    for (const design of ["classic", "modern"]) await client.query("INSERT INTO certificate_templates(platform_id,design,signatory_name,signatory_title) VALUES($1,$2,$3,'Training Director')", [platform.id, design, user.name]);
    await audit(user, "platform.apply", String(platform.id), {}, client);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  await sessionFor(user.id, req, res);
  res.json({ ...(await accountPayload(user)), message: "Application received. LIV LLC staff will review your accreditation request." });
});
router.post("/public/contact", formLimit, async (req, res) => {
  const input = validate(SendContactBody, req.body);
  if (!validEmail(input.email) || !input.name.trim() || !input.message.trim() || input.message.length > 5000 || input.name.length > 100) throw new HttpError(400, "Provide a name, valid email and message (up to 5,000 characters).");
  await pool.query("INSERT INTO contact_messages(name,email,subject,message) VALUES($1,$2,$3,$4)", [input.name.trim(), input.email.toLowerCase(), (input.subject || "General inquiry").slice(0, 200), input.message.trim()]);
  res.json({ success: true, message: "Thank you. Your message has been received." });
});
export default router;