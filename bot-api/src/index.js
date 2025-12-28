import express from "express";
import {
  buildTelegramMessage,
  listSupportedAreas,
  parseTelegramCommand,
  publishTelegramMessage,
  resolveArea,
} from "./telegram.js";
import { closePool } from "./db.js";

const app = express();
const port = Number.parseInt(process.env.BOT_API_PORT ?? "8080", 10);

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

app.post("/telegram/publish", async (req, res) => {
  try {
    const { command, rangeKey, area: areaInput } = req.body ?? {};
    let parsed = null;

    if (command) {
      parsed = parseTelegramCommand(command);
      if (!parsed) {
        res.status(400).json({ error: "Command must be /today or /week." });
        return;
      }
    } else if (rangeKey) {
      parsed = { rangeKey, area: null, areaInput: null };
    } else {
      res.status(400).json({ error: "Provide command or rangeKey." });
      return;
    }

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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const server = app.listen(port, () => {
  console.log(`Bot API listening on port ${port}`);
});

async function shutdown() {
  server.close();
  await closePool();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
