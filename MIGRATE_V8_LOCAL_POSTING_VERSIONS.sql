-- ProOblik v8: версійний редактор проводок ЛИШЕ поточного підприємства.
-- Потрібна ProOblik v7. Запустіть на резервній гілці Neon перед деплоєм v8.
-- Старі типові операції, правила та проведені записи НЕ переписуються.
BEGIN;
CREATE TABLE IF NOT EXISTS company_posting_versions (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  from_debit TEXT NOT NULL REFERENCES accounts(code),
  from_credit TEXT NOT NULL REFERENCES accounts(code),
  to_debit TEXT NOT NULL REFERENCES accounts(code),
  to_credit TEXT NOT NULL REFERENCES accounts(code),
  description TEXT NOT NULL,
  reason TEXT NOT NULL,
  effective_from DATE NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_debit <> from_credit AND to_debit <> to_credit),
  CHECK (char_length(description) BETWEEN 3 AND 500),
  CHECK (char_length(reason) BETWEEN 8 AND 500)
);
CREATE INDEX IF NOT EXISTS company_posting_version_lookup
  ON company_posting_versions(company_id,source,from_debit,from_credit,effective_from DESC,id DESC);
CREATE INDEX IF NOT EXISTS company_posting_version_company
  ON company_posting_versions(company_id,id DESC);
-- Публікації незмінні: виправлення = нова версія (у т.ч. на ту саму майбутню дату).
CREATE OR REPLACE FUNCTION prooblik_protect_company_posting_versions() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Опубліковані локальні версії проводок незмінні. Створіть нову версію.';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_company_posting_versions_immutable ON company_posting_versions;
CREATE TRIGGER trg_company_posting_versions_immutable
 BEFORE UPDATE OR DELETE ON company_posting_versions FOR EACH ROW
 EXECUTE FUNCTION prooblik_protect_company_posting_versions();
ALTER TABLE entries ADD COLUMN IF NOT EXISTS company_posting_version_id BIGINT REFERENCES company_posting_versions(id);
-- Foreign-key protection against recording another enterprise's version on an entry.
CREATE UNIQUE INDEX IF NOT EXISTS company_posting_versions_company_pair ON company_posting_versions(id,company_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='entries_local_company_version_fk') THEN
    ALTER TABLE entries ADD CONSTRAINT entries_local_company_version_fk
      FOREIGN KEY(company_posting_version_id,company_id)
      REFERENCES company_posting_versions(id,company_id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS entries_company_posting_version_idx ON entries(company_posting_version_id);
CREATE OR REPLACE VIEW entries_a AS SELECT * FROM entries WHERE active;
COMMIT;
