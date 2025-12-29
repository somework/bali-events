import express from "express";
import {
  buildAlertMessage,
  buildTelegramMessage,
  listSupportedAreas,
  parseTelegramCommand,
  publishTelegramMessage,
  resolveArea,
} from "./telegram.js";
import {
  addSubscription,
  closePool,
  deleteAlerts,
  fetchAlertCandidates,
  recordAlerts,
  removeSubscription,
} from "./db.js";

const app = express();
const port = Number.parseInt(process.env.BOT_API_PORT ?? "8080", 10);
const alertLookaheadDays = Number.parseInt(process.env.ALERT_LOOKAHEAD_DAYS ?? "7", 10);
const alertPollIntervalMs = Number.parseInt(process.env.ALERT_POLL_INTERVAL_MS ?? "300000", 10);

app.use(express.json());

function validateAreaInput(rawInput) {
  if (!rawInput) {
    return { area: null, error: null };
  }

  const { area, raw } = resolveArea(rawInput);
  if (!area) {
    return {
      area: null,
      error: `Unsupported area '${raw}'. Supported areas: ${listSupportedAreas().join(", ")}.`,
    };
  }

  return { area, error: null };
}

app.get("/today", async (req, res) => {
  try {
    const { area, error } = validateAreaInput(req.query.area);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const text = await buildTelegramMessage({ rangeKey: "today", area });
    res.json({ text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/week", async (req, res) => {
  try {
    const { area, error } = validateAreaInput(req.query.area);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const text = await buildTelegramMessage({ rangeKey: "week", area });
    res.json({ text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function requireCommandAuth(req, res) {
  const expectedKey = process.env.TELEGRAM_COMMAND_API_KEY;
  if (!expectedKey) {
    res.status(500).json({ error: "TELEGRAM_COMMAND_API_KEY must be set." });
    return false;
  }

  const providedKey = req.headers["x-api-key"];
  if (!providedKey || providedKey !== expectedKey) {
    res.status(401).json({ error: "Unauthorized." });
    return false;
  }

  return true;
}

app.post("/telegram/command", async (req, res) => {
  try {
    if (!requireCommandAuth(req, res)) {
      return;
    }

    const { command, chatId } = req.body ?? {};
    if (!command || !chatId) {
      res.status(400).json({ error: "Provide command and chatId." });
      return;
    }

    const parsed = parseTelegramCommand(command);
    if (!parsed) {
      res.status(400).json({
        error: "Command must be /today, /week, /subscribe artist|venue <name>, or /unsubscribe artist|venue <name>.",
      });
      return;
    }

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      res.status(500).json({ error: "TELEGRAM_BOT_TOKEN is required to publish messages." });
      return;
    }

    if (parsed.kind === "range") {
      const { area, error } = validateAreaInput(parsed.areaInput);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const text = await buildTelegramMessage({ rangeKey: parsed.rangeKey, area });
      await publishTelegramMessage({ token: process.env.TELEGRAM_BOT_TOKEN, chatId, text });
      res.json({ status: "sent", text });
      return;
    }

    const subscriptionResult =
      parsed.action === "subscribe"
        ? await addSubscription({
            chatId,
            preferenceType: parsed.preferenceType,
            preferenceValue: parsed.preferenceValue,
          })
        : await removeSubscription({
            chatId,
            preferenceType: parsed.preferenceType,
            preferenceValue: parsed.preferenceValue,
          });

    const actionLabel = parsed.action === "subscribe" ? "Subscribed to" : "Unsubscribed from";
    const responseText = subscriptionResult.created || subscriptionResult.removed
      ? `${actionLabel} ${parsed.preferenceType}: ${parsed.preferenceValue}.`
      : `No change. You're already ${parsed.action === "subscribe" ? "subscribed to" : "not subscribed to"} ${parsed.preferenceType}: ${parsed.preferenceValue}.`;

    await publishTelegramMessage({ token: process.env.TELEGRAM_BOT_TOKEN, chatId, text: responseText });
    res.json({ status: "sent", text: responseText });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/telegram/publish", async (req, res) => {
  try {
    const { command, rangeKey, area: areaInput } = req.body ?? {};
    let parsed = null;

    if (command) {
      parsed = parseTelegramCommand(command);
      if (!parsed) {
        res.status(400).json({
          error: "Command must be /today, /week, /subscribe artist|venue <name>, or /unsubscribe artist|venue <name>.",
        });
        return;
      }
    } else if (rangeKey) {
      parsed = { kind: "range", rangeKey, area: null, areaInput: null };
    } else {
      res.status(400).json({ error: "Provide command or rangeKey." });
      return;
    }

    if (parsed.kind === "range") {
      const { area, error } = validateAreaInput(areaInput ?? parsed.areaInput);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const text = await buildTelegramMessage({ rangeKey: parsed.rangeKey, area });
      await publishTelegramMessage({
        token: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
        text,
      });

      res.json({ status: "sent", text });
      return;
    }

    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!chatId) {
      res.status(500).json({ error: "TELEGRAM_CHAT_ID is required for subscription commands." });
      return;
    }

    const subscriptionResult =
      parsed.action === "subscribe"
        ? await addSubscription({
            chatId,
            preferenceType: parsed.preferenceType,
            preferenceValue: parsed.preferenceValue,
          })
        : await removeSubscription({
            chatId,
            preferenceType: parsed.preferenceType,
            preferenceValue: parsed.preferenceValue,
          });

    const actionLabel = parsed.action === "subscribe" ? "Subscribed to" : "Unsubscribed from";
    const responseText = subscriptionResult.created || subscriptionResult.removed
      ? `${actionLabel} ${parsed.preferenceType}: ${parsed.preferenceValue}.`
      : `No change. You're already ${parsed.action === "subscribe" ? "subscribed to" : "not subscribed to"} ${parsed.preferenceType}: ${parsed.preferenceValue}.`;

    await publishTelegramMessage({
      token: process.env.TELEGRAM_BOT_TOKEN,
      chatId,
      text: responseText,
    });

    res.json({ status: "sent", text: responseText });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const server = app.listen(port, () => {
  console.log(`Bot API listening on port ${port}`);
});

let alertInterval = null;

async function sendScheduledAlerts() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return;
  }

  const startTime = new Date();
  const endTime = new Date(startTime);
  endTime.setDate(endTime.getDate() + alertLookaheadDays);

  const candidates = await fetchAlertCandidates({ startTime, endTime });
  if (!candidates.length) {
    return;
  }

  const grouped = candidates.reduce((acc, row) => {
    if (!acc[row.chat_id]) {
      acc[row.chat_id] = [];
    }
    acc[row.chat_id].push(row);
    return acc;
  }, {});

  for (const [chatId, events] of Object.entries(grouped)) {
    const eventIds = events.map((event) => event.event_id);
    try {
      await recordAlerts({ chatId, eventIds });
      const text = buildAlertMessage({ events });
      await publishTelegramMessage({ token: process.env.TELEGRAM_BOT_TOKEN, chatId, text });
    } catch (error) {
      await deleteAlerts({ chatId, eventIds });
      console.error(`Failed to send alerts to ${chatId}:`, error);
    }
  }
}

if (alertPollIntervalMs > 0) {
  alertInterval = setInterval(() => {
    sendScheduledAlerts().catch((error) => {
      console.error("Scheduled alert processing failed:", error);
    });
  }, alertPollIntervalMs);
}

async function shutdown() {
  if (alertInterval) {
    clearInterval(alertInterval);
  }
  server.close();
  await closePool();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
