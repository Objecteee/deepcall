-- conversations table
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  client_id TEXT,
  title TEXT,
  labels TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- conversation_turns table
CREATE TABLE IF NOT EXISTS conversation_turns (
  turn_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT
);

-- audio_objects table
CREATE TABLE IF NOT EXISTS audio_objects (
  object_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  track TEXT NOT NULL,
  object_key TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  duration_ms INTEGER
);


