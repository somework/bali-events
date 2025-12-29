BEGIN;

CREATE TABLE user_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  chat_id TEXT NOT NULL,
  preference_type TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chat_id, preference_type, normalized_value)
);

CREATE INDEX user_subscriptions_chat_id_idx ON user_subscriptions (chat_id);

CREATE TABLE user_alerts (
  id BIGSERIAL PRIMARY KEY,
  chat_id TEXT NOT NULL,
  event_id BIGINT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chat_id, event_id)
);

CREATE INDEX user_alerts_chat_id_idx ON user_alerts (chat_id);

COMMIT;
