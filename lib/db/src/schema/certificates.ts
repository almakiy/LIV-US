import { pgTable, serial, text, integer, timestamp, date, index, jsonb, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { platforms, users, trainees, certificateTemplates } from "./platforms";

export const issuanceBatches = pgTable("issuance_batches", {
  id: serial("id").primaryKey(),
  platform_id: integer("platform_id").notNull().references(() => platforms.id),
  created_by: integer("created_by").references(() => users.id),
  file_name: text("file_name").notNull(),
  total_rows: integer("total_rows").notNull(),
  issued: integer("issued").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const certificates = pgTable("certificates", {
  id: serial("id").primaryKey(),
  cert_number: text("cert_number").notNull().unique(),
  platform_id: integer("platform_id").notNull().references(() => platforms.id),
  trainee_id: integer("trainee_id").notNull().references(() => trainees.id),
  template_id: integer("template_id").notNull().references(() => certificateTemplates.id),
  batch_id: integer("batch_id").notNull().references(() => issuanceBatches.id),
  first_name: text("first_name").notNull(),
  last_name: text("last_name").notNull(),
  email: text("email").notNull(),
  course_name: text("course_name").notNull(),
  grade: text("grade"),
  completion_date: date("completion_date", { mode: "string" }).notNull(),
  issue_date: date("issue_date", { mode: "string" }).notNull(),
  expiry_date: date("expiry_date", { mode: "string" }),
  pdf_url: text("pdf_url").notNull(),
  verification_hash: text("verification_hash").notNull(),
  status: text("status").notNull().default("active"),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  revoked_by: integer("revoked_by").references(() => users.id),
  revocation_reason: text("revocation_reason"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("certificate_platform_idx").on(t.platform_id),
  index("certificate_status_idx").on(t.status),
  index("certificate_expiry_idx").on(t.expiry_date),
  // Duplicate protection is checked under a per-platform transaction lock,
  // because an expired credential must not block legitimate reissuance.
  index("certificate_duplicate_lookup").on(t.platform_id, t.email, t.course_name, t.completion_date),
  check("certificate_status_check", sql`${t.status} in ('active','revoked')`),
]);

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: serial("id").primaryKey(),
  platform_id: integer("platform_id").notNull().references(() => platforms.id),
  key: text("key").notNull(),
  request_hash: text("request_hash").notNull(),
  response: jsonb("response").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("idempotency_platform_key").on(t.platform_id, t.key)]);