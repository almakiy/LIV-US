import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

const scrypt = promisify(scryptCallback);
if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required");
const secret = process.env.SESSION_SECRET;
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const keyedHash = (purpose: string, value: string) =>
  createHmac("sha256", secret).update(`${purpose}\0${value}`).digest("hex");
export function equal(a: string, b: string) {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function checkPassword(password: string, hash: string) {
  const [algorithm, salt, key] = hash.split(":");
  if (algorithm !== "scrypt" || !salt || !key) return false;
  const derived = await scrypt(password, salt, 64) as Buffer;
  return equal(derived.toString("hex"), key);
}
export type Actor = { id: number | null; platform_id: number | null; role: string; email?: string; name?: string; api_key_id?: number };
declare global {
  namespace Express { interface Request { actor?: Actor; } }
}
export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}
export function requireActor(req: Request) {
  if (!req.actor) throw new HttpError(401, "Please sign in.");
  return req.actor;
}
export function platformId(req: Request) {
  const actor = requireActor(req);
  if (actor.role !== "platform_admin" || !actor.platform_id) throw new HttpError(403, "A provider account is required.");
  return actor.platform_id;
}
export function requireSuper(req: Request) {
  const actor = requireActor(req);
  if (actor.role !== "super_admin") throw new HttpError(403, "Staff access required.");
  return actor;
}
export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.liv_session;
    if (typeof token === "string" && token.length < 200) {
      const { rows } = await pool.query(
        `SELECT u.id,u.platform_id,u.role,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,
        [sha256(token)],
      );
      req.actor = rows[0];
    }
    next();
  } catch (error) { next(error); }
}
export async function apiKeyMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const key = req.get("X-API-Key");
    if (!key || key.length > 200) throw new HttpError(401, "A valid X-API-Key header is required.");
    const { rows } = await pool.query(`UPDATE api_keys SET last_used_at=now() WHERE key_hash=$1 AND revoked_at IS NULL RETURNING id,platform_id`, [sha256(key)]);
    if (!rows[0]) throw new HttpError(401, "Invalid or revoked API key.");
    req.actor = { id: null, platform_id: rows[0].platform_id, role: "platform_admin", api_key_id: rows[0].id };
    next();
  } catch (error) { next(error); }
}
export function sameOrigin(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.path.startsWith("/v1/")) { next(); return; }
  const origin = req.get("Origin");
  if (origin) {
    try {
      const host = new URL(origin).host;
      const allowedHosts = [req.get("host"), req.get("x-forwarded-host")?.split(",")[0]?.trim(), process.env.REPLIT_DEV_DOMAIN];
      if (!allowedHosts.includes(host)) throw new Error();
    } catch { next(new HttpError(403, "Cross-origin requests are not permitted.")); return; }
  }
  // JSON-only mutations cannot be submitted by cross-site HTML forms.
  if (!req.is("application/json") && Number(req.get("content-length") || 0) > 0) {
    next(new HttpError(415, "Use application/json.")); return;
  }
  next();
}
export async function audit(actor: Actor | undefined, action: string, target: string, metadata: object = {}, client: { query: (sql: string, values?: any[]) => Promise<any> } = pool) {
  await client.query("INSERT INTO audit_logs(actor_id,action,target,metadata) VALUES($1,$2,$3,$4)", [actor?.id || null, action, target, JSON.stringify({ ...metadata, ...(actor?.api_key_id ? { api_key_id: actor.api_key_id } : {}) })]);
}
export const parseId = (raw: unknown) => {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Invalid identifier.");
  return id;
};
export function validate<T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: unknown } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, "Invalid request fields.", result.error);
  return result.data as T;
}
export function baseUrl(req: Request) {
  // Origin is supplied by the browser, not an arbitrary Host header. The origin
  // guard above checks it against the proxy's host before mutations.
  const origin = req.get("Origin");
  if (origin) return new URL(origin).origin;
  const forwarded = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || req.get("host")!;
  const protocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  return `${protocol}://${host}`;
}