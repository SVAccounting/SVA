-- Перед виконанням створити резервну копію Neon. Повторний запуск безпечний.
BEGIN;
CREATE TABLE IF NOT EXISTS payroll_calculations (
 id BIGSERIAL PRIMARY KEY,
 company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 staff_id INTEGER NOT NULL REFERENCES refs(id) ON DELETE RESTRICT,
 year INTEGER NOT NULL CHECK(year BETWEEN 2020 AND 2100),
 month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
 gross NUMERIC(16,2) NOT NULL CHECK(gross >= 0),
 details JSONB NOT NULL,
 created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(company_id,staff_id,year,month)
);
CREATE INDEX IF NOT EXISTS payroll_calculations_company_period ON payroll_calculations(company_id,year,month);
COMMIT;
