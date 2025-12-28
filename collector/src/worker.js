import { Worker } from "bullmq";
import { closePool, updateArtistPopularity, withClient } from "./db.js";

const connection = {
  url: process.env.REDIS_URL,
};

class SpotifyUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "SpotifyUnavailableError";
  }
}

let spotifyToken = null;
let spotifyTokenExpiresAt = 0;

function isTokenValid() {
  return spotifyToken && Date.now() < spotifyTokenExpiresAt;
}

async function fetchSpotifyToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new SpotifyUnavailableError("Spotify credentials missing");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    if ([429, 500, 502, 503].includes(response.status)) {
      throw new SpotifyUnavailableError(
        `Spotify token unavailable: ${response.status}`
      );
    }
    throw new Error(`Spotify token request failed: ${response.status}`);
  }

  const payload = await response.json();
  spotifyToken = payload.access_token;
  spotifyTokenExpiresAt = Date.now() + (payload.expires_in - 60) * 1000;
  return spotifyToken;
}

async function getSpotifyToken() {
  if (isTokenValid()) {
    return spotifyToken;
  }
  return fetchSpotifyToken();
}

async function fetchSpotifyArtist(name) {
  const token = await getSpotifyToken();
  const query = new URLSearchParams({
    q: name,
    type: "artist",
    limit: "1",
  });

  const response = await fetch(
    `https://api.spotify.com/v1/search?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (response.status === 401) {
    spotifyToken = null;
    const refreshed = await getSpotifyToken();
    const retryResponse = await fetch(
      `https://api.spotify.com/v1/search?${query.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${refreshed}`,
        },
      }
    );
    if (!retryResponse.ok) {
      if ([429, 500, 502, 503].includes(retryResponse.status)) {
        throw new SpotifyUnavailableError(
          `Spotify search unavailable: ${retryResponse.status}`
        );
      }
      throw new Error(`Spotify search failed: ${retryResponse.status}`);
    }
    const retryPayload = await retryResponse.json();
    return retryPayload.artists?.items?.[0] ?? null;
  }

  if (!response.ok) {
    if ([429, 500, 502, 503].includes(response.status)) {
      throw new SpotifyUnavailableError(
        `Spotify search unavailable: ${response.status}`
      );
    }
    throw new Error(`Spotify search failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload.artists?.items?.[0] ?? null;
}

function computePopularityScore(artist) {
  if (!artist || typeof artist.popularity !== "number") {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(artist.popularity)));
}

async function enrichArtist({ artistId, name }) {
  const spotifyArtist = await fetchSpotifyArtist(name);
  const popularityScore = computePopularityScore(spotifyArtist);

  await withClient(async (client) => {
    await updateArtistPopularity(client, artistId, {
      popularityScore,
      spotifyId: spotifyArtist?.id ?? null,
      spotifyUrl: spotifyArtist?.external_urls?.spotify ?? null,
      spotifyUnavailable: false,
    });
  });
}

async function markFallback(artistId) {
  await withClient(async (client) => {
    await updateArtistPopularity(client, artistId, {
      popularityScore: 0,
      spotifyId: null,
      spotifyUrl: null,
      spotifyUnavailable: true,
    });
  });
}

const worker = new Worker(
  "artist-enrichment",
  async (job) => {
    const { artistId, name } = job.data;
    try {
      await enrichArtist({ artistId, name });
    } catch (error) {
      if (error instanceof SpotifyUnavailableError) {
        const attempts = job.opts.attempts ?? 1;
        if (job.attemptsMade + 1 < attempts) {
          throw error;
        }
        await markFallback(artistId);
        return;
      }
      throw error;
    }
  },
  { connection }
);

worker.on("failed", (job, error) => {
  console.error(`Artist enrichment failed for job ${job?.id}`, error);
});

async function shutdown() {
  await worker.close();
  await closePool();
}

process.on("SIGINT", () => {
  shutdown().catch((error) => {
    console.error("Worker shutdown failed", error);
  });
});

process.on("SIGTERM", () => {
  shutdown().catch((error) => {
    console.error("Worker shutdown failed", error);
  });
});
