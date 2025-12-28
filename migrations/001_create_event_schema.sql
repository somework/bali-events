BEGIN;

CREATE TABLE sources (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  weight INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE venues (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0,
  address TEXT,
  latitude NUMERIC(9, 6),
  longitude NUMERIC(9, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX venues_normalized_name_idx ON venues (normalized_name);

CREATE TABLE artists (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX artists_normalized_name_idx ON artists (normalized_name);

CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES sources (id) ON DELETE RESTRICT,
  source_event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  venue_id BIGINT REFERENCES venues (id) ON DELETE SET NULL,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, source_event_id)
);

CREATE INDEX events_start_time_idx ON events (start_time);
CREATE INDEX events_venue_id_idx ON events (venue_id);
CREATE INDEX events_normalized_name_idx ON events (normalized_name);

CREATE TABLE event_artists (
  event_id BIGINT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  artist_id BIGINT NOT NULL REFERENCES artists (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, artist_id)
);

CREATE INDEX event_artists_artist_id_idx ON event_artists (artist_id);

INSERT INTO sources (name, weight) VALUES
  ('manual', 100),
  ('resident_advisor', 90),
  ('eventbrite', 80),
  ('instagram', 70);

INSERT INTO venues (name, normalized_name, weight, address) VALUES
  ('Savaya Bali', 'savaya bali', 100, 'Uluwatu, Bali'),
  ('Atlas Beach Club', 'atlas beach club', 90, 'Canggu, Bali'),
  ('Finns Beach Club', 'finns beach club', 85, 'Canggu, Bali');

COMMIT;
