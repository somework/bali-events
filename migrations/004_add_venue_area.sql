BEGIN;

ALTER TABLE venues
  ADD COLUMN area TEXT;

CREATE INDEX venues_area_idx ON venues (area);

COMMIT;
