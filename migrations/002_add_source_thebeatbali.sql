BEGIN;

INSERT INTO sources (name, weight)
VALUES ('thebeatbali', 75)
ON CONFLICT (name) DO NOTHING;

COMMIT;
