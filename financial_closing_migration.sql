-- ProOblik: провести ПІСЛЯ резервної копії Neon; не видаляє існуючих проведень.
BEGIN;
CREATE TABLE IF NOT EXISTS financial_closings (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_end DATE NOT NULL,
  doc_number TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id,period_end)
);
CREATE INDEX IF NOT EXISTS financial_closings_company_period_idx ON financial_closings(company_id, period_end DESC);
COMMIT;
