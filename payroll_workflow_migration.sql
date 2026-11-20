-- ProOblik: Кадри / зарплата, міграція без видалення існуючих даних
-- Зробіть резервну копію перед виконанням.
BEGIN;
ALTER TABLE payroll_calculations ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS payroll_payment_instructions (
 id BIGSERIAL PRIMARY KEY,
 company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 payroll_id BIGINT NOT NULL REFERENCES payroll_calculations(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('wage','pit','military','esv')),
 date DATE NOT NULL,
 amount NUMERIC(16,2) NOT NULL CHECK(amount>=0),
 lines JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','confirmed')),
 created_by INTEGER REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 confirmed_at TIMESTAMPTZ,
 UNIQUE(payroll_id,kind)
);
CREATE INDEX IF NOT EXISTS payroll_payment_company ON payroll_payment_instructions(company_id,payroll_id);
COMMIT;
