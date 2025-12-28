import { Queue } from "bullmq";

const connection = {
  url: process.env.REDIS_URL,
};

export const artistQueue = new Queue("artist-enrichment", { connection });

export async function enqueueArtistEnrichment(artistId, name) {
  if (!artistId) {
    return;
  }

  await artistQueue.add(
    "enrich-artist",
    { artistId, name },
    { jobId: `artist:${artistId}` }
  );
}

export async function closeQueue() {
  await artistQueue.close();
}
