import { authed } from "./_auth.js";
import { generateCaption } from "../content/caption.mjs";

// POST { deck, lang, model, variation } → { caption, hashtags }
// Instagram caption + hashtags for a deck. Spends Claude credits, so it carries
// the same crude per-instance rate limit as /api/analyze.
const RATE_LIMIT = { windowMs: 60_000, max: 12 };
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (list.length >= RATE_LIMIT.max) return true;
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 1000) hits.clear();
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!authed(req)) return res.status(401).json({ error: "비밀번호가 필요합니다." });
  try {
    const { deck, lang, model, variation } = req.body || {};
    if (!deck || !deck.content) return res.status(400).json({ error: "덱 내용이 없습니다." });
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "?";
    if (rateLimited(ip)) return res.status(429).json({ error: "요청이 너무 잦습니다. 1분 뒤 다시 시도해 주세요." });
    if (!process.env.ANTHROPIC_API_KEY)
      return res.status(400).json({ error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다." });
    const result = await generateCaption(deck, { lang: lang === "en" ? "en" : "ko", model: model || "sonnet", variation: Number(variation) || 0 });
    res.status(200).json(result); // { caption, hashtags }
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
