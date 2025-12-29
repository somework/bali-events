import { load } from "cheerio";
import { fetchPageContent } from "../utils/playwright.js";
import { normalizeName, toIsoString } from "../utils/normalize.js";
import { enrichEventVenue } from "../utils/venues.js";

const LISTING_URL = "https://www.eventbrite.com/d/indonesia--bali/music--events/";

export class EventbriteAdapter {
  constructor() {
    this.sourceName = "eventbrite";
  }

  async fetchRaw() {
    return fetchPageContent(LISTING_URL);
  }

  async parse(raw) {
    const $ = load(raw);

    return $("div.search-event-card-wrapper")
      .map((_, element) => {
        const title = $(element).find("div.eds-event-card__formatted-name--is-clamped").text().trim();
        const url = $(element).find("a.eds-event-card-content__action-link").attr("href");
        const dateText = $(element).find("div.eds-event-card-content__sub-title").first().text().trim();
        const location = $(element).find("div.eds-event-card-content__sub-title").last().text().trim();
        const idMatch = url ? url.match(/eventbrite\.com\/e\/(\d+)/) : null;

        return {
          title,
          url: url || null,
          dateText,
          location,
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

        return enrichEventVenue({
          source: this.sourceName,
          sourceEventId: event.sourceEventId,
          name: event.title,
          normalizedName: normalizeName(event.title),
          description: null,
          startTime,
          endTime: null,
          venueName: event.location || null,
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
