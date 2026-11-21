-- Лише діагностика (без змін даних): виконайте після міграції.
-- Позиції, яким потрібно призначити вид та одиницю виміру.
SELECT i.company_id,i.id AS item_id,i.name AS nomenclature,
       i.data->>'unit' AS old_uom,
       COALESCE(i.data->>'item_type_id','') AS item_type_id,
       COALESCE(i.data->>'uom_id','') AS uom_id,
       COUNT(DISTINCT sm.id) AS stock_moves_count,
       COALESCE(SUM(sm.qty),0) AS quantity_balance,
       COALESCE(SUM(sm.amount),0) AS amount_balance
FROM refs i LEFT JOIN stock_moves sm ON sm.company_id=i.company_id AND sm.item_id=i.id
WHERE i.kind='item'
GROUP BY i.company_id,i.id,i.name,i.data
HAVING COALESCE(i.data->>'item_type_id','')='' OR COALESCE(i.data->>'uom_id','')=''
ORDER BY i.company_id,i.name;

-- Наявні складські рухи без конкретної партії; заважають використанню ідентифікованої собівартості без звірки.
SELECT company_id,item_id,wh_id,COUNT(*) AS movements_without_lot,
       SUM(qty) AS quantity_movements_without_lot
FROM stock_moves WHERE qty<0 AND lot_key IS NULL
GROUP BY company_id,item_id,wh_id ORDER BY company_id,item_id,wh_id;

-- Порівняння фізичного залишку і вартості за складом та товаром.
SELECT m.company_id,m.wh_id,w.name AS warehouse,m.item_id,i.name AS item,
       SUM(m.qty) AS balance_qty, SUM(m.amount) AS balance_amount
FROM stock_moves m
JOIN refs w ON w.id=m.wh_id
JOIN refs i ON i.id=m.item_id
GROUP BY m.company_id,m.wh_id,w.name,m.item_id,i.name
ORDER BY m.company_id,w.name,i.name;
