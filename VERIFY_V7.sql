-- Лише діагностика ProOblik v7 (нічого не змінює)
SELECT 'account_subconto_settings' AS obj, to_regclass('public.account_subconto_settings') IS NOT NULL AS exists
UNION ALL SELECT 'company_posting_baseline',to_regclass('public.company_posting_baseline') IS NOT NULL
UNION ALL SELECT 'entries_a',to_regclass('public.entries_a') IS NOT NULL;
SELECT column_name,data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name='entries' AND column_name IN ('debit_subconto','credit_subconto');
SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid='public.company_posting_baseline'::regclass AND NOT tgisinternal;
SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid='public.entries'::regclass AND tgname='trg_prooblik_entry_setup_lock';
SELECT company_id,COUNT(*) AS updated_accounts FROM account_subconto_settings GROUP BY company_id ORDER BY company_id;
SELECT company_id,COUNT(*) AS initial_mappings FROM company_posting_baseline GROUP BY company_id ORDER BY company_id;
