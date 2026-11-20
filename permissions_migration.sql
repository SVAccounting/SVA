-- ProOblik: run once in Neon SQL Editor BEFORE deploying new code.
-- Existing teacher accounts become superadmins; existing company owners retain full company rights.
UPDATE users SET role='superadmin' WHERE role='teacher';
UPDATE users SET role='admin' WHERE role='student' AND id IN (SELECT owner_id FROM companies WHERE owner_id IS NOT NULL);
UPDATE users SET role='user' WHERE role='student';
CREATE TABLE IF NOT EXISTS company_members (
 company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,user_id)
);
CREATE INDEX IF NOT EXISTS company_members_user_idx ON company_members(user_id);

-- Дозвіл створення нового підприємства для користувача, прив'язаного до підприємства.
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS can_create_company BOOLEAN NOT NULL DEFAULT false;
