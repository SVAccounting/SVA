-- Виконайте в Neon -> SQL Editor
CREATE TABLE IF NOT EXISTS accounts (code TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS entries (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date DATE NOT NULL, doc TEXT, description TEXT,
  debit_acc TEXT NOT NULL REFERENCES accounts(code),
  credit_acc TEXT NOT NULL REFERENCES accounts(code),
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS entries_company_idx ON entries(company_id, date);

-- Повний план рахунків (можна виконувати повторно — оновлює назви)
INSERT INTO accounts(code,name,kind) VALUES
('01','Орендовані необоротні активи','O'),
('02','Активи на відповідальному зберіганні','O'),
('03','Контрактні зобов’язання','O'),
('04','Непередбачені активи і зобов’язання','O'),
('05','Гарантії та забезпечення надані','O'),
('06','Гарантії та забезпечення отримані','O'),
('07','Списана дебіторська заборгованість','O'),
('08','Бланки суворої звітності','O'),
('09','Амортизаційні відрахування','O'),
('101','Земельні ділянки','A'),
('102','Капітальні витрати на поліпшення земель','A'),
('103','Будинки, споруди та передавальні пристрої','A'),
('104','Машини та обладнання','A'),
('105','Транспортні засоби','A'),
('106','Інструменти, прилади, інвентар (меблі)','A'),
('107','Тварини','A'),
('108','Багаторічні насадження','A'),
('109','Інші основні засоби','A'),
('111','Бібліотечні фонди','A'),
('112','Малоцінні необоротні матеріальні активи','A'),
('113','Тимчасові (нетитульні) споруди','A'),
('114','Природні ресурси','A'),
('115','Інвентарна тара','A'),
('116','Предмети прокату','A'),
('117','Інші необоротні матеріальні активи','A'),
('121','Права користування природними ресурсами','A'),
('122','Права користування майном','A'),
('123','Права на комерційні позначення','A'),
('124','Права на об’єкти промислової власності','A'),
('125','Авторське право та суміжні з ним права','A'),
('127','Інші нематеріальні активи','A'),
('131','Знос основних засобів','P'),
('132','Знос інших необоротних матеріальних активів','P'),
('133','Накопичена амортизація нематеріальних активів','P'),
('134','Накопичена амортизація довгострокових біологічних активів','P'),
('135','Знос інвестиційної нерухомості','P'),
('141','Інвестиції пов’язаним сторонам за методом участі в капіталі','A'),
('142','Інвестиції пов’язаним сторонам за собівартістю','A'),
('143','Інвестиції непов’язаним сторонам','A'),
('151','Капітальне будівництво','A'),
('152','Придбання (виготовлення) основних засобів','A'),
('153','Придбання (виготовлення) інших необоротних матеріальних активів','A'),
('154','Придбання (створення) нематеріальних активів','A'),
('155','Формування основного стада','A'),
('156','Придбання (вирощування) довгострокових біологічних активів','A'),
('16','Довгострокова дебіторська заборгованість','A'),
('17','Відстрочені податкові активи','A'),
('18','Інші необоротні активи','A'),
('19','Гудвіл','A'),
('201','Сировина й матеріали','A'),
('202','Покупні напівфабрикати та комплектуючі вироби','A'),
('203','Паливо','A'),
('204','Тара й тарні матеріали','A'),
('205','Будівельні матеріали','A'),
('206','Матеріали, передані в переробку','A'),
('207','Запасні частини','A'),
('208','Матеріали сільськогосподарського призначення','A'),
('209','Інші матеріали','A'),
('21','Поточні біологічні активи','A'),
('22','Малоцінні та швидкозношувані предмети','A'),
('231','Основне виробництво','A'),
('233','Допоміжні виробництва','A'),
('24','Брак у виробництві','A'),
('25','Напівфабрикати','A'),
('26','Готова продукція','A'),
('27','Продукція сільськогосподарського виробництва','A'),
('281','Товари на складі','A'),
('282','Товари в торгівлі','A'),
('283','Товари на комісії','A'),
('284','Тара під товарами й порожня','A'),
('285','Торгова націнка','P'),
('286','Транспортно-заготівельні витрати','A'),
('301','Каса в національній валюті','A'),
('302','Каса в іноземній валюті','A'),
('311','Поточні рахунки в національній валюті','A'),
('312','Поточні рахунки в іноземній валюті','A'),
('313','Інші рахунки в банку в національній валюті','A'),
('314','Інші рахунки в банку в іноземній валюті','A'),
('315','Спеціальні рахунки в національній валюті','A'),
('316','Спеціальні рахунки в іноземній валюті','A'),
('331','Грошові документи в національній валюті','A'),
('332','Грошові документи в іноземній валюті','A'),
('333','Грошові кошти в дорозі в національній валюті','A'),
('334','Грошові кошти в дорозі в іноземній валюті','A'),
('34','Короткострокові векселі одержані','A'),
('351','Еквіваленти грошових коштів','A'),
('352','Інші поточні фінансові інвестиції','A'),
('361','Розрахунки з вітчизняними покупцями','A'),
('362','Розрахунки з іноземними покупцями','A'),
('371','Розрахунки за виданими авансами','A'),
('372','Розрахунки з підзвітними особами','A'),
('373','Розрахунки за нарахованими доходами','A'),
('374','Розрахунки за претензіями','A'),
('375','Розрахунки за відшкодуванням завданих збитків','A'),
('376','Розрахунки за позиками членам кредитних спілок','A'),
('377','Розрахунки з іншими дебіторами','A'),
('38','Резерв сумнівних боргів','P'),
('39','Витрати майбутніх періодів','A'),
('40','Статутний капітал','P'),
('41','Пайовий капітал','P'),
('421','Емісійний дохід','P'),
('422','Накопичені курсові різниці','P'),
('423','Безоплатно одержані необоротні активи','P'),
('424','Інший вкладений капітал','P'),
('425','Інший додатковий капітал','P'),
('43','Резервний капітал','P'),
('44','Нерозподілені прибутки (непокриті збитки)','AP'),
('45','Вилучений капітал','A'),
('46','Неоплачений капітал','A'),
('47','Забезпечення майбутніх витрат і платежів','P'),
('48','Цільове фінансування і цільові надходження','P'),
('50','Довгострокові позики','P'),
('51','Довгострокові векселі видані','P'),
('52','Довгострокові облігації','P'),
('53','Довгострокові зобов’язання з оренди','P'),
('54','Відстрочені податкові зобов’язання','P'),
('55','Інші довгострокові зобов’язання','P'),
('60','Короткострокові позики','P'),
('61','Поточна заборгованість за довгостроковими зобов’язаннями','P'),
('62','Короткострокові векселі видані','P'),
('631','Розрахунки з вітчизняними постачальниками','P'),
('632','Розрахунки з іноземними постачальниками','P'),
('641','Розрахунки за податками','AP'),
('642','Розрахунки за обов’язковими платежами','AP'),
('643','Податкові зобов’язання','P'),
('644','Податковий кредит','A'),
('651','Розрахунки за пенсійним забезпеченням (ЄСВ)','P'),
('652','Розрахунки за соціальним страхуванням','P'),
('653','Розрахунки за страхуванням на випадок безробіття','P'),
('654','Розрахунки за індивідуальним страхуванням','P'),
('655','Розрахунки за страхуванням майна','P'),
('661','Розрахунки за заробітною платою','P'),
('662','Розрахунки з депонентами','P'),
('663','Розрахунки за іншими виплатами','P'),
('671','Розрахунки за нарахованими дивідендами','P'),
('672','Розрахунки за іншими операціями з учасниками','P'),
('681','Розрахунки за авансами одержаними','P'),
('682','Внутрішні розрахунки','AP'),
('683','Внутрішньогосподарські розрахунки','AP'),
('684','Розрахунки за нарахованими відсотками','P'),
('685','Розрахунки з іншими кредиторами','P'),
('69','Доходи майбутніх періодів','P'),
('701','Дохід від реалізації готової продукції','P'),
('702','Дохід від реалізації товарів','P'),
('703','Дохід від реалізації робіт і послуг','P'),
('704','Вирахування з доходу','A'),
('71','Інший операційний дохід','P'),
('72','Дохід від участі в капіталі','P'),
('73','Інші фінансові доходи','P'),
('74','Інші доходи','P'),
('791','Результат операційної діяльності','AP'),
('792','Результат фінансових операцій','AP'),
('793','Результат іншої звичайної діяльності','AP'),
('80','Матеріальні затрати','A'),
('81','Витрати на оплату праці','A'),
('82','Відрахування на соціальні заходи','A'),
('83','Амортизація','A'),
('84','Інші операційні витрати','A'),
('901','Собівартість реалізованої готової продукції','A'),
('902','Собівартість реалізованих товарів','A'),
('903','Собівартість реалізованих робіт і послуг','A'),
('91','Загальновиробничі витрати','A'),
('92','Адміністративні витрати','A'),
('93','Витрати на збут','A'),
('944','Сумнівні та безнадійні борги','A'),
('945','Втрати від операційної курсової різниці','A'),
('946','Втрати від знецінення запасів','A'),
('947','Нестачі й втрати від псування цінностей','A'),
('949','Інші витрати операційної діяльності','A'),
('951','Відсотки за кредит','A'),
('952','Інші фінансові витрати','A'),
('96','Втрати від участі в капіталі','A'),
('97','Інші витрати','A'),
('981','Податок на прибуток від звичайної діяльності','A'),
('99','Надзвичайні витрати','A')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, kind=EXCLUDED.kind;
DELETE FROM accounts a WHERE a.code IN ('85','13','10','12','15','20','63','65','66','70','79','94') AND NOT EXISTS
  (SELECT 1 FROM entries e WHERE e.debit_acc=a.code OR e.credit_acc=a.code);

-- Користувачі, ролі, завдання (можна виконувати повторно)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, login TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student', salt TEXT NOT NULL, hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id UUID;
UPDATE users SET public_id = gen_random_uuid() WHERE public_id IS NULL;
ALTER TABLE users ALTER COLUMN public_id SET DEFAULT gen_random_uuid();
ALTER TABLE users ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_unique ON users(public_id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS owner_id INT REFERENCES users(id) ON DELETE CASCADE;
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT, lines JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY, task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answer JSONB NOT NULL, correct BOOLEAN NOT NULL, created_at TIMESTAMPTZ DEFAULT now());

-- Налаштування підприємства, довідники, сторно, допоміжний рахунок 000 (можна виконувати повторно)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE entries ADD COLUMN IF NOT EXISTS storno_of INT;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS partner TEXT;
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_amount_check;
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_amount_nonzero;
ALTER TABLE entries ADD CONSTRAINT entries_amount_nonzero CHECK (amount <> 0);
CREATE TABLE IF NOT EXISTS refs (
  id SERIAL PRIMARY KEY, company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, name TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS refs_idx ON refs(company_id, kind);
INSERT INTO accounts(code,name,kind) VALUES ('000','Допоміжний рахунок для введення залишків','O') ON CONFLICT DO NOTHING;

-- Документи, кількісний складський облік (можна виконувати повторно)
CREATE TABLE IF NOT EXISTS docs (
  id SERIAL PRIMARY KEY, company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL, number TEXT NOT NULL, date DATE NOT NULL, partner TEXT,
  data JSONB NOT NULL DEFAULT '{}', storno BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS stock_moves (
  id SERIAL PRIMARY KEY, company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_id INT REFERENCES docs(id) ON DELETE CASCADE, date DATE NOT NULL,
  wh_id INT NOT NULL REFERENCES refs(id) ON DELETE RESTRICT, item_id INT NOT NULL REFERENCES refs(id) ON DELETE RESTRICT,
  qty NUMERIC(15,3) NOT NULL, amount NUMERIC(15,2) NOT NULL);
ALTER TABLE entries ADD COLUMN IF NOT EXISTS doc_id INT;
CREATE INDEX IF NOT EXISTS stock_idx ON stock_moves(company_id, item_id, wh_id, date);

-- Модуль коригувань: періоди, версії документів, журнал коригувань, незмінний аудит (можна виконувати повторно)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS closed_until TEXT;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS add_of INT, ADD COLUMN IF NOT EXISTS corr_id INT, ADD COLUMN IF NOT EXISTS superseded_by INT;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS corrections (
  id SERIAL PRIMARY KEY, company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number TEXT NOT NULL, method TEXT NOT NULL, source_doc_id INT, source_entry_id INT, cdate DATE NOT NULL,
  orig_amount NUMERIC(15,2), delta NUMERIC(15,2), result_amount NUMERIC(15,2), reason TEXT NOT NULL, nature TEXT,
  user_id INT, user_name TEXT, status TEXT NOT NULL DEFAULT 'Проведено', request_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (company_id, request_key));
CREATE TABLE IF NOT EXISTS doc_versions (
  id SERIAL PRIMARY KEY, doc_id INT NOT NULL REFERENCES docs(id) ON DELETE CASCADE, version INT NOT NULL,
  snapshot JSONB NOT NULL, user_name TEXT, reason TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY, company_id INT, user_id INT, user_name TEXT, at TIMESTAMPTZ DEFAULT now(),
  action TEXT NOT NULL, object_type TEXT, object_id TEXT, old_data JSONB, new_data JSONB, reason TEXT);
CREATE OR REPLACE FUNCTION audit_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Журнал аудиту не можна змінювати'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_no_change ON audit_log;
CREATE TRIGGER audit_no_change BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_immutable();
CREATE OR REPLACE VIEW entries_a AS SELECT * FROM entries WHERE active;

-- Permissions for company creation (run permissions_migration.sql on existing DB).
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS can_create_company BOOLEAN NOT NULL DEFAULT false;

-- Payroll calculations for newly initialized databases
-- Перед виконанням створити резервну копію Neon. Повторний запуск безпечний.

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

-- Модуль номенклатури, партій та ціноутворення: для існуючої бази виконайте inventory_policy_migration.sql.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS inventory_revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS lot_key TEXT;
CREATE INDEX IF NOT EXISTS stock_lot_lookup ON stock_moves(company_id,item_id,wh_id,lot_key,date,id);
CREATE TABLE IF NOT EXISTS item_prices (
 id BIGSERIAL PRIMARY KEY, company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 item_id INT NOT NULL REFERENCES refs(id) ON DELETE RESTRICT,
 price_type_id INT NOT NULL REFERENCES refs(id) ON DELETE RESTRICT,
 effective_from DATE NOT NULL, price NUMERIC(15,2) NOT NULL CHECK(price >= 0),
 created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(company_id,item_id,price_type_id,effective_from));
CREATE INDEX IF NOT EXISTS item_prices_lookup ON item_prices(company_id,price_type_id,item_id,effective_from DESC);
INSERT INTO accounts(code,name,kind) VALUES ('712','Дохід від реалізації інших оборотних активів','P'),('943','Собівартість реалізованих виробничих запасів','A') ON CONFLICT DO NOTHING;


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


-- Superadmin versioned rules (existing databases: accounting_rulebook_migration.sql)
-- ProOblik 2026-11-21: versioned rulebook. Back up Neon before execution.
-- Does not alter existing postings, documents or financial-statement values.

CREATE TABLE IF NOT EXISTS accounting_rule_versions (
    id BIGSERIAL PRIMARY KEY,
    scope TEXT NOT NULL CHECK (scope IN ('posting','report')),
    rule_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active')),
    effective_from DATE,
    config JSONB NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    validated_at TIMESTAMPTZ,
    activated_by INTEGER REFERENCES users(id),
    activated_at TIMESTAMPTZ,
    CHECK ((status='draft' AND effective_from IS NULL) OR (status='active' AND effective_from IS NOT NULL AND activated_at IS NOT NULL))
);
ALTER TABLE entries ADD COLUMN IF NOT EXISTS posting_rule_version_id BIGINT REFERENCES accounting_rule_versions(id);
ALTER TABLE payroll_payment_instructions ADD COLUMN IF NOT EXISTS posting_rule_version_id BIGINT REFERENCES accounting_rule_versions(id);
CREATE INDEX IF NOT EXISTS accounting_rule_versions_key
  ON accounting_rule_versions(scope,rule_key,status,effective_from DESC,id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_rule_one_effective_date
  ON accounting_rule_versions(scope,rule_key,effective_from) WHERE status='active';
-- Disallow mutation and deletion of published versions, even by privileged application accounts.
CREATE OR REPLACE FUNCTION accounting_protect_published() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.status='active' THEN
    RAISE EXCEPTION 'Опубліковані версії правил не видаляються';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='active' THEN
    RAISE EXCEPTION 'Опубліковані версії правил незмінні';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS accounting_rule_protect ON accounting_rule_versions;
CREATE TRIGGER accounting_rule_protect BEFORE UPDATE OR DELETE ON accounting_rule_versions
 FOR EACH ROW EXECUTE FUNCTION accounting_protect_published();
