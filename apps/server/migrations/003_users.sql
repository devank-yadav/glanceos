-- Multi-user accounts. A legacy single-password install becomes the
-- admin@local account, keeping its devices, setups, tasks, and queue.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Legacy import: no-op on fresh databases (settings row absent).
INSERT INTO users (id, name, email, password_hash, created_at)
SELECT lower(hex(randomblob(16))), 'Admin', 'admin@local', value,
       CAST(strftime('%s','now') AS INTEGER) * 1000
FROM settings WHERE key = 'password_hash';

ALTER TABLE devices ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE devices SET user_id = (SELECT id FROM users WHERE email = 'admin@local')
  WHERE claimed_at IS NOT NULL;

ALTER TABLE layouts ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE layouts ADD COLUMN published INTEGER NOT NULL DEFAULT 0;
ALTER TABLE layouts ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE layouts ADD COLUMN import_count INTEGER NOT NULL DEFAULT 0;
UPDATE layouts SET user_id = (SELECT id FROM users WHERE email = 'admin@local')
  WHERE is_template = 0;
UPDATE layouts SET published = 1 WHERE is_template = 1;

ALTER TABLE tasks ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE tasks SET user_id = (SELECT id FROM users WHERE email = 'admin@local');
DELETE FROM tasks WHERE user_id IS NULL;

-- Composite primary key forces recreation.
CREATE TABLE queues_v2 (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Now serving',
  now_serving INTEGER NOT NULL DEFAULT 0,
  waiting INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
INSERT INTO queues_v2 (user_id, id, title, now_serving, waiting)
SELECT u.id, q.id, q.title, q.now_serving, q.waiting
FROM queues q JOIN users u ON u.email = 'admin@local';
DROP TABLE queues;
ALTER TABLE queues_v2 RENAME TO queues;

-- Sessions must carry user_id NOT NULL; SQLite can't ALTER that in.
-- The wipe is deliberate: everyone logs in again after the upgrade.
DROP TABLE sessions;
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

DELETE FROM settings WHERE key = 'password_hash';

CREATE INDEX idx_devices_user ON devices(user_id);
CREATE INDEX idx_layouts_user ON layouts(user_id);
CREATE INDEX idx_layouts_published ON layouts(published);
CREATE INDEX idx_tasks_user_list ON tasks(user_id, list_id);
