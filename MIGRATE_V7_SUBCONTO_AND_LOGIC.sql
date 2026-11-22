-- ProOblik v7. Run AFTER previous schema and v6 migrations. Backup Neon first.
BEGIN;
CREATE TABLE IF NOT EXISTS account_subconto_settings (
 company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 account_code TEXT NOT NULL REFERENCES accounts(code),
 slots JSONB NOT NULL DEFAULT '[]'::jsonb,
 updated_by INT REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,account_code),
 CONSTRAINT subconto_slots_are_array CHECK (jsonb_typeof(slots)='array' AND jsonb_array_length(slots)<=3)
);
ALTER TABLE entries ADD COLUMN IF NOT EXISTS debit_subconto JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS credit_subconto JSONB NOT NULL DEFAULT '[]'::jsonb;
-- PostgreSQL views expand SELECT * at creation: recreate it to expose the two new columns.
CREATE OR REPLACE VIEW entries_a AS SELECT * FROM entries WHERE active;
CREATE INDEX IF NOT EXISTS entries_debit_subconto_idx ON entries USING GIN(debit_subconto);
CREATE INDEX IF NOT EXISTS entries_credit_subconto_idx ON entries USING GIN(credit_subconto);
CREATE TABLE IF NOT EXISTS company_posting_baseline (
 company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 source TEXT NOT NULL, from_debit TEXT NOT NULL REFERENCES accounts(code),
 from_credit TEXT NOT NULL REFERENCES accounts(code),
 to_debit TEXT NOT NULL REFERENCES accounts(code),
 to_credit TEXT NOT NULL REFERENCES accounts(code),
 description TEXT NOT NULL,
 updated_by INT NOT NULL REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,source,from_debit,from_credit)
);
-- Also protect the baseline from direct SQL edits after first posting, not only via the API.
CREATE OR REPLACE FUNCTION prooblik_guard_baseline() RETURNS trigger AS $$
DECLARE target_company INT;
BEGIN
  target_company := CASE WHEN TG_OP='DELETE' THEN OLD.company_id ELSE NEW.company_id END;
  PERFORM pg_advisory_xact_lock(734721, target_company);
  IF EXISTS(SELECT 1 FROM entries WHERE company_id=target_company LIMIT 1)
    OR EXISTS(SELECT 1 FROM docs WHERE company_id=target_company LIMIT 1)
    OR EXISTS(SELECT 1 FROM stock_moves WHERE company_id=target_company LIMIT 1)
    OR EXISTS(SELECT 1 FROM payroll_calculations WHERE company_id=target_company AND posted_at IS NOT NULL LIMIT 1)
  THEN RAISE EXCEPTION 'Базові проводки заблоковані після початку обліку; використайте версійні правила'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_prooblik_baseline_guard ON company_posting_baseline;
CREATE TRIGGER trg_prooblik_baseline_guard BEFORE INSERT OR UPDATE OR DELETE ON company_posting_baseline
 FOR EACH ROW EXECUTE FUNCTION prooblik_guard_baseline();
-- Coordinate writes to the ledger with the baseline setup lock to avoid a race.
CREATE OR REPLACE FUNCTION prooblik_lock_posting_baseline() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(734721, NEW.company_id);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_prooblik_entry_setup_lock ON entries;
CREATE TRIGGER trg_prooblik_entry_setup_lock BEFORE INSERT ON entries
 FOR EACH ROW EXECUTE FUNCTION prooblik_lock_posting_baseline();
COMMIT;
