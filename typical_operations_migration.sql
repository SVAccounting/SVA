-- Запустіть один раз у Neon SQL Editor (безпечно повторювати).
-- Типові операції: логіка (категорія, назва, рядки проводок), яку редагує суперадміністратор.
CREATE TABLE IF NOT EXISTS typical_operations (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  lines JSONB NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS typical_operations_cat_idx ON typical_operations(category, sort, id);
