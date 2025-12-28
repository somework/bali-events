import { ResidentAdvisorAdapter } from "./adapters/residentAdvisorAdapter.js";
import { EventbriteAdapter } from "./adapters/eventbriteAdapter.js";
import { TheBeatBaliAdapter } from "./adapters/theBeatBaliAdapter.js";
import {
  closePool,
  getSourceId,
  linkEventArtist,
  upsertArtist,
  upsertEvent,
  upsertVenue,
  withClient,
} from "./db.js";
import { closeQueue, enqueueArtistEnrichment } from "./queue.js";

const adapters = [
  new ResidentAdvisorAdapter(),
  new EventbriteAdapter(),
  new TheBeatBaliAdapter(),
];

async function persistEvents(adapter, events) {
  await withClient(async (client) => {
    const sourceId = await getSourceId(client, adapter.sourceName);

    for (const event of events) {
      await client.query("BEGIN");
      try {
        const venueId = await upsertVenue(client, event);
        const eventId = await upsertEvent(client, sourceId, event, venueId);

        for (const artistName of event.artists) {
          const artistId = await upsertArtist(client, artistName);
          if (artistId) {
            await linkEventArtist(client, eventId, artistId);
            await enqueueArtistEnrichment(artistId, artistName);
          }
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  });
}

async function runAdapter(adapter) {
  const raw = await adapter.fetchRaw();
  const parsed = await adapter.parse(raw);
  const normalized = await adapter.normalize(parsed);
  await persistEvents(adapter, normalized);
}

async function run() {
  for (const adapter of adapters) {
    await runAdapter(adapter);
  }
}

run()
  .catch((error) => {
    console.error("Collector failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeQueue();
    await closePool();
  });
