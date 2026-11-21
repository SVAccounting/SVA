-- ProOblik: види номенклатури, одиниці виміру, окремі типи/історія цін, партійний облік.
-- Запускати після резервної копії Neon. Не перераховує історичні проводки.
BEGIN;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS inventory_revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS lot_key TEXT;
-- Старі приходи отримують унікальний технічний номер партії.
-- Історичні витрати не можна однозначно розподілити за партіями без первинних документів!
UPDATE stock_moves SET lot_key='legacy-' || id::text WHERE qty>0 AND lot_key IS NULL;
CREATE INDEX IF NOT EXISTS stock_lot_lookup ON stock_moves(company_id,item_id,wh_id,lot_key,date,id);
CREATE TABLE IF NOT EXISTS item_prices(
 id BIGSERIAL PRIMARY KEY,
 company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 item_id INT NOT NULL REFERENCES refs(id) ON DELETE RESTRICT,
 price_type_id INT NOT NULL REFERENCES refs(id) ON DELETE RESTRICT,
 effective_from DATE NOT NULL,
 price NUMERIC(15,2) NOT NULL CHECK(price>=0),
 created_at TIMESTAMPTZ DEFAULT now(),
 UNIQUE(company_id,item_id,price_type_id,effective_from)
);
CREATE INDEX IF NOT EXISTS item_prices_lookup ON item_prices(company_id,price_type_id,item_id,effective_from DESC);
INSERT INTO accounts(code,name,kind) VALUES ('712','Дохід від реалізації інших оборотних активів','P'),('943','Собівартість реалізованих виробничих запасів','A') ON CONFLICT DO NOTHING;
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'item_type','Товари','{"code": "goods", "stock_acc": "281", "cost_acc": "902", "revenue_acc": "702", "stockable": "yes"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='item_type' AND r.data->>'code'='goods');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'item_type','Готова продукція','{"code": "finished", "stock_acc": "26", "cost_acc": "901", "revenue_acc": "701", "stockable": "yes"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='item_type' AND r.data->>'code'='finished');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'item_type','Сировина та матеріали','{"code": "material", "stock_acc": "201", "cost_acc": "943", "revenue_acc": "712", "stockable": "yes"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='item_type' AND r.data->>'code'='material');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'item_type','МШП','{"code": "mhsp", "stock_acc": "22", "cost_acc": "943", "revenue_acc": "712", "stockable": "yes"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='item_type' AND r.data->>'code'='mhsp');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'item_type','Тара та тарні матеріали','{"code": "packing_material", "stock_acc": "204", "cost_acc": "943", "revenue_acc": "712", "stockable": "yes"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='item_type' AND r.data->>'code'='packing_material');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'item_type','Тара під товарами','{"code": "packing_goods", "stock_acc": "284", "cost_acc": "902", "revenue_acc": "702", "stockable": "yes"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='item_type' AND r.data->>'code'='packing_goods');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'item_type','Роботи','{"code": "work", "stock_acc": "", "cost_acc": "903", "revenue_acc": "703", "stockable": "no"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='item_type' AND r.data->>'code'='work');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'item_type','Послуги','{"code": "service", "stock_acc": "", "cost_acc": "903", "revenue_acc": "703", "stockable": "no"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='item_type' AND r.data->>'code'='service');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'item_type','Набір (готовий товар без комплектування)','{"code": "kit", "stock_acc": "281", "cost_acc": "902", "revenue_acc": "702", "stockable": "yes"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='item_type' AND r.data->>'code'='kit');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'uom','Штука','{"code": "шт"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='uom' AND r.data->>'code'='шт');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'uom','Кілограм','{"code": "кг"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='uom' AND r.data->>'code'='кг');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'uom','Грам','{"code": "г"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='uom' AND r.data->>'code'='г');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'uom','Літр','{"code": "л"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='uom' AND r.data->>'code'='л');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'uom','Метр','{"code": "м"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='uom' AND r.data->>'code'='м');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'uom','Квадратний метр','{"code": "м²"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='uom' AND r.data->>'code'='м²');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'uom','Кубічний метр','{"code": "м³"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='uom' AND r.data->>'code'='м³');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'uom','Упаковка','{"code": "уп"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='uom' AND r.data->>'code'='уп');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'uom','Послуга','{"code": "посл"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='uom' AND r.data->>'code'='посл');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'uom','Година','{"code": "год"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='uom' AND r.data->>'code'='год');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'price_type','Роздрібна','{"code": "retail"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='price_type' AND r.data->>'code'='retail');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'price_type','Оптова','{"code": "wholesale"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='price_type' AND r.data->>'code'='wholesale');
INSERT INTO refs(company_id,kind,name,data) SELECT c.id,'price_type','Дилерська','{"code": "dealer"}'::jsonb FROM companies c WHERE NOT EXISTS(SELECT 1 FROM refs r WHERE r.company_id=c.id AND r.kind='price_type' AND r.data->>'code'='dealer');

-- Без від'ємного складського залишку при одночасних проведеннях чи сторнуванні.
CREATE OR REPLACE FUNCTION prooblik_stock_nonnegative() RETURNS trigger AS $$
DECLARE available NUMERIC;
BEGIN
  IF NEW.qty < 0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('prooblik-stock:'||NEW.company_id||':'||NEW.wh_id||':'||NEW.item_id,0));
    SELECT COALESCE(SUM(qty),0) INTO available FROM stock_moves
     WHERE company_id=NEW.company_id AND wh_id=NEW.wh_id AND item_id=NEW.item_id AND date<=NEW.date;
    IF available+NEW.qty < -0.0001 THEN
      RAISE EXCEPTION 'Недостатньо залишку: підприємство %, склад %, номенклатура %, доступно %, списання %', NEW.company_id,NEW.wh_id,NEW.item_id,available,NEW.qty;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_prooblik_stock_nonnegative ON stock_moves;
CREATE TRIGGER trg_prooblik_stock_nonnegative BEFORE INSERT ON stock_moves
 FOR EACH ROW EXECUTE FUNCTION prooblik_stock_nonnegative();

COMMIT;
