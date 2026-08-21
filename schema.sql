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

CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_printed ON orders(printed);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
