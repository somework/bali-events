import { normalizeName } from "./normalize.js";

const VENUE_REFERENCES = [
  {
    name: "Savaya Bali",
    aliases: ["Savaya"],
    area: "Uluwatu",
    latitude: -8.829292,
    longitude: 115.165542,
    address: "Uluwatu, Bali",
  },
  {
    name: "Atlas Beach Club",
    aliases: ["Atlas Beach Club Bali"],
    area: "Canggu",
    latitude: -8.669947,
    longitude: 115.139536,
    address: "Pantai Berawa, Canggu",
  },
  {
    name: "Finns Beach Club",
    aliases: ["FINNS Beach Club", "Finns"],
    area: "Canggu",
    latitude: -8.660849,
    longitude: 115.131617,
    address: "Berawa, Canggu",
  },
  {
    name: "La Favela",
    aliases: ["La Favela Bali"],
    area: "Seminyak",
    latitude: -8.686229,
    longitude: 115.164178,
    address: "Seminyak, Bali",
  },
  {
    name: "Potato Head Beach Club",
    aliases: ["Potato Head", "Desa Potato Head"],
    area: "Seminyak",
    latitude: -8.675125,
    longitude: 115.149931,
    address: "Seminyak, Bali",
  },
];

const AREA_KEYWORDS = {
  Canggu: ["canggu", "berawa", "pererenan"],
  Seminyak: ["seminyak", "petitenget"],
  Uluwatu: ["uluwatu", "pecatu"],
};

function normalizeVenueKey(value) {
  return normalizeName(value).replace(/[^a-z0-9\s]/g, "");
}

const VENUE_LOOKUP = new Map();
for (const venue of VENUE_REFERENCES) {
  const keys = [venue.name, ...(venue.aliases ?? [])].map(normalizeVenueKey).filter(Boolean);
  for (const key of keys) {
    VENUE_LOOKUP.set(key, venue);
  }
}

export function findVenueReference(venueName) {
  if (!venueName) {
    return null;
  }

  return VENUE_LOOKUP.get(normalizeVenueKey(venueName)) ?? null;
}

export function inferAreaFromText(text) {
  if (!text) {
    return null;
  }

  const normalized = normalizeName(text);
  for (const [area, keywords] of Object.entries(AREA_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return area;
    }
  }

  return null;
}

export function enrichEventVenue(event) {
  const reference = findVenueReference(event.venueName);
  const venueArea =
    event.venueArea ?? reference?.area ?? inferAreaFromText(event.venueAddress) ?? null;
  const inferredArea = venueArea ?? inferAreaFromText(event.venueName);

  return {
    ...event,
    venueArea: inferredArea,
    venueLatitude: event.venueLatitude ?? reference?.latitude ?? null,
    venueLongitude: event.venueLongitude ?? reference?.longitude ?? null,
    venueAddress: event.venueAddress ?? reference?.address ?? null,
  };
}

export function listVenueReferences() {
  return VENUE_REFERENCES;
}
