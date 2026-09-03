PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code INTEGER NOT NULL UNIQUE,
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  detailed_address TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  order_notes TEXT NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  printed INTEGER NOT NULL DEFAULT 0,
  first_printed_at TEXT,
  last_printed_at TEXT,
  print_count INTEGER NOT NULL DEFAULT 0,
  partial_cost_reviewed INTEGER NOT NULL DEFAULT 0,
  partial_received_items TEXT NOT NULL DEFAULT '',
  profit_reviewed_settlement_id INTEGER,
  profit_reviewed_at TEXT,
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS print_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_code TEXT NOT NULL UNIQUE,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  order_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS print_batch_orders (
  batch_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY(batch_id, order_id),
  FOREIGN KEY(batch_id) REFERENCES print_batches(id) ON DELETE CASCADE,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_departures (
  order_id INTEGER PRIMARY KEY,
  store_id INTEGER,
  first_batch_id INTEGER,
  departed_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(first_batch_id) REFERENCES print_batches(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_departures_date_store ON order_departures(departed_at, store_id);

CREATE TABLE IF NOT EXISTS return_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE,
  return_type TEXT NOT NULL CHECK(return_type IN ('full','partial')),
  reason TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(return_id,item_name),
  FOREIGN KEY(return_id) REFERENCES return_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS profit_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  cost REAL NOT NULL DEFAULT 0,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  offers_json TEXT NOT NULL DEFAULT '{}',
  delivery_included INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profit_model_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT NOT NULL DEFAULT '',
  after_json TEXT NOT NULL DEFAULT '',
  changed_by INTEGER,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profit_ignored_phrases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phrase TEXT NOT NULL UNIQUE,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_balances (
  model_id INTEGER PRIMARY KEY,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(model_id) REFERENCES profit_models(id)
);

CREATE TABLE IF NOT EXISTS inventory_order_items (
  order_id INTEGER NOT NULL,
  model_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(order_id,model_id),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(model_id) REFERENCES profit_models(id)
);

CREATE TABLE IF NOT EXISTS inventory_order_tracking (
  order_id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id INTEGER NOT NULL,
  order_id INTEGER,
  quantity_delta INTEGER NOT NULL,
  movement_type TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(model_id) REFERENCES profit_models(id),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_printed ON orders(printed);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_return_events_created_at ON return_events(created_at);
CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_profit_models_active ON profit_models(active);
CREATE INDEX IF NOT EXISTS idx_profit_model_audit_model ON profit_model_audit(model_id);
CREATE INDEX IF NOT EXISTS idx_profit_ignored_phrases_phrase ON profit_ignored_phrases(phrase);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_model_date ON inventory_movements(model_id,id DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_order ON inventory_movements(order_id);
