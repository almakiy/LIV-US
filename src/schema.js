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

-- Certificate designs available to templates.
ALTER TABLE certificate_templates DROP CONSTRAINT IF EXISTS certificate_templates_design_check;
ALTER TABLE certificate_templates ADD CONSTRAINT certificate_templates_design_check CHECK (design IN ('classic','modern','executive'));
`;
