// Full database schema (idempotent). Kept as a JS module, not a .sql file, so it travels with the code
// through git/hosting tools and cannot be lost by folder clean-ups. Applied by `npm run migrate`.
module.exports = `
-- LIV LLC Certification Platform — PostgreSQL schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255) NOT NULL,
  website VARCHAR(255),
  contact_email VARCHAR(255),
  country VARCHAR(100),
  logo_path TEXT,
  primary_color VARCHAR(7) DEFAULT '#0B2545',
  accreditation_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (accreditation_status IN ('pending','active','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID REFERENCES platforms(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin','platform_admin')),
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((role = 'super_admin' AND platform_id IS NULL) OR (role = 'platform_admin' AND platform_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  label VARCHAR(100),
  prefix VARCHAR(16) NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,      -- SHA-256 of the full key; plaintext never stored
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trainees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform_id, email)
);

CREATE TABLE IF NOT EXISTS certificate_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  design VARCHAR(20) NOT NULL DEFAULT 'classic' CHECK (design IN ('classic','modern')),
  signatory_name VARCHAR(150),
  signatory_title VARCHAR(150),
  validity_months INT CHECK (validity_months IS NULL OR validity_months BETWEEN 1 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Per-template anti-counterfeiting layers (see src/lib/pdf-security.js). '{}' = none (older templates).
ALTER TABLE certificate_templates ADD COLUMN IF NOT EXISTS security_config JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS issuance_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  source VARCHAR(10) NOT NULL DEFAULT 'csv' CHECK (source IN ('csv','api')),
  file_name VARCHAR(255),
  total_rows INT NOT NULL DEFAULT 0,
  issued INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cert_number VARCHAR(20) NOT NULL UNIQUE,          -- e.g. LIV-2026-7KQ4M9XZ
  platform_id UUID NOT NULL REFERENCES platforms(id),
  trainee_id UUID NOT NULL REFERENCES trainees(id),
  -- Recipient snapshot at issuance (certificates are immutable; the HMAC covers these)
  recipient_first_name VARCHAR(100) NOT NULL,
  recipient_last_name VARCHAR(100) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  template_id UUID REFERENCES certificate_templates(id),
  batch_id UUID REFERENCES issuance_batches(id),
  course_name VARCHAR(255) NOT NULL,
  grade VARCHAR(50),
  completion_date DATE NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE,
  pdf_path TEXT,
  verification_hash CHAR(64) NOT NULL,              -- HMAC-SHA256 over canonical fields
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id),
  revocation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cert_platform ON certificates(platform_id);
CREATE INDEX IF NOT EXISTS idx_cert_status ON certificates(status);
CREATE INDEX IF NOT EXISTS idx_cert_expiry ON certificates(expiry_date);
-- Provider's own serial/reference number, and the holder's ID number kept only as a keyed hash + last 4 digits.
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS holder_ref VARCHAR(50);
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS id_hash CHAR(64);
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS id_last4 VARCHAR(4);
CREATE INDEX IF NOT EXISTS idx_cert_holder_ref ON certificates(platform_id, holder_ref);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cert_active_dup
  ON certificates(platform_id, trainee_id, lower(course_name), completion_date) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS verification_logs (
  id BIGSERIAL PRIMARY KEY,
  cert_number VARCHAR(40),
  certificate_id UUID REFERENCES certificates(id),
  result VARCHAR(20) NOT NULL,
  ip_hash CHAR(64),
  channel VARCHAR(10) NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vlog_created ON verification_logs(created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id),
  actor_label VARCHAR(255),
  platform_id UUID REFERENCES platforms(id),
  action VARCHAR(60) NOT NULL,
  target VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL,
  topic VARCHAR(30) NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  handled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Knowledge hub (Phase 3): articles, research notes and guides in Quality, Safety and Project Management.
CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  summary VARCHAR(300) NOT NULL DEFAULT '',
  body_md TEXT NOT NULL DEFAULT '',
  category VARCHAR(30) NOT NULL CHECK (category IN ('quality','safety','project-management')),
  kind VARCHAR(20) NOT NULL DEFAULT 'article' CHECK (kind IN ('article','research','guide')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  author_name VARCHAR(150) NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_articles_pub ON articles(status, published_at DESC);

-- Knowledge hub, step 1 of the engines design (docs/KNOWLEDGE-ENGINES.md): content types, human review sign-off,
-- freshness, version history and scoped service keys for the Content API. Engines may only create drafts.
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_kind_check;
ALTER TABLE articles ADD CONSTRAINT articles_kind_check CHECK (kind IN ('article','research','guide','standards','case-study','briefing','tool','news','glossary','framework','checklist','template','career-guide','industry-analysis'));
ALTER TABLE articles ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(150) NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS next_review_at DATE;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS ai_assisted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS sources JSONB NOT NULL DEFAULT '[]';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS standards TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS origin VARCHAR(10) NOT NULL DEFAULT 'editor';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS external_id VARCHAR(100);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS service_key_id UUID;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_external ON articles(service_key_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS service_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(100) NOT NULL,
  prefix VARCHAR(16) NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,      -- SHA-256 of the full key; plaintext never stored
  scopes TEXT[] NOT NULL DEFAULT '{content:draft,content:read}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'articles_service_key_fk') THEN
    ALTER TABLE articles ADD CONSTRAINT articles_service_key_fk FOREIGN KEY (service_key_id) REFERENCES service_keys(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS article_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  version INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  summary VARCHAR(300) NOT NULL DEFAULT '',
  body_md TEXT NOT NULL DEFAULT '',
  sources JSONB NOT NULL DEFAULT '[]',
  standards TEXT[] NOT NULL DEFAULT '{}',
  changed_by VARCHAR(150) NOT NULL DEFAULT '',
  change_note VARCHAR(300) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (article_id, version)
);

-- ===== Billing (docs/FEES.md, docs/BILLING.md): price catalog, partner plans, discounts, invoices, payments. Money is stored in integer cents (USD). =====
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS plan VARCHAR(12) CHECK (plan IN ('starter','professional','enterprise'));
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS plan_started_on DATE;
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS plan_renews_on DATE;
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS included_certificates INT;
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS tax_rate_bps INT NOT NULL DEFAULT 0 CHECK (tax_rate_bps BETWEEN 0 AND 10000);
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS tax_label VARCHAR(20) NOT NULL DEFAULT 'VAT';
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS service_hold BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(80);
-- Public register URL /partners/{public_slug}: derived from the name plus a short id so it is unique and needs no backfill.
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS public_slug TEXT GENERATED ALWAYS AS (trim(both '-' from regexp_replace(lower(company_name), '[^a-z0-9]+', '-', 'g')) || '-' || substr(id::text, 1, 6)) STORED;
CREATE INDEX IF NOT EXISTS idx_platforms_public_slug ON platforms(public_slug);

CREATE TABLE IF NOT EXISTS billing_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category VARCHAR(20) NOT NULL CHECK (category IN ('accreditation','certificate','verification','candidate','course','resource')),
  unit VARCHAR(20) NOT NULL CHECK (unit IN ('one_time','annual','per_certificate','per_document','per_course','per_review_day','per_attempt','monthly','per_record')),
  phase VARCHAR(60) NOT NULL DEFAULT 'now',
  active BOOLEAN NOT NULL DEFAULT true,
  sort INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A price: for one product, optionally for one plan, optionally as a graduated band starting at min_qty. History is kept: a change adds a row and closes the old one.
CREATE TABLE IF NOT EXISTS billing_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES billing_products(id),
  plan VARCHAR(12) CHECK (plan IN ('starter','professional','enterprise')),
  min_qty INT NOT NULL DEFAULT 1,
  unit_amount_cents INT NOT NULL CHECK (unit_amount_cents >= 0),
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_prices_product ON billing_prices(product_id, valid_from DESC);

CREATE TABLE IF NOT EXISTS billing_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id),
  category VARCHAR(30) NOT NULL CHECK (category IN ('founding_partner','non_profit','multi_year','referral','other')),
  product_code VARCHAR(40),                    -- NULL = every product
  percent_bps INT CHECK (percent_bps BETWEEN 0 AND 10000),
  amount_cents INT CHECK (amount_cents >= 0),  -- one-off credit, applied once
  note VARCHAR(300) NOT NULL DEFAULT '',
  valid_until DATE,
  used_invoice_id UUID,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((percent_bps IS NOT NULL) <> (amount_cents IS NOT NULL))
);

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(20) UNIQUE,                   -- assigned when issued; never reused
  platform_id UUID NOT NULL REFERENCES platforms(id),
  status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','paid','void')),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  issue_date DATE,
  due_date DATE,
  period_start DATE,
  period_end DATE,
  subtotal_cents BIGINT NOT NULL DEFAULT 0,
  discount_cents BIGINT NOT NULL DEFAULT 0,
  tax_label VARCHAR(20) NOT NULL DEFAULT 'VAT',
  tax_rate_bps INT NOT NULL DEFAULT 0,
  tax_cents BIGINT NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,
  amount_paid_cents BIGINT NOT NULL DEFAULT 0,
  billing JSONB NOT NULL DEFAULT '{}',         -- name, email, address, tax id as they were when issued
  notes TEXT NOT NULL DEFAULT '',
  provider VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual','stripe')),
  provider_invoice_id VARCHAR(80),
  provider_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_invoices_platform ON invoices(platform_id, created_at DESC);
CREATE TABLE IF NOT EXISTS invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_code VARCHAR(40) NOT NULL,
  description VARCHAR(400) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_amount_cents INT NOT NULL,
  amount_cents BIGINT NOT NULL,
  discount_cents BIGINT NOT NULL DEFAULT 0,
  usage_offset INT,                            -- for certificate usage: certificates beyond the allowance already billed before this line
  plan_year_start DATE
);
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  method VARCHAR(20) NOT NULL CHECK (method IN ('bank_transfer','card','cash','other')),
  provider VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual','stripe')),
  provider_payment_id VARCHAR(80) UNIQUE,      -- makes webhook deliveries idempotent
  reference VARCHAR(200) NOT NULL DEFAULT '',
  received_on DATE NOT NULL,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partner gateway slice (docs/GLOBAL-STRATEGY.md): two-factor sign-in, forced password change, partner agreement acceptance and billing details.
ALTER TABLE users ADD COLUMN IF NOT EXISTS partner_role VARCHAR(20) NOT NULL DEFAULT 'account_manager';
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_hashes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS billing_name VARCHAR(255);
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255);
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS billing_address TEXT;
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS tax_id VARCHAR(60);

CREATE TABLE IF NOT EXISTS agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  body_md TEXT NOT NULL DEFAULT '',
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agreements_one_active ON agreements((status)) WHERE status = 'active';
CREATE TABLE IF NOT EXISTS agreement_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id),
  agreement_id UUID NOT NULL REFERENCES agreements(id),
  user_id UUID NOT NULL REFERENCES users(id),
  accepted_name VARCHAR(200) NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash CHAR(64),
  user_agent VARCHAR(200),
  UNIQUE (platform_id, agreement_id)
);

-- Reviewer engine reports (docs/KNOWLEDGE-ENGINES.md). A report belongs to one version of an article; it never changes publish state by itself.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS review_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  version INT NOT NULL,
  engine VARCHAR(60) NOT NULL,
  result VARCHAR(14) NOT NULL CHECK (result IN ('pass','needs_changes','block')),
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  flags JSONB NOT NULL DEFAULT '[]',
  checks_run TEXT[] NOT NULL DEFAULT '{}',
  model JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_reports_article ON review_reports(article_id, version, created_at DESC);

-- ===== Quality records (docs/QMS-RECORDS.md): readiness for ISO/IEC 17024-style assessments, CPD/IACET and ISO 9001/21001 =====
-- Tamper-evident audit log: every row carries a hash chained to the previous row; rows cannot be updated or deleted.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prev_hash CHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entry_hash CHAR(64);
CREATE OR REPLACE FUNCTION audit_row_hash(prev TEXT, r audit_logs) RETURNS TEXT AS $f$
  SELECT encode(sha256(convert_to(prev || '|' || r.id::text || '|' || COALESCE(r.actor_user_id::text,'') || '|' || COALESCE(r.actor_label,'') || '|' ||
    COALESCE(r.platform_id::text,'') || '|' || r.action || '|' || COALESCE(r.target,'') || '|' || COALESCE(r.metadata::text,'') || '|' ||
    to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'UTF8')), 'hex')
$f$ LANGUAGE sql IMMUTABLE;
CREATE OR REPLACE FUNCTION audit_chain_before_insert() RETURNS trigger AS $f$
DECLARE prev TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(727001);
  SELECT entry_hash INTO prev FROM audit_logs WHERE entry_hash IS NOT NULL ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := COALESCE(prev, repeat('0', 64));
  NEW.entry_hash := audit_row_hash(NEW.prev_hash, NEW);
  RETURN NEW;
END $f$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_chain_ins ON audit_logs;
CREATE TRIGGER audit_chain_ins BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_chain_before_insert();
CREATE OR REPLACE FUNCTION audit_append_only() RETURNS trigger AS $f$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END $f$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_no_change ON audit_logs;
CREATE TRIGGER audit_no_change BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_append_only();
CREATE OR REPLACE FUNCTION audit_verify_chain() RETURNS TABLE(checked BIGINT, broken_id BIGINT) AS $f$
DECLARE rec audit_logs; prev TEXT := NULL; n BIGINT := 0;
BEGIN
  FOR rec IN SELECT * FROM audit_logs WHERE entry_hash IS NOT NULL ORDER BY id LOOP
    n := n + 1;
    IF (prev IS NOT NULL AND rec.prev_hash <> prev) OR (prev IS NULL AND rec.prev_hash <> repeat('0', 64)) OR rec.entry_hash <> audit_row_hash(rec.prev_hash, rec) THEN
      checked := n; broken_id := rec.id; RETURN NEXT; RETURN;
    END IF;
    prev := rec.entry_hash;
  END LOOP;
  checked := n; broken_id := NULL; RETURN NEXT;
END $f$ LANGUAGE plpgsql;

-- Controlled documents: policies, procedures, forms, standards and handbooks with approved, immutable versions.
CREATE TABLE IF NOT EXISTS qms_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no VARCHAR(30) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  doc_type VARCHAR(20) NOT NULL CHECK (doc_type IN ('policy','procedure','form','standard','handbook','plan')),
  owner_name VARCHAR(150) NOT NULL DEFAULT '',
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','obsolete')),
  current_version INT NOT NULL DEFAULT 0,
  review_months INT NOT NULL DEFAULT 12,
  next_review_at DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS qms_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES qms_documents(id) ON DELETE CASCADE,
  version INT NOT NULL,
  body_md TEXT NOT NULL DEFAULT '',
  change_summary VARCHAR(300) NOT NULL DEFAULT '',
  status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','superseded')),
  author_id UUID REFERENCES users(id),
  author_name VARCHAR(150) NOT NULL DEFAULT '',
  approver_id UUID REFERENCES users(id),
  approver_name VARCHAR(150),
  self_approved BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  effective_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

-- Complaints, appeals and feedback register with deadlines and a case timeline.
CREATE SEQUENCE IF NOT EXISTS qms_case_seq;
CREATE SEQUENCE IF NOT EXISTS qms_action_seq;
CREATE TABLE IF NOT EXISTS qms_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no VARCHAR(20) NOT NULL UNIQUE,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('complaint','appeal','feedback')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel VARCHAR(10) NOT NULL DEFAULT 'web' CHECK (channel IN ('web','email','phone','partner','other')),
  complainant_name VARCHAR(200) NOT NULL DEFAULT '',
  complainant_email VARCHAR(255) NOT NULL DEFAULT '',
  subject_type VARCHAR(12) NOT NULL DEFAULT 'liv' CHECK (subject_type IN ('partner','certificate','liv','other')),
  platform_id UUID REFERENCES platforms(id),
  cert_number VARCHAR(30),
  summary TEXT NOT NULL,
  status VARCHAR(14) NOT NULL DEFAULT 'received' CHECK (status IN ('received','acknowledged','investigating','decided','closed')),
  ack_due DATE NOT NULL,
  ack_at TIMESTAMPTZ,
  decision_due DATE NOT NULL,
  handler_name VARCHAR(150) NOT NULL DEFAULT '',
  original_decider_name VARCHAR(150) NOT NULL DEFAULT '',
  reviewer_name VARCHAR(150) NOT NULL DEFAULT '',
  decision TEXT NOT NULL DEFAULT '',
  outcome VARCHAR(20) CHECK (outcome IN ('upheld','partially_upheld','not_upheld','withdrawn')),
  decided_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS qms_case_events (
  id BIGSERIAL PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES qms_cases(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_name VARCHAR(150) NOT NULL DEFAULT '',
  event VARCHAR(40) NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

-- Nonconformities and corrective actions (root cause, action, verification of effectiveness).
CREATE TABLE IF NOT EXISTS qms_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no VARCHAR(20) NOT NULL UNIQUE,
  source VARCHAR(20) NOT NULL CHECK (source IN ('internal_audit','complaint','appeal','partner_review','management_review','external_audit','other')),
  source_ref VARCHAR(60) NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  root_cause TEXT NOT NULL DEFAULT '',
  correction TEXT NOT NULL DEFAULT '',
  corrective_action TEXT NOT NULL DEFAULT '',
  owner_name VARCHAR(150) NOT NULL DEFAULT '',
  due_date DATE,
  status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','awaiting_verification','closed')),
  verified_by_name VARCHAR(150) NOT NULL DEFAULT '',
  verified_at TIMESTAMPTZ,
  effectiveness_note TEXT NOT NULL DEFAULT '',
  closed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Surveillance of accredited partners: initial, periodic and special reviews with outcomes and next due date.
CREATE TABLE IF NOT EXISTS qms_partner_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id),
  review_type VARCHAR(10) NOT NULL CHECK (review_type IN ('initial','periodic','special')),
  reviewed_on DATE NOT NULL,
  reviewer_name VARCHAR(150) NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  findings TEXT NOT NULL DEFAULT '',
  outcome VARCHAR(12) NOT NULL CHECK (outcome IN ('satisfactory','conditions','suspend','withdraw')),
  next_review_due DATE NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Yearly impartiality / conflict-of-interest declarations by staff.
CREATE TABLE IF NOT EXISTS qms_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  year INT NOT NULL,
  has_conflict BOOLEAN NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  declared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, year)
);

-- Management reviews, internal audits and impartiality committee meetings.
CREATE TABLE IF NOT EXISTS qms_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('management_review','internal_audit','impartiality_committee')),
  held_on DATE NOT NULL,
  participants TEXT NOT NULL DEFAULT '',
  inputs TEXT NOT NULL DEFAULT '',
  decisions TEXT NOT NULL DEFAULT '',
  next_due DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Certificate designs available to templates.
ALTER TABLE certificate_templates DROP CONSTRAINT IF EXISTS certificate_templates_design_check;
ALTER TABLE certificate_templates ADD CONSTRAINT certificate_templates_design_check CHECK (design IN ('classic','modern','executive'));

-- Phase 2 (Oct 2026): credential schemes, partner authorized scope, record classification on each credential.
CREATE TABLE IF NOT EXISTS credential_schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  record_type VARCHAR(40) NOT NULL DEFAULT 'assessed_qualification' CHECK (record_type IN ('training_completion','assessed_qualification','professional_certification','external_pathway')),
  status VARCHAR(20) NOT NULL DEFAULT 'in_development' CHECK (status IN ('in_development','published','suspended','retired')),
  tagline VARCHAR(200) NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  positioning TEXT NOT NULL DEFAULT '',
  focus JSONB NOT NULL DEFAULT '[]',
  pending JSONB NOT NULL DEFAULT '[]',
  sort INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Rules (eligibility, assessment, validity, renewal, CPD) live only in an approved version; none is approved yet.
CREATE TABLE IF NOT EXISTS scheme_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id UUID NOT NULL REFERENCES credential_schemes(id) ON DELETE CASCADE,
  version VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  notes TEXT NOT NULL DEFAULT '',
  qms_document_id UUID,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scheme_id, version)
);
CREATE TABLE IF NOT EXISTS partner_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  scheme_id UUID REFERENCES credential_schemes(id),
  title VARCHAR(200) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','withdrawn')),
  granted_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on DATE,
  decision_note VARCHAR(500) NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_scopes_platform ON partner_scopes(platform_id, status);
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS record_type VARCHAR(40) NOT NULL DEFAULT 'training_completion';
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_record_type_check;
ALTER TABLE certificates ADD CONSTRAINT certificates_record_type_check CHECK (record_type IN ('training_completion','assessed_qualification','professional_certification'));
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS scheme_id UUID REFERENCES credential_schemes(id);
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS partner_scope_id UUID REFERENCES partner_scopes(id);
-- Issuance-time evidence (docs/PARTNER-AUTHORIZATION.md §8): the partner's and the scope's status when the credential was issued.
-- Written once at issuance and never updated; NULL on older records means "not recorded", never today's status.
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS issued_partner_status VARCHAR(20);
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS issued_scope_status VARCHAR(20);
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS issued_scope_granted_on DATE;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS issued_scope_ends_on DATE;

-- Knowledge authority: broader topics, more content types, jurisdiction.
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_category_check;
ALTER TABLE articles ADD CONSTRAINT articles_category_check CHECK (category IN ('governance','hse-governance','safety','quality','environment','qhse','project-management','project-governance','pmo-governance','project-information-governance','professional-credentialing','assessment-competence','standards','compliance','gcc-workforce'));
ALTER TABLE articles ADD COLUMN IF NOT EXISTS jurisdiction VARCHAR(80) NOT NULL DEFAULT '';

-- Durable files (Phase 0): credential PDFs and partner logos, so they survive redeploys and are in database backups.
-- Written once: an issued credential keeps its exact bytes. Deletion stays possible for demo data only (scripts/purge-demo.js).
CREATE TABLE IF NOT EXISTS stored_files (
  key TEXT PRIMARY KEY,                    -- the relative path kept on the record, e.g. pdfs/<partner>/<credential>.pdf
  content BYTEA NOT NULL,
  sha256 CHAR(64) NOT NULL,
  bytes INT NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION stored_files_write_once() RETURNS trigger AS $f$
BEGIN RAISE EXCEPTION 'stored_files rows are written once and cannot be changed'; END $f$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS stored_files_no_update ON stored_files;
CREATE TRIGGER stored_files_no_update BEFORE UPDATE ON stored_files FOR EACH ROW EXECUTE FUNCTION stored_files_write_once();

-- Partner applications (docs/PARTNER-AUTHORIZATION.md §2-§4, §11; Batch D). Data model only: screens come in Batches E and F.
-- An application keeps numbered, locked versions with their evidence. A submitted version, its evidence and the event
-- history are never changed; a correction is a new version. Rows go only when their partner record is removed (cascade).
-- Retention periods are pending decision P-14; the criteria transition rule is pending decision P-9.
CREATE TABLE IF NOT EXISTS partner_criteria_sets (
  version VARCHAR(20) PRIMARY KEY,            -- e.g. v0.1 (PA-CRIT)
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_force','retired')),
  criteria JSONB NOT NULL,                    -- [{code, title, if_not_met}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS partner_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  state VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','completeness_check','info_requested','technical_review','corrective_action','awaiting_decision','accepted_pending_activation','activated','declined','withdrawn','closed')),
  criteria_version VARCHAR(20) NOT NULL REFERENCES partner_criteria_sets(version),
  draft JSONB NOT NULL DEFAULT '{}'::jsonb,   -- the applicant's working copy; editable only while the applicant holds the application
  current_version INT NOT NULL DEFAULT 0,     -- last submitted version (0 = never submitted)
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
-- One open application per partner; declined, withdrawn and closed are final and a new application is a new record.
-- 'activated' was added in Batch E: older databases get the wider list, and the open-application index is rebuilt to match.
ALTER TABLE partner_applications DROP CONSTRAINT IF EXISTS partner_applications_state_check;
ALTER TABLE partner_applications ADD CONSTRAINT partner_applications_state_check CHECK (state IN ('draft','submitted','completeness_check','info_requested','technical_review','corrective_action','awaiting_decision','accepted_pending_activation','activated','declined','withdrawn','closed'));
DROP INDEX IF EXISTS idx_partner_applications_open;
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_applications_open ON partner_applications(platform_id) WHERE state NOT IN ('activated','declined','withdrawn','closed');
CREATE TABLE IF NOT EXISTS partner_application_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  version INT NOT NULL,
  form JSONB NOT NULL,
  criteria_version VARCHAR(20) NOT NULL,
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (application_id, version)
);
CREATE TABLE IF NOT EXISTS partner_application_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  version INT,                                -- NULL while in the draft; set once when the version is submitted
  criterion VARCHAR(4) NOT NULL CHECK (criterion IN ('C1','C2','C3','C4','C5','C6','C7','C8','C9')),
  file_key TEXT NOT NULL,                     -- private key in stored_files; never a public URL
  filename VARCHAR(200) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  bytes INT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  supersedes_id UUID REFERENCES partner_application_evidence(id),
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_app_evidence ON partner_application_evidence(application_id, version);
CREATE TABLE IF NOT EXISTS partner_application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  from_state VARCHAR(30),
  to_state VARCHAR(30) NOT NULL,
  version INT,
  actor_user_id UUID REFERENCES users(id),
  actor_label VARCHAR(200),
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()   -- not now(): several events in one transaction keep their order
);
CREATE INDEX IF NOT EXISTS idx_partner_app_events ON partner_application_events(application_id, created_at);
-- Locks. pg_trigger_depth() > 1 means the delete cascades from removing the partner record (the only allowed path).
CREATE OR REPLACE FUNCTION partner_app_locked() RETURNS trigger AS $f$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  -- The preview reset (src/lib/preview.js) deletes only preview-account rows, inside a transaction that sets this flag.
  IF TG_OP = 'DELETE' AND current_setting('liv.preview_reset', true) = 'on' THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME = 'partner_application_evidence' THEN
    IF TG_OP = 'DELETE' AND OLD.version IS NULL THEN RETURN OLD; END IF;
    IF TG_OP = 'UPDATE' AND OLD.version IS NULL AND NEW.version IS NOT NULL
       AND (NEW.application_id, NEW.criterion, NEW.file_key, NEW.filename, NEW.content_type, NEW.bytes, NEW.sha256, NEW.supersedes_id, NEW.uploaded_by, NEW.created_at)
       IS NOT DISTINCT FROM (OLD.application_id, OLD.criterion, OLD.file_key, OLD.filename, OLD.content_type, OLD.bytes, OLD.sha256, OLD.supersedes_id, OLD.uploaded_by, OLD.created_at)
    THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION '% rows are locked once submitted and cannot be changed or deleted', TG_TABLE_NAME;
END $f$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS partner_app_versions_lock ON partner_application_versions;
CREATE TRIGGER partner_app_versions_lock BEFORE UPDATE OR DELETE ON partner_application_versions FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
DROP TRIGGER IF EXISTS partner_app_events_lock ON partner_application_events;
CREATE TRIGGER partner_app_events_lock BEFORE UPDATE OR DELETE ON partner_application_events FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
DROP TRIGGER IF EXISTS partner_app_evidence_lock ON partner_application_evidence;
CREATE TRIGGER partner_app_evidence_lock BEFORE UPDATE OR DELETE ON partner_application_evidence FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
-- Title (course) requests (F2; docs/PARTNER-AUTHORIZATION.md §4.2). A provider asks to deliver a title for LIV credentials. Granting outcomes
-- (authorize, refuse) are decided by the Authorization Decision-Maker, a different person from the reviewer; the other outcomes
-- (changes, wider review, scope expansion) are returned by the reviewer. An authorized title becomes an authorized scope row.
CREATE TABLE IF NOT EXISTS partner_title_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','awaiting_decision','needs_changes','needs_wider_review','needs_scope_expansion','authorized','refused','withdrawn')),
  form JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision INT NOT NULL DEFAULT 0,
  reviewer_id UUID REFERENCES users(id),
  reviewer_label VARCHAR(200),
  recommendation VARCHAR(20) CHECK (recommendation IN ('authorize','changes','wider_review','scope_expansion','refuse')),
  review_note TEXT,
  decided_by UUID REFERENCES users(id),
  decided_by_label VARCHAR(200),
  decision_reason TEXT,
  decided_at TIMESTAMPTZ,
  scope_id UUID REFERENCES partner_scopes(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_title_open ON partner_title_requests(platform_id, lower(title)) WHERE status NOT IN ('refused','withdrawn');
CREATE TABLE IF NOT EXISTS partner_title_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES partner_title_requests(id) ON DELETE CASCADE,
  revision INT NOT NULL,
  form JSONB NOT NULL,
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (request_id, revision)
);
CREATE TABLE IF NOT EXISTS partner_title_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES partner_title_requests(id) ON DELETE CASCADE,
  to_status VARCHAR(24) NOT NULL,
  visible BOOLEAN NOT NULL DEFAULT true,       -- false for the reviewer's internal recommendation
  actor_label VARCHAR(200),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
-- Scope expansion requests share the title request workflow (kind = 'expansion'); an authorized expansion records a capability.
ALTER TABLE partner_title_requests ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'title' CHECK (kind IN ('title','expansion'));
DROP INDEX IF EXISTS idx_partner_title_open;
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_title_open ON partner_title_requests(platform_id, kind, lower(title)) WHERE status NOT IN ('refused','withdrawn');
CREATE TABLE IF NOT EXISTS partner_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('subfield','delivery_mode','platform_or_site')),
  description VARCHAR(200) NOT NULL,
  request_id UUID REFERENCES partner_title_requests(id),
  granted_on DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Trainers added after authorization: a provider submits a trainer with a document; the reviewer accepts (a trainer record per chosen scope) or returns it.
CREATE TABLE IF NOT EXISTS partner_trainer_additions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  trainer_name VARCHAR(200) NOT NULL,
  qualifications TEXT NOT NULL,
  experience TEXT NOT NULL,
  delivery_competence TEXT NOT NULL,
  scope_ids UUID[] NOT NULL DEFAULT '{}',
  file_key TEXT NOT NULL,
  filename VARCHAR(200) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  bytes INT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','accepted','refused','needs_more','withdrawn')),
  reviewer_id UUID REFERENCES users(id),
  reviewer_label VARCHAR(200),
  finding TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS partner_trainer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  addition_id UUID NOT NULL REFERENCES partner_trainer_additions(id) ON DELETE CASCADE,
  to_status VARCHAR(12) NOT NULL,
  actor_label VARCHAR(200),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
DROP TRIGGER IF EXISTS partner_trainer_events_lock ON partner_trainer_events;
CREATE TRIGGER partner_trainer_events_lock BEFORE UPDATE OR DELETE ON partner_trainer_events FOR EACH ROW EXECUTE FUNCTION partner_app_locked();

-- Policy exceptions: prepared by staff, approved only by the main account (the super admin account without a staff position),
-- for one rule, one case and a bounded time or number of uses. History is locked.
CREATE TABLE IF NOT EXISTS policy_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_type VARCHAR(40) NOT NULL,
  platform_id UUID REFERENCES platforms(id) ON DELETE SET NULL,
  rule_ref VARCHAR(200) NOT NULL,
  subject_ref VARCHAR(200) NOT NULL,
  reason TEXT NOT NULL, why_not_standard TEXT NOT NULL, evidence TEXT NOT NULL, impact TEXT NOT NULL, limits TEXT NOT NULL,
  executor VARCHAR(200) NOT NULL, closing_conditions TEXT NOT NULL, specialist_opinion TEXT,
  valid_from DATE NOT NULL, valid_until DATE NOT NULL, max_uses INT NOT NULL DEFAULT 1, uses INT NOT NULL DEFAULT 0,
  status VARCHAR(12) NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','approved','refused','used','closed','expired','withdrawn')),
  prepared_by UUID REFERENCES users(id), decided_by UUID REFERENCES users(id), decided_at TIMESTAMPTZ, decision_reason TEXT, closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_until >= valid_from)
);
CREATE TABLE IF NOT EXISTS policy_exception_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id UUID NOT NULL REFERENCES policy_exceptions(id) ON DELETE CASCADE,
  to_status VARCHAR(12) NOT NULL,
  actor_label VARCHAR(200),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
DROP TRIGGER IF EXISTS policy_exception_events_lock ON policy_exception_events;
CREATE TRIGGER policy_exception_events_lock BEFORE UPDATE OR DELETE ON policy_exception_events FOR EACH ROW EXECUTE FUNCTION partner_app_locked();

-- Partnership levels (docs/PARTNER-LEVELS.md): Bronze, Silver, Gold. The level is stored on the provider and changes only by a recorded
-- review decision. A public number is assigned when a provider first becomes active, together with the starting level (Bronze).
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS level VARCHAR(8) CHECK (level IN ('bronze','silver','gold'));
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS level_since DATE;
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS public_number VARCHAR(12) UNIQUE;
CREATE SEQUENCE IF NOT EXISTS partner_number_seq START 1;
CREATE OR REPLACE FUNCTION platform_active_defaults() RETURNS trigger AS $f$
BEGIN
  IF NEW.accreditation_status = 'active' THEN
    IF NEW.public_number IS NULL THEN NEW.public_number := 'ATP-' || lpad(nextval('partner_number_seq')::text, 4, '0'); END IF;
    IF NEW.level IS NULL THEN NEW.level := 'bronze'; NEW.level_since := CURRENT_DATE; END IF;
  END IF;
  RETURN NEW;
END $f$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS platforms_active_defaults ON platforms;
CREATE TRIGGER platforms_active_defaults BEFORE INSERT OR UPDATE OF accreditation_status ON platforms FOR EACH ROW EXECUTE FUNCTION platform_active_defaults();
UPDATE platforms SET accreditation_status = accreditation_status WHERE accreditation_status = 'active' AND (public_number IS NULL OR level IS NULL);
CREATE TABLE IF NOT EXISTS partner_level_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  from_level VARCHAR(8) NOT NULL,
  to_level VARCHAR(8) NOT NULL,
  requested_by VARCHAR(10) NOT NULL CHECK (requested_by IN ('provider','liv')),
  status VARCHAR(18) NOT NULL DEFAULT 'open' CHECK (status IN ('open','awaiting_decision','decided','withdrawn')),
  criteria JSONB,
  recommendation VARCHAR(10) CHECK (recommendation IN ('promote','not_yet','demote')),
  reviewer_id UUID REFERENCES users(id), reviewer_label VARCHAR(200), review_note TEXT,
  outcome VARCHAR(10) CHECK (outcome IN ('promoted','not_yet','demoted')),
  decided_by UUID REFERENCES users(id), decided_by_label VARCHAR(200), decision_reason TEXT, decided_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_level_review_open ON partner_level_reviews(platform_id) WHERE status IN ('open','awaiting_decision');

-- Email foundation (task 2.1): every message is queued, sent by a worker with retries, and kept for audit. Messages to a
-- suppressed address are recorded as suppressed and never sent. A dedupe key makes a retried event send only once.
CREATE TABLE IF NOT EXISTS email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email VARCHAR(255) NOT NULL,
  to_name VARCHAR(200),
  template VARCHAR(60) NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  html_body TEXT NOT NULL,
  platform_id UUID REFERENCES platforms(id) ON DELETE SET NULL,
  dedupe_key VARCHAR(200) UNIQUE,
  status VARCHAR(12) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','suppressed')),
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_queue ON email_outbox(status, next_attempt_at);
CREATE TABLE IF NOT EXISTS email_suppressions (
  email VARCHAR(255) PRIMARY KEY,               -- lower case
  reason VARCHAR(30) NOT NULL DEFAULT 'manual' CHECK (reason IN ('manual','bounce','complaint')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Staged application (Batch F2): contact phone captured at sign-up; the application fee invoice is linked to the application.
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(40);
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS fee_invoice_id UUID REFERENCES invoices(id);
-- Assessment, recommendation and decision (Batch E). Every row is locked once written (same trigger as above):
-- a re-assessment is a new assessment, a recalculation is a new recommendation, and nothing is edited in place.
-- input_hash fingerprints everything a recommendation was computed from; a decision is refused if it no longer matches.
CREATE TABLE IF NOT EXISTS partner_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  version INT NOT NULL,                       -- the submitted application version that was assessed
  criteria_version VARCHAR(20) NOT NULL,
  assessor_user_id UUID NOT NULL REFERENCES users(id),
  assessor_label VARCHAR(200) NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_partner_assessments_app ON partner_assessments(application_id, created_at);
CREATE TABLE IF NOT EXISTS partner_assessment_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES partner_assessments(id) ON DELETE CASCADE,
  criterion VARCHAR(4) NOT NULL CHECK (criterion IN ('C1','C2','C3','C4','C5','C6','C7','C8','C9')),
  result VARCHAR(20) NOT NULL CHECK (result IN ('met','minor','major','needs_information')),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  evidence_id UUID REFERENCES partner_application_evidence(id),
  UNIQUE (assessment_id, criterion)
);
CREATE TABLE IF NOT EXISTS partner_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES partner_assessments(id) ON DELETE CASCADE,
  outcome VARCHAR(30) NOT NULL CHECK (outcome IN ('accept','accept_with_conditions','not_ready','incomplete')),
  rationale JSONB NOT NULL,
  input_hash CHAR(64) NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS partner_application_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  recommendation_id UUID NOT NULL REFERENCES partner_recommendations(id),
  outcome VARCHAR(30) NOT NULL CHECK (outcome IN ('accepted','accepted_with_conditions','declined')),
  reasons TEXT NOT NULL CHECK (length(btrim(reasons)) > 0),
  criteria_version VARCHAR(20) NOT NULL,
  version INT NOT NULL,
  decided_by UUID NOT NULL REFERENCES users(id),
  decided_by_label VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS partner_application_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES partner_application_decisions(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (length(btrim(text)) > 0),
  blocking BOOLEAN NOT NULL,
  due_date DATE
);
DROP TRIGGER IF EXISTS partner_assessments_lock ON partner_assessments;
CREATE TRIGGER partner_assessments_lock BEFORE UPDATE OR DELETE ON partner_assessments FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
DROP TRIGGER IF EXISTS partner_findings_lock ON partner_assessment_findings;
CREATE TRIGGER partner_findings_lock BEFORE UPDATE OR DELETE ON partner_assessment_findings FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
DROP TRIGGER IF EXISTS partner_recommendations_lock ON partner_recommendations;
CREATE TRIGGER partner_recommendations_lock BEFORE UPDATE OR DELETE ON partner_recommendations FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
DROP TRIGGER IF EXISTS partner_decisions_lock ON partner_application_decisions;
CREATE TRIGGER partner_decisions_lock BEFORE UPDATE OR DELETE ON partner_application_decisions FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
DROP TRIGGER IF EXISTS partner_conditions_lock ON partner_application_conditions;
CREATE TRIGGER partner_conditions_lock BEFORE UPDATE OR DELETE ON partner_application_conditions FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
-- Staff positions (Batch E). A position carries the permission; a person holds it through an account. Until people are
-- appointed, each position has a vacant account that cannot sign in. Assessing, deciding and activating are separate
-- positions, and the server checks the position, not only the screen. Accounts without a position (the owner admin) cannot do these three things.
CREATE TABLE IF NOT EXISTS staff_positions (
  code VARCHAR(40) PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  can_assess BOOLEAN NOT NULL DEFAULT false,
  can_decide BOOLEAN NOT NULL DEFAULT false,
  can_activate BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO staff_positions (code, title, description, can_assess, can_decide, can_activate) VALUES
  ('application_assessor', 'Application Assessor', 'Reviews applications against the criteria, records findings, trainer records and condition checks. Cannot decide or activate.', true, false, false),
  ('authorization_decision_maker', 'Authorization Decision-Maker', 'Decides accept, accept with conditions or decline, and may reverse a decision before activation. Cannot assess or activate.', false, true, false),
  ('activation_officer', 'Activation Officer', 'Confirms the activation checklist and the test issuance, then activates the provider. Cannot assess or decide.', false, false, true)
ON CONFLICT (code) DO NOTHING;
INSERT INTO staff_positions (code, title, description, can_assess, can_decide, can_activate) VALUES
  ('partner_relations', 'Partner Relations Coordinator', 'First contact for enquiries and applicants: answers questions, follows each application and keeps applicants informed. Cannot assess, decide or activate.', false, false, false)
ON CONFLICT (code) DO NOTHING;
ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_position VARCHAR(40) REFERENCES staff_positions(code);
ALTER TABLE users ADD COLUMN IF NOT EXISTS vacant BOOLEAN NOT NULL DEFAULT false;

-- Trainer record per scope (criterion C3): an evidence document plus the assessor's finding. No thresholds yet (P-5).
CREATE TABLE IF NOT EXISTS partner_scope_trainers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES partner_scopes(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  trainer_name VARCHAR(200) NOT NULL CHECK (length(btrim(trainer_name)) > 0),
  evidence_id UUID NOT NULL REFERENCES partner_application_evidence(id),
  finding TEXT NOT NULL CHECK (length(btrim(finding)) > 0),
  recorded_by UUID NOT NULL REFERENCES users(id),
  recorded_by_label VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE partner_scope_trainers ALTER COLUMN application_id DROP NOT NULL;
ALTER TABLE partner_scope_trainers ALTER COLUMN evidence_id DROP NOT NULL;
ALTER TABLE partner_scope_trainers ADD COLUMN IF NOT EXISTS addition_id UUID REFERENCES partner_trainer_additions(id);
CREATE TABLE IF NOT EXISTS partner_condition_closures (
  condition_id UUID PRIMARY KEY REFERENCES partner_application_conditions(id) ON DELETE CASCADE,
  note TEXT NOT NULL CHECK (length(btrim(note)) > 0),
  closed_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS partner_activation_confirmations (
  application_id UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  item VARCHAR(30) NOT NULL CHECK (item IN ('test_issuance')),
  note TEXT NOT NULL CHECK (length(btrim(note)) > 0),
  confirmed_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (application_id, item)
);
CREATE TABLE IF NOT EXISTS partner_activations (
  application_id UUID PRIMARY KEY REFERENCES partner_applications(id) ON DELETE CASCADE,
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  checklist JSONB NOT NULL,
  activated_by UUID NOT NULL REFERENCES users(id),
  activated_by_label VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
-- A reversal of an acceptance (before activation) is a new decision that points at the one it replaces.
ALTER TABLE partner_application_decisions ADD COLUMN IF NOT EXISTS supersedes_id UUID REFERENCES partner_application_decisions(id);
DROP TRIGGER IF EXISTS partner_trainers_lock ON partner_scope_trainers;
CREATE TRIGGER partner_trainers_lock BEFORE UPDATE OR DELETE ON partner_scope_trainers FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
DROP TRIGGER IF EXISTS partner_closures_lock ON partner_condition_closures;
CREATE TRIGGER partner_closures_lock BEFORE UPDATE OR DELETE ON partner_condition_closures FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
DROP TRIGGER IF EXISTS partner_confirmations_lock ON partner_activation_confirmations;
CREATE TRIGGER partner_confirmations_lock BEFORE UPDATE OR DELETE ON partner_activation_confirmations FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
DROP TRIGGER IF EXISTS partner_activations_lock ON partner_activations;
CREATE TRIGGER partner_activations_lock BEFORE UPDATE OR DELETE ON partner_activations FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
DROP TRIGGER IF EXISTS partner_title_revisions_lock ON partner_title_revisions;
CREATE TRIGGER partner_title_revisions_lock BEFORE UPDATE OR DELETE ON partner_title_revisions FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
DROP TRIGGER IF EXISTS partner_title_events_lock ON partner_title_events;
CREATE TRIGGER partner_title_events_lock BEFORE UPDATE OR DELETE ON partner_title_events FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
-- Batch H (docs/DECISIONS.md §7). Monitoring, renewals, material-change notices, sanctions screening and records retention.
-- An upload that is refused (no valid rows, or issuance refused) is recorded; these rows feed the monitoring indicators.
CREATE TABLE IF NOT EXISTS issuance_refusals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  source VARCHAR(10) NOT NULL CHECK (source IN ('csv','api')),
  file_name VARCHAR(255),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS issuance_refusals_platform_idx ON issuance_refusals (platform_id, created_at);
-- Monitoring cases opened by an indicator. The system opens them; a person responds, then closes them. A case never
-- revokes a credential or changes an authorization. Response and escalation deadlines are 5 and 10 working days.
CREATE TABLE IF NOT EXISTS partner_audit_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no VARCHAR(20) NOT NULL UNIQUE,
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  trigger_code VARCHAR(30) NOT NULL CHECK (trigger_code IN ('volume_spike','half_allowance','refused_batches','complaints')),
  source_ref VARCHAR(120) NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open','responded','escalated','closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_due DATE NOT NULL,
  escalate_due DATE NOT NULL,
  response TEXT NOT NULL DEFAULT '',
  responded_at TIMESTAMPTZ,
  outcome VARCHAR(20) CHECK (outcome IN ('no_action','corrective_action','referred_to_review')),
  closing_note TEXT NOT NULL DEFAULT '',
  closed_at TIMESTAMPTZ,
  closed_by_label VARCHAR(200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform_id, trigger_code, source_ref)
);
CREATE TABLE IF NOT EXISTS partner_audit_events (
  id BIGSERIAL PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES partner_audit_cases(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  actor_label VARCHAR(200) NOT NULL DEFAULT 'system',
  event VARCHAR(30) NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
DROP TRIGGER IF EXISTS partner_audit_events_lock ON partner_audit_events;
CREATE TRIGGER partner_audit_events_lock BEFORE UPDATE OR DELETE ON partner_audit_events FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
-- Renewals: the due date is set by staff; the renewal period is pending decision P-11, so none is calculated.
CREATE TABLE IF NOT EXISTS partner_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  due_on DATE NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','renewed','lapsed')),
  note TEXT NOT NULL DEFAULT '',
  set_by_label VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by_label VARCHAR(200)
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_renewals_one_open ON partner_renewals (platform_id) WHERE status = 'scheduled';
-- Material-change notices from a provider. The categories and what counts as material are pending decision P-12.
CREATE TABLE IF NOT EXISTS partner_material_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  change_kind VARCHAR(30) NOT NULL CHECK (change_kind IN ('legal_entity','ownership_or_control','contact_or_address','trainers','courses_or_scope','delivery_method','other')),
  description TEXT NOT NULL,
  effective_on DATE,
  status VARCHAR(16) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','acknowledged','review_opened')),
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_by_label VARCHAR(200) NOT NULL DEFAULT '',
  handled_at TIMESTAMPTZ,
  handling_note TEXT NOT NULL DEFAULT ''
);
-- Sanctions screening record: append-only (a later check is recorded as a new row).
CREATE TABLE IF NOT EXISTS partner_sanctions_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  list_name VARCHAR(200) NOT NULL,
  checked_on DATE NOT NULL,
  result VARCHAR(16) NOT NULL CHECK (result IN ('no_match','possible_match','match')),
  checked_by_label VARCHAR(200) NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS partner_sanctions_lock ON partner_sanctions_checks;
CREATE TRIGGER partner_sanctions_lock BEFORE UPDATE OR DELETE ON partner_sanctions_checks FOR EACH ROW EXECUTE FUNCTION partner_app_locked();
-- Provider-entered public details (optional), shown in the directory as information the provider states (October 20 decision).
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS public_city VARCHAR(120);
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS public_domain VARCHAR(200);
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS public_delivery VARCHAR(200);
-- A lapsed renewal is reviewed by the decision-maker; the review clears the work-queue item. It never changes the provider status.
ALTER TABLE partner_renewals ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE partner_renewals ADD COLUMN IF NOT EXISTS reviewed_by_label VARCHAR(200);
-- Public profile changes (October 20, 2026): a provider's changes wait for review; the published values stay until approval.
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS public_about TEXT;
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS public_social TEXT;
CREATE TABLE IF NOT EXISTS provider_profile_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  fields JSONB NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by_label VARCHAR(200),
  decided_at TIMESTAMPTZ,
  decision_note TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS provider_profile_one_pending ON provider_profile_revisions (platform_id) WHERE status = 'pending';
-- Scope details recorded by LIV (decision-maker). Each change raises the revision; the audit log keeps before and after.
ALTER TABLE partner_scopes ADD COLUMN IF NOT EXISTS scope_number VARCHAR(30);
ALTER TABLE partner_scopes ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT '';
ALTER TABLE partner_scopes ADD COLUMN IF NOT EXISTS boundaries TEXT NOT NULL DEFAULT '';
ALTER TABLE partner_scopes ADD COLUMN IF NOT EXISTS restrictions TEXT NOT NULL DEFAULT '';
ALTER TABLE partner_scopes ADD COLUMN IF NOT EXISTS delivery_methods TEXT NOT NULL DEFAULT '';
ALTER TABLE partner_scopes ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1;
-- Branches and sites: requested by the provider, shown only after LIV approves, and each branch covers only the scopes approved for it.
CREATE TABLE IF NOT EXISTS partner_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  city VARCHAR(120) NOT NULL DEFAULT '',
  country VARCHAR(100) NOT NULL DEFAULT '',
  status VARCHAR(12) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','refused','withdrawn')),
  requested_by UUID REFERENCES users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by_label VARCHAR(200),
  decided_at TIMESTAMPTZ,
  decision_note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS partner_branch_scopes (
  branch_id UUID NOT NULL REFERENCES partner_branches(id) ON DELETE CASCADE,
  scope_id UUID NOT NULL REFERENCES partner_scopes(id) ON DELETE CASCADE,
  delivery_methods TEXT NOT NULL DEFAULT '',
  approved BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (branch_id, scope_id)
);
INSERT INTO partner_criteria_sets (version, status, criteria) VALUES ('v0.1', 'draft', '[
  {"code":"C1","title":"Legal entity and accountability","if_not_met":"major"},
  {"code":"C2","title":"Training management","if_not_met":"major"},
  {"code":"C3","title":"Trainer eligibility (required for activation)","if_not_met":"major"},
  {"code":"C4","title":"Course content","if_not_met":"major or minor"},
  {"code":"C5","title":"Delivery","if_not_met":"major"},
  {"code":"C6","title":"Completion and learning assessment","if_not_met":"major"},
  {"code":"C7","title":"Learner protection","if_not_met":"major"},
  {"code":"C8","title":"Records and data","if_not_met":"major"},
  {"code":"C9","title":"Integrity and marketing","if_not_met":"minor, or major for a misleading claim"}
]'::jsonb) ON CONFLICT (version) DO NOTHING;

-- Individuals portal (M1, October 22, 2026): individual accounts, email verification, credential claims, support link.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin','platform_admin','individual'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_scope_check;
ALTER TABLE users ADD CONSTRAINT users_scope_check CHECK ((role = 'super_admin' AND platform_id IS NULL) OR (role = 'platform_admin' AND platform_id IS NOT NULL) OR (role = 'individual' AND platform_id IS NULL));
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS closure_requested_at TIMESTAMPTZ;
-- Extra addresses a person proves they control, used only to find their credentials.
CREATE TABLE IF NOT EXISTS individual_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_individual_email_verified ON individual_emails (lower(email)) WHERE verified_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_individual_email_per_user ON individual_emails (user_id, lower(email));
-- One-time tokens (verification, extra address, password reset). Only a hash is kept.
CREATE TABLE IF NOT EXISTS individual_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('verify_email','extra_email','password_reset')),
  email VARCHAR(255) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A credential linked to a person. The certificate row, its hash and its PDF are never changed by a link.
CREATE TABLE IF NOT EXISTS credential_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id UUID NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method VARCHAR(20) NOT NULL CHECK (method IN ('email_match','staff_review')),
  request_id UUID,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  released_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_credential_claim_active ON credential_claims (certificate_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_credential_claim_user ON credential_claims (user_id) WHERE released_at IS NULL;
-- Requests reviewed by LIV staff when the recorded email is not one of the person's addresses.
CREATE TABLE IF NOT EXISTS credential_claim_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cert_number VARCHAR(20) NOT NULL,
  statement TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','refused','withdrawn')),
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_claim_request_open ON credential_claim_requests (user_id, cert_number) WHERE status = 'submitted';
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Preview accounts (October 22, 2026): a preview training provider and preview individuals that the main account opens to
-- check new features. They never appear in the public register, and their records verify as "preview record", never as credentials.
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS is_preview BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_preview BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_preview_platform ON platforms ((true)) WHERE is_preview;
CREATE TABLE IF NOT EXISTS preview_checks (
  id BIGSERIAL PRIMARY KEY,
  area VARCHAR(80) NOT NULL,
  result VARCHAR(10) NOT NULL CHECK (result IN ('pass','fail','note')),
  detail TEXT NOT NULL DEFAULT '',
  automatic BOOLEAN NOT NULL DEFAULT false,
  run_id UUID,
  checked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individuals portal M2 (October 22, 2026): membership plans with locked, versioned terms; memberships; invoices for individuals.
-- A membership is never a credential and never affects eligibility, assessment or a credential's validity.
ALTER TABLE invoices ALTER COLUMN platform_id DROP NOT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_owner_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_owner_check CHECK ((platform_id IS NOT NULL) <> (user_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  audience VARCHAR(300) NOT NULL DEFAULT '',
  kind VARCHAR(12) NOT NULL DEFAULT 'individual' CHECK (kind IN ('individual','group')),
  status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','on_sale','withdrawn')),
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS membership_plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES membership_plans(id) ON DELETE CASCADE,
  version INT NOT NULL,
  price_cents INT CHECK (price_cents IS NULL OR price_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  period_months INT CHECK (period_months IS NULL OR period_months BETWEEN 1 AND 60),
  benefits JSONB NOT NULL DEFAULT '[]',
  terms TEXT NOT NULL DEFAULT '',
  requires_student_check BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','superseded')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version)
);
-- An approved version is fixed: only its status may move to superseded.
CREATE OR REPLACE FUNCTION membership_version_locked() RETURNS trigger AS $f$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' AND pg_trigger_depth() = 1 THEN RAISE EXCEPTION 'An approved plan version cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (NEW.price_cents IS DISTINCT FROM OLD.price_cents OR NEW.period_months IS DISTINCT FROM OLD.period_months
     OR NEW.benefits IS DISTINCT FROM OLD.benefits OR NEW.terms IS DISTINCT FROM OLD.terms OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.requires_student_check IS DISTINCT FROM OLD.requires_student_check) THEN
    RAISE EXCEPTION 'An approved plan version cannot be changed; create a new version';
  END IF;
  RETURN NEW;
END $f$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS membership_version_locked ON membership_plan_versions;
CREATE TRIGGER membership_version_locked BEFORE UPDATE OR DELETE ON membership_plan_versions FOR EACH ROW EXECUTE FUNCTION membership_version_locked();
CREATE SEQUENCE IF NOT EXISTS member_number_seq START 1;
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_version_id UUID NOT NULL REFERENCES membership_plan_versions(id),
  member_number VARCHAR(16) NOT NULL,
  source VARCHAR(10) NOT NULL CHECK (source IN ('paid','gift','trial','grant')),
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending_payment','active','past_due','expired','suspended','void')),
  terms JSONB NOT NULL,                      -- plan name, price, period, benefits and terms as shown when the membership was taken
  price_cents INT NOT NULL DEFAULT 0,
  invoice_id UUID UNIQUE REFERENCES invoices(id),
  renewed_from UUID REFERENCES memberships(id),
  starts_on DATE,
  ends_on DATE,
  renewal_declined_at TIMESTAMPTZ,           -- the member said they will not renew; the paid period is unchanged
  suspended_reason TEXT,
  is_preview BOOLEAN NOT NULL DEFAULT false,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_one_pending ON memberships(user_id) WHERE status = 'pending_payment';
CREATE TABLE IF NOT EXISTS membership_events (
  id BIGSERIAL PRIMARY KEY,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  event VARCHAR(30) NOT NULL,
  actor_label VARCHAR(255),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS card_show_name BOOLEAN NOT NULL DEFAULT false;

-- Individuals portal M3 (October 23, 2026): member resources and purchases, communication consents, newsletter issues,
-- community events and contributions. Nothing here grants a credential, a qualification or CPD units.
CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(120) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  summary VARCHAR(600) NOT NULL DEFAULT '',
  kind VARCHAR(20) NOT NULL DEFAULT 'guide' CHECK (kind IN ('guide','template','checklist','article','tool','preparation')),
  access VARCHAR(10) NOT NULL DEFAULT 'free' CHECK (access IN ('free','members','purchase')),
  body_md TEXT NOT NULL DEFAULT '',
  file_key TEXT,
  file_name VARCHAR(200),
  author_name VARCHAR(200) NOT NULL DEFAULT '',
  scheme_id UUID REFERENCES credential_schemes(id),
  price_cents INT CHECK (price_cents IS NULL OR price_cents >= 0),
  member_price_cents INT CHECK (member_price_cents IS NULL OR member_price_cents >= 0),
  access_months INT CHECK (access_months IS NULL OR access_months BETWEEN 1 AND 120),
  status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','published','retired')),
  version INT NOT NULL DEFAULT 1,
  created_by UUID REFERENCES users(id),
  submitted_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  sale_approved_by UUID REFERENCES users(id),
  sale_approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS resource_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id),
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending_payment','active','void')),
  price_cents INT NOT NULL,
  member_price_applied BOOLEAN NOT NULL DEFAULT false,
  terms JSONB NOT NULL,
  invoice_id UUID UNIQUE REFERENCES invoices(id),
  access_until DATE,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resource_purchase_pending ON resource_purchases(user_id, resource_id) WHERE status = 'pending_payment';
ALTER TABLE users ADD COLUMN IF NOT EXISTS newsletter_opt_in BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS newsletter_topics TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS comm_token CHAR(32);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_comm_token ON users(comm_token) WHERE comm_token IS NOT NULL;
-- Every consent change, with its source and the exact text shown. Append-only by design of the code.
CREATE TABLE IF NOT EXISTS communication_consents (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(12) NOT NULL CHECK (channel IN ('newsletter','offers')),
  granted BOOLEAN NOT NULL,
  source VARCHAR(40) NOT NULL,
  text_shown TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS newsletter_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject VARCHAR(200) NOT NULL,
  body_md TEXT NOT NULL,
  topics TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','queued')),
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  queued_at TIMESTAMPTZ,
  recipients INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  mode VARCHAR(10) NOT NULL DEFAULT 'online' CHECK (mode IN ('online','in_person')),
  location VARCHAR(300) NOT NULL DEFAULT '',
  join_url VARCHAR(500) NOT NULL DEFAULT '',
  capacity INT CHECK (capacity IS NULL OR capacity > 0),
  audience VARCHAR(10) NOT NULL DEFAULT 'account' CHECK (audience IN ('public','account','members')),
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE TABLE IF NOT EXISTS event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(10) NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','cancelled','attended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(12) NOT NULL CHECK (kind IN ('article','tool','case_study','other')),
  title VARCHAR(200) NOT NULL,
  summary TEXT NOT NULL,
  show_name BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(10) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','accepted','declined','withdrawn')),
  decision_note TEXT,
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individuals portal M4 (October 23, 2026): gifted memberships (paid gifts and LIV launch campaigns) and group packs with seats.
-- A gift or a seat gives a membership for a fixed period; it never turns into a paid subscription. Group managers handle seats,
-- invitations and invoices only, never members' credentials, results or private records.
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_source_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_source_check CHECK (source IN ('paid','gift','trial','grant','group'));
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS min_seats INT NOT NULL DEFAULT 1 CHECK (min_seats >= 1);
UPDATE membership_plans SET min_seats = 5 WHERE code = 'corporate' AND min_seats = 1;
CREATE TABLE IF NOT EXISTS gift_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  plan_id UUID NOT NULL REFERENCES membership_plans(id),
  months INT NOT NULL CHECK (months BETWEEN 1 AND 24),
  max_gifts INT NOT NULL CHECK (max_gifts BETWEEN 1 AND 10000),
  accept_by DATE NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','closed')),
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash CHAR(64) NOT NULL UNIQUE,
  code_last4 VARCHAR(4) NOT NULL,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('paid','campaign')),
  plan_id UUID NOT NULL REFERENCES membership_plans(id),
  months INT NOT NULL CHECK (months BETWEEN 1 AND 24),
  terms JSONB NOT NULL,
  buyer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES gift_campaigns(id),
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(200) NOT NULL DEFAULT '',
  price_cents INT NOT NULL DEFAULT 0,
  invoice_id UUID UNIQUE REFERENCES invoices(id),
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending_payment','issued','accepted','expired','revoked','void')),
  accept_by DATE NOT NULL,
  accepted_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS group_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_name VARCHAR(200) NOT NULL,
  plan_version_id UUID NOT NULL REFERENCES membership_plan_versions(id),
  seats INT NOT NULL CHECK (seats >= 1),
  seat_price_cents INT NOT NULL,
  terms JSONB NOT NULL,
  invoice_id UUID UNIQUE REFERENCES invoices(id),
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending_payment','active','expired','void')),
  starts_on DATE,
  ends_on DATE,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS group_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES group_packs(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(200) NOT NULL DEFAULT '',
  code_hash CHAR(64) NOT NULL UNIQUE,
  status VARCHAR(10) NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','accepted','revoked')),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_group_seat_open ON group_seats(pack_id, lower(email)) WHERE status <> 'revoked';

-- Individuals portal M5 (October 23, 2026): a free interest list for assessment programs in development. It reserves nothing,
-- is not an application, and takes no payment. Preparation products stay closed until a program operates (src/lib/resources.js).
CREATE TABLE IF NOT EXISTS program_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id UUID NOT NULL REFERENCES credential_schemes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_program_interest ON program_interest(scheme_id, lower(email));

-- Membership waitlist (owner decision, October 23, 2026): free, no payment, no reservation, no guaranteed price. People on the list
-- before a plan first goes on sale become Founding Members when they join that plan (a badge on the membership card only).
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS first_on_sale_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS membership_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES membership_plans(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(200) NOT NULL DEFAULT '',
  country VARCHAR(80) NOT NULL DEFAULT '',
  is_student BOOLEAN,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  consent_text TEXT NOT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'membership page',
  status VARCHAR(10) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','invited','joined','left')),
  leave_token CHAR(32) NOT NULL UNIQUE,
  invited_at TIMESTAMPTZ,
  invite_batch UUID,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_open ON membership_waitlist(plan_id, lower(email)) WHERE status <> 'left';

-- Staged launches (owner decision, October 23, 2026): a plan stays off the site until it is announced; one announced plan at a time
-- can be featured in the site banner; the waitlist also takes people for any future membership.
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS announced BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS banner_text VARCHAR(160) NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_featured_plan ON membership_plans ((true)) WHERE featured;
UPDATE membership_plans SET announced = true WHERE status = 'on_sale' AND NOT announced;
ALTER TABLE membership_waitlist ALTER COLUMN plan_id DROP NOT NULL;
DROP INDEX IF EXISTS uq_waitlist_open;
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_open_any ON membership_waitlist (COALESCE(plan_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email)) WHERE status <> 'left';
-- Legal documents (October 23, 2026): drafts live as files in docs/legal. Only the main account publishes one, and only when
-- no placeholder is left; publishing stores the exact approved text. Withdrawing ("back to draft") hides the public page.
-- Rows are never deleted, so every published text stays on record.
CREATE TABLE IF NOT EXISTS legal_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body_md TEXT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  published_by UUID REFERENCES users(id),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_by UUID REFERENCES users(id),
  withdrawn_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_live ON legal_publications(slug) WHERE withdrawn_at IS NULL;
-- LIV Expert Network (owner decision, October 25, 2026): applications to contribute as a curriculum expert, item writer,
-- technical reviewer, committee member or trainer. Built beside contributions. Approval records a role only: it never opens
-- an item bank or any private record; such access is granted by hand later and logged.
CREATE TABLE IF NOT EXISTS expert_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track VARCHAR(12) NOT NULL CHECK (track IN ('curriculum','item_writer','reviewer','committee','trainer')),
  domains TEXT NOT NULL,
  linkedin_url VARCHAR(300),
  education TEXT NOT NULL,
  experience TEXT NOT NULL,
  current_roles TEXT,
  conflicts TEXT,
  no_conflicts BOOLEAN NOT NULL DEFAULT false,
  confidentiality_ack BOOLEAN NOT NULL,
  privacy_text TEXT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','declined','withdrawn')),
  decision_note TEXT,
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (no_conflicts OR length(coalesce(conflicts, '')) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_expert_open ON expert_applications(user_id, track) WHERE status IN ('submitted','approved');
-- Requests for a training quote (owner decision, October 26, 2026). An organization describes its need; LIV sends it at the same
-- time to up to five Authorized Training Providers with that scope (and city when one matches), choosing those that received the
-- fewest requests in the last 90 days. Level never gives priority. LIV takes no part in the price or the contract.
CREATE TABLE IF NOT EXISTS quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name VARCHAR(200) NOT NULL,
  contact_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(40),
  scope_title VARCHAR(200) NOT NULL,
  city VARCHAR(120),
  learners INT CHECK (learners IS NULL OR learners BETWEEN 1 AND 100000),
  delivery VARCHAR(20) CHECK (delivery IN ('in_person','online','blended','any')),
  message TEXT NOT NULL DEFAULT '',
  consent_text TEXT NOT NULL,
  city_matched BOOLEAN NOT NULL DEFAULT false,
  ip_hash CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quote_request_recipients (
  request_id UUID NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, platform_id)
);
CREATE INDEX IF NOT EXISTS idx_quote_recipients_platform ON quote_request_recipients(platform_id, sent_at DESC);
`;
