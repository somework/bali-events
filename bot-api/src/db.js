import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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
      params.push(`%${area}%`);
      areaClause = `AND (v.name ILIKE $${params.length} OR v.address ILIKE $${params.length})`;
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

export async function closePool() {
  await pool.end();
}
