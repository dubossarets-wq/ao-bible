-- Аккаунты Колоса: данные человека («Мои данные» по ключам) для синхронизации между устройствами.
-- Применить: npx wrangler d1 execute aobible-sync --remote --file=../sync/schema.sql -c ../sync/wrangler.toml

-- человек: идентификатор Google (sub), адрес и имя — только чтобы показать в приложении, у кого вход
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  created INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);

-- входы с устройств: храним только хэш ключа входа (сам ключ — у устройства)
CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  device TEXT,
  created INTEGER NOT NULL,
  used INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user);

-- данные: ключ «Моих данных» (закладки, заметки, настройки…) → значение (строка JSON), время изменения на устройстве,
-- удалено ли, номер изменения на сервере (по нему устройство забирает только новое)
CREATE TABLE IF NOT EXISTS items (
  user TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,
  PRIMARY KEY (user, key)
);
CREATE INDEX IF NOT EXISTS items_rev ON items(user, rev);
