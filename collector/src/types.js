/**
 * @typedef {Object} EventDTO
 * @property {string} source
 * @property {string} sourceEventId
 * @property {string} name
 * @property {string} normalizedName
 * @property {string | null} description
 * @property {string} startTime
 * @property {string | null} endTime
 * @property {string | null} venueName
 * @property {string | null} venueAddress
 * @property {number | null} venueLatitude
 * @property {number | null} venueLongitude
 * @property {string | null} url
 * @property {string[]} artists
 */

/**
 * @typedef {Object} Adapter
 * @property {string} sourceName
 * @property {() => Promise<unknown>} fetchRaw
 * @property {(raw: unknown) => Promise<unknown[]>} parse
 * @property {(parsed: unknown[]) => Promise<EventDTO[]>} normalize
 */

export {};
