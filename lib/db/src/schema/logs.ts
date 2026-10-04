import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { certificates } from "./certificates";
import { users } from "./platforms";

export const verificationLogs = pgTable("verification_logs", {
  id: serial("id").primaryKey(),
  certificate_id: integer("certificate_id").references(() => certificates.id),
  cert_number: text("cert_number").notNull(),
  ip_hash: text("ip_hash").notNull(),
  result: text("result").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("verification_created_idx").on(t.created_at)]);

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actor_id: integer("actor_id").references(() => users.id),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subject: text("subject").notNull().default("General inquiry"),
  message: text("message").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});