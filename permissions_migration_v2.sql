-- Run on Neon after creating a database backup. Idempotent migration.
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS company_role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE company_members DROP CONSTRAINT IF EXISTS company_members_company_role_check;
ALTER TABLE company_members ADD CONSTRAINT company_members_company_role_check CHECK (company_role IN ('admin','user'));
-- Preserve existing company owners as administrators.
INSERT INTO company_members(company_id,user_id,company_role)
SELECT id,owner_id,'admin' FROM companies WHERE owner_id IS NOT NULL
ON CONFLICT(company_id,user_id) DO UPDATE SET company_role='admin';
-- Legacy globally marked admins do not gain access to unrelated companies.
-- The users.role field remains for backwards compatibility; company_role controls per-company access.
