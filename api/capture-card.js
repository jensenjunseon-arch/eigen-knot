import { authed } from "./_auth.js";
import { launchBrowser } from "../capture/browser.mjs";
import { captureCardViaUrl } from "../capture/serverless.mjs";

// POST { deck, index } → { name, b64, overflow, total } — ONE card per call.
// The client loops over the deck's active cards and assembles the ZIP in the
// browser, so no response ever nears Vercel's 4.5MB limit and no invocation
// nears the duration cap. The Chromium instance is cached on globalThis and
// reused across warm invocations (first call pays the launch, the rest are fast).

async function getBrowser() {
  if (!globalThis.__ekBrowser) {
    globalThis.__ekBrowser = launchBrowser().catch((e) => {
      globalThis.__ekBrowser = undefined;
      throw e;
    });
  }
  return globalThis.__ekBrowser;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!authed(req)) return res.status(401).json({ error: "비밀번호가 필요합니다." });

  const { deck, index } = req.body || {};
  if (!deck || !deck.meta || !deck.meta.slug || !Number.isInteger(index))
    return res.status(400).json({ error: "deck과 index가 필요합니다." });
  if (!deck.bg || !String(deck.bg).startsWith("data:"))
    return res.status(400).json({ error: "배경 이미지를 먼저 업로드하세요." });

  try {
    const browser = await getBrowser();
    const card = await captureCardViaUrl(deck, index, { browser });
    res.status(200).json({
      name: card.name,
      b64: card.buffer.toString("base64"),
      overflow: card.overflow,
      total: card.total,
    });
  } catch (e) {
    globalThis.__ekBrowser = undefined; // crashed browser → relaunch next call
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
