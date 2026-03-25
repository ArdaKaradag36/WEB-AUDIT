-- WEB-AUDIT production queue schema (PostgreSQL 14+).
-- Apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/postgres/001_schema.sql

CREATE TABLE IF NOT EXISTS audit_jobs (
  id TEXT PRIMARY KEY,
  target_url TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  started_at BIGINT,
  finished_at BIGINT,
  run_dir TEXT NOT NULL,
  exit_code INT,
  error_message TEXT,
  external_ticket_id TEXT,
  max_links INT NOT NULL DEFAULT 35,
  max_ui_attempts INT NOT NULL DEFAULT 220,
  login_mode TEXT NOT NULL DEFAULT 'none',
  identifier TEXT,
  has_password INT NOT NULL DEFAULT 0,
  secret_payload BYTEA
);

CREATE TABLE IF NOT EXISTS audit_credentials (
  job_id TEXT PRIMARY KEY REFERENCES audit_jobs (id) ON DELETE CASCADE,
  login_mode TEXT NOT NULL,
  identifier TEXT,
  has_password INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_summary_cache (
  job_id TEXT PRIMARY KEY REFERENCES audit_jobs (id) ON DELETE CASCADE,
  findings_by_severity_json TEXT,
  pages_scanned INT,
  requests_total INT,
  skipped_network INT,
  tested_ui_elements INT NOT NULL DEFAULT 0,
  total_ui_elements INT NOT NULL DEFAULT 0,
  skipped_ui_elements INT NOT NULL DEFAULT 0,
  failed_ui_elements INT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_normalized_findings (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES audit_jobs (id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  rule_id TEXT,
  severity TEXT,
  category TEXT,
  title TEXT,
  detail TEXT,
  evidence_json JSONB,
  created_at BIGINT NOT NULL,
  UNIQUE (job_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS ix_audit_normalized_findings_job ON audit_normalized_findings (job_id);

CREATE TABLE IF NOT EXISTS immutable_audit_events (
  id BIGSERIAL PRIMARY KEY,
  seq BIGINT NOT NULL UNIQUE,
  event_ts BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT,
  subject TEXT,
  payload_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_audit_jobs_status_created ON audit_jobs (status, created_at);
