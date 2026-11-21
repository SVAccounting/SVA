-- Read-only sanity check after both inventory and rulebook migrations.
-- Works in Neon SQL Editor; does not modify data.
SELECT 'inventory_revision' AS expected, EXISTS (
 SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='companies' AND column_name='inventory_revision'
) AS installed
UNION ALL SELECT 'lot_key', EXISTS (
 SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_moves' AND column_name='lot_key'
)
UNION ALL SELECT 'item_prices', EXISTS (
 SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='item_prices'
)
UNION ALL SELECT 'accounting_rule_versions', EXISTS (
 SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='accounting_rule_versions'
)
UNION ALL SELECT 'posting_rule_version_id', EXISTS (
 SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='entries' AND column_name='posting_rule_version_id'
)
UNION ALL SELECT 'payment_rule_version_id', EXISTS (
 SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payroll_payment_instructions' AND column_name='posting_rule_version_id'
);
