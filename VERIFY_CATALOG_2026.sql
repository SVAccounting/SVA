-- Перевірки після виконання обох міграцій.
SELECT COUNT(*) AS new_accounts
FROM public.accounts WHERE code IN (SELECT code FROM public.accounts WHERE code <> '000');
SELECT COUNT(*) AS imported_templates,
 COUNT(*) FILTER (WHERE is_active) AS active_templates,
 COUNT(*) FILTER (WHERE review_status='duplicate') AS disabled_duplicates,
 COUNT(*) FILTER (WHERE review_status='review') AS needs_review,
 COUNT(*) FILTER (WHERE family='offbalance') AS offbalance_templates,
 COUNT(*) FILTER (WHERE family='transfer') AS analytic_transfers
FROM public.typical_operations WHERE source_uid ~ '^P[0-9]{4}$';
SELECT count(*) AS normative_pairs FROM public.account_correspondences_291;
SELECT source_uid,category,name,review_status,duplicate_of,note,source_status
FROM public.typical_operations WHERE source_uid ~ '^P[0-9]{4}$' AND NOT is_active ORDER BY source_uid;
SELECT count(*) AS archived_legacy_templates FROM public.typical_operations WHERE source_uid IS NULL AND NOT is_active;
SELECT code,name,kind,analytic_enabled,analytic_dimensions,quantity_enabled,quantity_policy
FROM public.accounts WHERE code IN ('000','23','281','285','286','311','361','631','661','902') ORDER BY code;
