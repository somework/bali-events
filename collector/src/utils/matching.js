import { normalizeName } from "./normalize.js";

const MATCH_THRESHOLD = 0.82;

function normalizeForMatch(value) {
  return normalizeName(value).replace(/[^a-z0-9\s]/g, "");
}

function bigrams(value) {
  const cleaned = normalizeForMatch(value).replace(/\s+/g, " ");
  if (cleaned.length < 2) {
    return [];
  }

  const pairs = [];
  for (let i = 0; i < cleaned.length - 1; i += 1) {
    pairs.push(cleaned.slice(i, i + 2));
  }
  return pairs;
}

function diceCoefficient(left, right) {
  if (!left && !right) {
    return 1;
  }

  if (!left || !right) {
    return 0;
  }

  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  if (leftBigrams.length === 0 || rightBigrams.length === 0) {
    return 0;
  }

  const rightCounts = new Map();
  for (const pair of rightBigrams) {
    rightCounts.set(pair, (rightCounts.get(pair) || 0) + 1);
  }

  let overlap = 0;
  for (const pair of leftBigrams) {
    const count = rightCounts.get(pair);
    if (count) {
      overlap += 1;
      rightCounts.set(pair, count - 1);
    }
  }

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function normalizeArtists(artists) {
  return (artists || []).map((artist) => normalizeName(artist)).filter(Boolean);
}

function hasArtistOverlap(incomingArtists, candidateArtists) {
  if (!incomingArtists.length || !candidateArtists.length) {
    return true;
  }

  const candidateSet = new Set(candidateArtists);
  return incomingArtists.some((artist) => candidateSet.has(artist));
}

function metadataScoreFromIncoming(event) {
  let score = 0;
  if (event.description) score += 1;
  if (event.endTime) score += 1;
  if (event.url) score += 1;
  if (event.venueName) score += 1;
  if (event.venueAddress) score += 1;
  if (event.venueLatitude != null) score += 1;
  if (event.venueLongitude != null) score += 1;
  if (event.artists && event.artists.length > 0) score += 1;
  return score;
}

function metadataScoreFromCandidate(candidate) {
  let score = 0;
  if (candidate.description) score += 1;
  if (candidate.end_time) score += 1;
  if (candidate.url) score += 1;
  if (candidate.venue_name) score += 1;
  if (candidate.venue_address) score += 1;
  if (candidate.venue_latitude != null) score += 1;
  if (candidate.venue_longitude != null) score += 1;
  if (candidate.artist_names && candidate.artist_names.length > 0) score += 1;
  return score;
}

function calculateMatchScore(event, candidate) {
  const nameScore = diceCoefficient(event.name, candidate.name);
  const venueScore = diceCoefficient(event.venueName, candidate.venue_name);

  if (event.venueName && candidate.venue_name) {
    return nameScore * 0.7 + venueScore * 0.3;
  }

  return nameScore;
}

export function selectBestMatch(event, candidates, sourceWeight) {
  const normalizedArtists = normalizeArtists(event.artists);
  const normalizedEvent = {
    ...event,
    name: normalizeForMatch(event.name),
    venueName: normalizeForMatch(event.venueName),
  };

  let best = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const normalizedCandidate = {
      ...candidate,
      name: normalizeForMatch(candidate.name),
      venue_name: normalizeForMatch(candidate.venue_name),
    };

    const score = calculateMatchScore(normalizedEvent, normalizedCandidate);
    if (score < MATCH_THRESHOLD) {
      continue;
    }

    const candidateArtists = normalizeArtists(candidate.artist_names);
    if (!hasArtistOverlap(normalizedArtists, candidateArtists)) {
      continue;
    }

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (!best) {
    return null;
  }

  const candidateWeight = best.source_weight ?? 0;
  let shouldUpdate = false;
  if (sourceWeight > candidateWeight) {
    shouldUpdate = true;
  } else if (sourceWeight === candidateWeight) {
    const incomingScore = metadataScoreFromIncoming(event);
    const candidateScore = metadataScoreFromCandidate(best);
    shouldUpdate = incomingScore > candidateScore;
  }

  return {
    candidate: best,
    shouldUpdate,
    matchScore: bestScore,
  };
}
