import pg from "pg";
import { normalizeName } from "./utils/normalize.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function getSourceId(client, name) {
  const existing = await client.query("SELECT id FROM sources WHERE name = $1", [name]);
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    "INSERT INTO sources (name, weight) VALUES ($1, 50) RETURNING id",
    [name]
  );
  return inserted.rows[0].id;
}

export async function upsertVenue(client, event) {
  if (!event.venueName) {
    return null;
  }

  const normalized = normalizeName(event.venueName);
  const existing = await client.query(
    "SELECT id FROM venues WHERE normalized_name = $1 ORDER BY id LIMIT 1",
    [normalized]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    "INSERT INTO venues (name, normalized_name, address, latitude, longitude) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [
      event.venueName,
      normalized,
      event.venueAddress,
      event.venueLatitude,
      event.venueLongitude,
    ]
  );
  return inserted.rows[0].id;
}

export async function upsertArtist(client, name) {
  if (!name) {
    return null;
  }

  const normalized = normalizeName(name);
  const result = await client.query(
    "INSERT INTO artists (name, normalized_name) VALUES ($1, $2) ON CONFLICT (normalized_name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
    [name, normalized]
  );

  return result.rows[0].id;
}

export async function upsertEvent(client, sourceId, event, venueId) {
  const result = await client.query(
    "INSERT INTO events (source_id, source_event_id, name, normalized_name, description, start_time, end_time, venue_id, url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (source_id, source_event_id) DO UPDATE SET name = EXCLUDED.name, normalized_name = EXCLUDED.normalized_name, description = EXCLUDED.description, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, venue_id = EXCLUDED.venue_id, url = EXCLUDED.url RETURNING id",
    [
      sourceId,
      event.sourceEventId,
      event.name,
      event.normalizedName,
      event.description,
      event.startTime,
      event.endTime,
      venueId,
      event.url,
    ]
  );

  return result.rows[0].id;
}

export async function linkEventArtist(client, eventId, artistId) {
  await client.query(
    "INSERT INTO event_artists (event_id, artist_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [eventId, artistId]
  );
}

export async function withClient(callback) {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
