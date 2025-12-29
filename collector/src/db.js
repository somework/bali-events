import pg from "pg";
import { normalizeName } from "./utils/normalize.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function getSourceInfo(client, name) {
  const existing = await client.query("SELECT id, weight FROM sources WHERE name = $1", [name]);
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const inserted = await client.query(
    "INSERT INTO sources (name, weight) VALUES ($1, 50) RETURNING id, weight",
    [name]
  );
  return inserted.rows[0];
}

export async function upsertVenue(client, event) {
  if (!event.venueName) {
    return null;
  }

  const normalized = normalizeName(event.venueName);
  const existing = await client.query(
    "SELECT id, area, address, latitude, longitude FROM venues WHERE normalized_name = $1 ORDER BY id LIMIT 1",
    [normalized]
  );
  if (existing.rows.length > 0) {
    const [venue] = existing.rows;
    const nextArea = venue.area ?? event.venueArea ?? null;
    const nextAddress = venue.address ?? event.venueAddress ?? null;
    const nextLatitude = venue.latitude ?? event.venueLatitude ?? null;
    const nextLongitude = venue.longitude ?? event.venueLongitude ?? null;

    if (
      nextArea !== venue.area ||
      nextAddress !== venue.address ||
      nextLatitude !== venue.latitude ||
      nextLongitude !== venue.longitude
    ) {
      await client.query(
        "UPDATE venues SET area = $2, address = $3, latitude = $4, longitude = $5 WHERE id = $1",
        [venue.id, nextArea, nextAddress, nextLatitude, nextLongitude]
      );
    }

    return venue.id;
  }

  const inserted = await client.query(
    "INSERT INTO venues (name, normalized_name, area, address, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [
      event.venueName,
      normalized,
      event.venueArea,
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

export async function updateEvent(client, eventId, sourceId, event, venueId) {
  await client.query(
    "UPDATE events SET source_id = $1, source_event_id = $2, name = $3, normalized_name = $4, description = $5, start_time = $6, end_time = $7, venue_id = $8, url = $9 WHERE id = $10",
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
      eventId,
    ]
  );
}

export async function findEventCandidates(client, { startTime }) {
  if (!startTime) {
    return [];
  }

  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) {
    return [];
  }

  const windowStart = new Date(start.getTime() - 6 * 60 * 60 * 1000);
  const windowEnd = new Date(start.getTime() + 6 * 60 * 60 * 1000);

  const result = await client.query(
    `SELECT
      events.id,
      events.name,
      events.normalized_name,
      events.description,
      events.start_time,
      events.end_time,
      events.venue_id,
      events.url,
      events.source_id,
      sources.weight AS source_weight,
      venues.name AS venue_name,
      venues.normalized_name AS venue_normalized_name,
      venues.address AS venue_address,
      venues.latitude AS venue_latitude,
      venues.longitude AS venue_longitude,
      ARRAY_REMOVE(ARRAY_AGG(artists.normalized_name), NULL) AS artist_names
    FROM events
    LEFT JOIN sources ON events.source_id = sources.id
    LEFT JOIN venues ON events.venue_id = venues.id
    LEFT JOIN event_artists ON events.id = event_artists.event_id
    LEFT JOIN artists ON event_artists.artist_id = artists.id
    WHERE events.start_time BETWEEN $1 AND $2
    GROUP BY
      events.id,
      sources.weight,
      venues.name,
      venues.normalized_name,
      venues.address,
      venues.latitude,
      venues.longitude`,
    [windowStart.toISOString(), windowEnd.toISOString()]
  );

  return result.rows;
}

export async function linkEventArtist(client, eventId, artistId) {
  await client.query(
    "INSERT INTO event_artists (event_id, artist_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [eventId, artistId]
  );
}

export async function updateArtistPopularity(
  client,
  artistId,
  { popularityScore, spotifyId, spotifyUrl, spotifyUnavailable }
) {
  await client.query(
    "UPDATE artists SET popularity_score = $1, spotify_id = $2, spotify_url = $3, spotify_updated_at = NOW(), spotify_unavailable = $4 WHERE id = $5",
    [popularityScore, spotifyId, spotifyUrl, spotifyUnavailable, artistId]
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
