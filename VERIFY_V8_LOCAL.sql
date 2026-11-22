-- Safe read-only verification after MIGRATE_V8_LOCAL_POSTING_VERSIONS.sql
SELECT 'company_posting_versions' AS object, to_regclass('public.company_posting_versions') IS NOT NULL AS present
UNION ALL SELECT 'entries.company_posting_version_id', EXISTS(
  SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='entries' AND column_name='company_posting_version_id')
UNION ALL SELECT 'company-aware FK', EXISTS(
  SELECT 1 FROM pg_constraint WHERE conname='entries_local_company_version_fk')
UNION ALL SELECT 'immutable history', EXISTS(
  SELECT 1 FROM pg_trigger WHERE tgname='trg_company_posting_versions_immutable' AND NOT tgisinternal);

-- Counts by enterprise; no rows is normal immediately after migration.
SELECT c.id AS company_id,c.name AS company_name,COUNT(v.id) AS published_local_versions
 FROM companies c LEFT JOIN company_posting_versions v ON v.company_id=c.id
 GROUP BY c.id,c.name ORDER BY c.id;

-- Most recent versions and their intended scope.
SELECT v.id,c.name AS company_name,v.source,v.from_debit,v.from_credit,v.to_debit,v.to_credit,
 v.description,v.reason,v.effective_from,v.created_at,u.name AS author
 FROM company_posting_versions v
 JOIN companies c ON c.id=v.company_id JOIN users u ON u.id=v.created_by
 ORDER BY v.id DESC LIMIT 30;
