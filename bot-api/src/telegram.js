import { fetchRankedEvents } from "./db.js";

const AREA_ALIASES = {
  canggu: "Canggu",
  seminyak: "Seminyak",
  uluwatu: "Uluwatu",
};

const RANGE_DEFINITIONS = {
  today: { label: "Today", days: 1 },
  week: { label: "This Week", days: 7 },
};

const DISPLAY_TIME_ZONE = "Asia/Makassar";

export function resolveArea(input) {
  if (!input) {
    return { area: null, raw: null };
  }

  const raw = input.trim().toLowerCase();
  if (!raw) {
    return { area: null, raw: null };
  }

  return { area: AREA_ALIASES[raw] ?? null, raw };
}

export function parseTelegramCommand(text) {
  if (!text) {
    return null;
  }

  const parts = text.trim().split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const rangeKey = command === "/today" ? "today" : command === "/week" ? "week" : null;

  if (!rangeKey) {
    return null;
  }

  const areaInput = parts.slice(1).join(" ");
  const { area, raw } = resolveArea(areaInput);

  return {
    rangeKey,
    area,
    areaInput: raw,
  };
}

export function buildTimeWindow(rangeKey, now = new Date()) {
  const definition = RANGE_DEFINITIONS[rangeKey];
  if (!definition) {
    throw new Error(`Unsupported range: ${rangeKey}`);
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + definition.days);

  return {
    label: definition.label,
    start,
    end,
  };
}

export async function buildTelegramMessage({ rangeKey, area, limit = 10 }) {
  const { label, start, end } = buildTimeWindow(rangeKey);
  const events = await fetchRankedEvents({
    startTime: start,
    endTime: end,
    area,
    limit,
  });

  const areaLabel = area ? ` (${area})` : "";
  if (events.length === 0) {
    return `No events found for ${label.toLowerCase()}${areaLabel}.`;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  });

  const lines = [`${label} Events${areaLabel}:`];
  for (const event of events) {
    const dateLabel = formatter.format(new Date(event.start_time));
    const venueLabel = event.venue_name || "Venue TBA";
    const artistLabel = event.top_artist_name || "Artist TBA";
    const ticketLabel = event.url ? `Tickets: ${event.url}` : "Tickets: TBA";

    lines.push(`${dateLabel} — ${venueLabel}`);
    lines.push(`Top artist: ${artistLabel}`);
    lines.push(ticketLabel);
    lines.push("");
  }

  return lines.join("\n").trim();
}

export async function publishTelegramMessage({ token, chatId, text }) {
  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required to publish messages.");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${errorBody}`);
  }

  return response.json();
}

export function listSupportedAreas() {
  return Object.values(AREA_ALIASES);
}
