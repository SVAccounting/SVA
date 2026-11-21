-- ProOblik 2026-11-21: versioned rulebook. Back up Neon before execution.
-- Does not alter existing postings, documents or financial-statement values.
BEGIN;
CREATE TABLE IF NOT EXISTS accounting_rule_versions (
    id BIGSERIAL PRIMARY KEY,
    scope TEXT NOT NULL CHECK (scope IN ('posting','report')),
    rule_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active')),
    effective_from DATE,
    config JSONB NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    validated_at TIMESTAMPTZ,
    activated_by INTEGER REFERENCES users(id),
    activated_at TIMESTAMPTZ,
    CHECK ((status='draft' AND effective_from IS NULL) OR (status='active' AND effective_from IS NOT NULL AND activated_at IS NOT NULL))
);
ALTER TABLE entries ADD COLUMN IF NOT EXISTS posting_rule_version_id BIGINT REFERENCES accounting_rule_versions(id);
ALTER TABLE payroll_payment_instructions ADD COLUMN IF NOT EXISTS posting_rule_version_id BIGINT REFERENCES accounting_rule_versions(id);
CREATE INDEX IF NOT EXISTS accounting_rule_versions_key
  ON accounting_rule_versions(scope,rule_key,status,effective_from DESC,id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_rule_one_effective_date
  ON accounting_rule_versions(scope,rule_key,effective_from) WHERE status='active';
-- Disallow mutation and deletion of published versions, even by privileged application accounts.
CREATE OR REPLACE FUNCTION accounting_protect_published() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.status='active' THEN
    RAISE EXCEPTION 'Опубліковані версії правил не видаляються';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='active' THEN
    RAISE EXCEPTION 'Опубліковані версії правил незмінні';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS accounting_rule_protect ON accounting_rule_versions;
CREATE TRIGGER accounting_rule_protect BEFORE UPDATE OR DELETE ON accounting_rule_versions
 FOR EACH ROW EXECUTE FUNCTION accounting_protect_published();
COMMIT;
