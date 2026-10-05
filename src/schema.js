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
ALTER TABLE articles ADD CONSTRAINT articles_kind_check CHECK (kind IN ('article','research','guide','standards','case-study','briefing','tool','news','glossary'));
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
`;
