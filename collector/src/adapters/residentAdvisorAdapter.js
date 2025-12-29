import { load } from "cheerio";
import { fetchPageContent } from "../utils/playwright.js";
import { normalizeName, toIsoString } from "../utils/normalize.js";
import { enrichEventVenue } from "../utils/venues.js";

const LISTING_URL = "https://ra.co/events/id/bali";

export class ResidentAdvisorAdapter {
  constructor() {
    this.sourceName = "resident_advisor";
  }

  async fetchRaw() {
    return fetchPageContent(LISTING_URL);
  }

  async parse(raw) {
    const $ = load(raw);

    return $(".EventListItem")
      .map((_, element) => {
        const name = $(element).find(".EventListItem__title").text().trim();
        const url = $(element).find("a").attr("href");
        const dateText = $(element).find(".EventListItem__date").text().trim();
        const venue = $(element).find(".EventListItem__venue").text().trim();
        const idMatch = url ? url.match(/events\/(\d+)/) : null;

        return {
          name,
          url: url ? `https://ra.co${url}` : null,
          dateText,
          venue,
          sourceEventId: idMatch ? idMatch[1] : url || name,
        };
      })
      .get();
  }

  async normalize(parsed) {
    return parsed
      .map((event) => {
        const startTime = toIsoString(event.dateText);
        if (!event.name || !startTime) {
          return null;
        }

        return enrichEventVenue({
          source: this.sourceName,
          sourceEventId: event.sourceEventId,
          name: event.name,
          normalizedName: normalizeName(event.name),
          description: null,
          startTime,
          endTime: null,
          venueName: event.venue || null,
          venueAddress: null,
          venueArea: null,
          venueLatitude: null,
          venueLongitude: null,
          url: event.url,
          artists: [],
        });
      })
      .filter(Boolean);
  }
}
