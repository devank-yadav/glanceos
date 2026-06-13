CREATE TABLE layouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  document TEXT NOT NULL,
  is_template INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  name TEXT,
  claim_code TEXT UNIQUE,
  claimed_at INTEGER,
  layout_id INTEGER REFERENCES layouts(id) ON DELETE SET NULL,
  profile TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id TEXT NOT NULL DEFAULT 'default',
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE queues (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Now serving',
  now_serving INTEGER NOT NULL DEFAULT 0,
  waiting INTEGER NOT NULL DEFAULT 0
);

INSERT INTO queues (id, title) VALUES ('default', 'Now serving');
INSERT INTO tasks (list_id, text, done, created_at) VALUES ('default', 'Finish HW', 0, 0);
INSERT INTO tasks (list_id, text, done, created_at) VALUES ('default', 'Edit this list in the config app', 0, 0);
