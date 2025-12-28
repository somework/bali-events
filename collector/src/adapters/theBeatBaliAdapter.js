import { load } from "cheerio";
import { normalizeName, toIsoString } from "../utils/normalize.js";

const LISTING_URL = "https://thebeatbali.com/events";

export class TheBeatBaliAdapter {
  constructor() {
    this.sourceName = "thebeatbali";
  }

  async fetchRaw() {
    const response = await fetch(LISTING_URL);
    if (!response.ok) {
      throw new Error(`The Beat Bali request failed: ${response.status}`);
    }

    return response.text();
  }

  async parse(raw) {
    const $ = load(raw);

    return $(".event-card")
      .map((_, element) => {
        const title = $(element).find(".event-card__title").text().trim();
        const url = $(element).find("a").attr("href");
        const dateText = $(element).find(".event-card__date").text().trim();
        const venue = $(element).find(".event-card__venue").text().trim();
        const idMatch = url ? url.match(/events\/(\d+)/) : null;

        return {
          title,
          url: url || null,
          dateText,
          venue,
          sourceEventId: idMatch ? idMatch[1] : url || title,
        };
      })
      .get();
  }

  async normalize(parsed) {
    return parsed
      .map((event) => {
        const startTime = toIsoString(event.dateText);
        if (!event.title || !startTime) {
          return null;
        }

        return {
          source: this.sourceName,
          sourceEventId: event.sourceEventId,
          name: event.title,
          normalizedName: normalizeName(event.title),
          description: null,
          startTime,
          endTime: null,
          venueName: event.venue || null,
          venueAddress: null,
          venueLatitude: null,
          venueLongitude: null,
          url: event.url,
          artists: [],
        };
      })
      .filter(Boolean);
  }
}
