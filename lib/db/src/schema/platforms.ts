import { pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const platforms = pgTable("platforms", {
  id: serial("id").primaryKey(),
  company_name: text("company_name").notNull(),
  logo_url: text("logo_url"),
  primary_color: text("primary_color").notNull().default("#102943"),
  accreditation_status: text("accreditation_status").notNull().default("pending"),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  website: text("website").notNull().default(""),
  country: text("country").notNull().default("United States"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [check("platform_status_check", sql`${t.accreditation_status} in ('pending','active','suspended')`)]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  platform_id: integer("platform_id").references(() => platforms.id),
  name: text("name").notNull(),
  role: text("role").notNull(),
  email: text("email").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [check("user_role_check", sql`(${t.role}='super_admin' and ${t.platform_id} is null) or (${t.role}='platform_admin' and ${t.platform_id} is not null)`)]);

export const sessions = pgTable("sessions", {
  token_hash: text("token_hash").primaryKey(),
  user_id: integer("user_id").notNull().references(() => users.id),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  platform_id: integer("platform_id").notNull().references(() => platforms.id),
  name: text("name").notNull().default("API key"),
  prefix: text("prefix").notNull(),
  key_hash: text("key_hash").notNull().unique(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  last_used_at: timestamp("last_used_at", { withTimezone: true }),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
});

export const trainees = pgTable("trainees", {
  id: serial("id").primaryKey(),
  platform_id: integer("platform_id").notNull().references(() => platforms.id),
  email: text("email").notNull(),
  first_name: text("first_name").notNull(),
  last_name: text("last_name").notNull(),
}, t => [uniqueIndex("trainee_platform_email").on(t.platform_id, t.email)]);

export const certificateTemplates = pgTable("certificate_templates", {
  id: serial("id").primaryKey(),
  platform_id: integer("platform_id").notNull().references(() => platforms.id),
  design: text("design").notNull(),
  signatory_name: text("signatory_name").notNull(),
  signatory_title: text("signatory_title").notNull(),
  validity_months: integer("validity_months"),
  settings: jsonb("settings").notNull().default({ paper_size: "A4" }),
}, t => [check("validity_months_check", sql`${t.validity_months} is null or ${t.validity_months} between 1 and 120`)]);