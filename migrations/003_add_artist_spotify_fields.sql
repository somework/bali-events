BEGIN;

ALTER TABLE artists
  ADD COLUMN popularity_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN spotify_id TEXT,
  ADD COLUMN spotify_url TEXT,
  ADD COLUMN spotify_updated_at TIMESTAMPTZ,
  ADD COLUMN spotify_unavailable BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX artists_popularity_score_idx ON artists (popularity_score);

COMMIT;
