import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const SUPPORTED_PREFERENCE_TYPES = new Set(["artist", "venue"]);

export function normalizePreferenceValue(value) {
  return value?.trim().toLowerCase() ?? "";
}

export async function withClient(callback) {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function fetchRankedEvents({ startTime, endTime, area, limit = 10 }) {
  return withClient(async (client) => {
    const params = [startTime, endTime];
    let areaClause = "";

    if (area) {
      params.push(area);
      const exactParam = params.length;
      params.push(`%${area}%`);
      const likeParam = params.length;
      areaClause = `AND (v.area = $${exactParam} OR v.name ILIKE $${likeParam} OR v.address ILIKE $${likeParam})`;
    }

    params.push(limit);
    const limitParam = params.length;

    const query = `
      SELECT
        e.id,
        e.name,
        e.start_time,
        e.url,
        v.name AS venue_name,
        v.address AS venue_address,
        top_artist.name AS top_artist_name,
        top_artist.popularity_score AS top_artist_score,
        COALESCE(top_artist.popularity_score, 0) + COALESCE(v.weight, 0) + COALESCE(s.weight, 0) AS rank_score
      FROM events e
      JOIN sources s ON s.id = e.source_id
      LEFT JOIN venues v ON v.id = e.venue_id
      LEFT JOIN LATERAL (
        SELECT a.name, a.popularity_score
        FROM event_artists ea
        JOIN artists a ON a.id = ea.artist_id
        WHERE ea.event_id = e.id
        ORDER BY a.popularity_score DESC, a.name ASC
        LIMIT 1
      ) AS top_artist ON true
      WHERE e.start_time >= $1
        AND e.start_time < $2
        ${areaClause}
      ORDER BY rank_score DESC, e.start_time ASC
      LIMIT $${limitParam};
    `;

    const result = await client.query(query, params);
    return result.rows;
  });
}

export async function addSubscription({ chatId, preferenceType, preferenceValue }) {
  if (!SUPPORTED_PREFERENCE_TYPES.has(preferenceType)) {
    throw new Error(`Unsupported preference type: ${preferenceType}`);
  }

  const normalizedValue = normalizePreferenceValue(preferenceValue);
  if (!normalizedValue) {
    throw new Error("Preference value is required.");
  }

  return withClient(async (client) => {
    const result = await client.query(
      `
        INSERT INTO user_subscriptions (chat_id, preference_type, preference_value, normalized_value)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (chat_id, preference_type, normalized_value) DO NOTHING
        RETURNING id;
      `,
      [chatId, preferenceType, preferenceValue.trim(), normalizedValue]
    );

    return { created: result.rowCount > 0 };
  });
}

export async function removeSubscription({ chatId, preferenceType, preferenceValue }) {
  if (!SUPPORTED_PREFERENCE_TYPES.has(preferenceType)) {
    throw new Error(`Unsupported preference type: ${preferenceType}`);
  }

  const normalizedValue = normalizePreferenceValue(preferenceValue);
  if (!normalizedValue) {
    throw new Error("Preference value is required.");
  }

  return withClient(async (client) => {
    const result = await client.query(
      `
        DELETE FROM user_subscriptions
        WHERE chat_id = $1
          AND preference_type = $2
          AND normalized_value = $3
        RETURNING id;
      `,
      [chatId, preferenceType, normalizedValue]
    );

    return { removed: result.rowCount > 0 };
  });
}

export async function fetchAlertCandidates({ startTime, endTime }) {
  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT
          us.chat_id,
          e.id AS event_id,
          e.name AS event_name,
          e.start_time,
          e.url,
          v.name AS venue_name,
          top_artist.name AS top_artist_name,
          string_agg(DISTINCT CASE WHEN us.preference_type = 'artist' THEN a.name END, ', ') AS matched_artists,
          string_agg(DISTINCT CASE WHEN us.preference_type = 'venue' THEN v.name END, ', ') AS matched_venues
        FROM user_subscriptions us
        JOIN events e ON e.start_time >= $1 AND e.start_time < $2
        LEFT JOIN venues v ON v.id = e.venue_id
        LEFT JOIN LATERAL (
          SELECT a.name
          FROM event_artists ea
          JOIN artists a ON a.id = ea.artist_id
          WHERE ea.event_id = e.id
          ORDER BY a.popularity_score DESC NULLS LAST, a.name ASC
          LIMIT 1
        ) AS top_artist ON true
        LEFT JOIN event_artists ea ON ea.event_id = e.id
        LEFT JOIN artists a ON a.id = ea.artist_id
        WHERE (
          (us.preference_type = 'venue' AND v.normalized_name = us.normalized_value)
          OR (us.preference_type = 'artist' AND a.normalized_name = us.normalized_value)
        )
          AND NOT EXISTS (
            SELECT 1
            FROM user_alerts ua
            WHERE ua.chat_id = us.chat_id
              AND ua.event_id = e.id
          )
        GROUP BY us.chat_id, e.id, e.name, e.start_time, e.url, v.name, top_artist.name
        ORDER BY us.chat_id, e.start_time ASC;
      `,
      [startTime, endTime]
    );

    return result.rows;
  });
}

export async function recordAlerts({ chatId, eventIds }) {
  if (!eventIds.length) {
    return;
  }

  return withClient(async (client) => {
    const params = [chatId, ...eventIds];
    const values = eventIds.map((_, index) => `($1, $${index + 2})`).join(", ");
    await client.query(
      `
        INSERT INTO user_alerts (chat_id, event_id)
        VALUES ${values}
        ON CONFLICT (chat_id, event_id) DO NOTHING;
      `,
      params
    );
  });
}

export async function closePool() {
  await pool.end();
}
