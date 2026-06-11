import { authed } from "./_auth.js";
import { analyzeArticle } from "../content/analyze.mjs";

// POST { body, meta, model } → { title, cards, content } (Claude draft). Reads
// ANTHROPIC_API_KEY from the Vercel env.
//
// Cost guards (this is the only endpoint that spends API credits):
//  • article length cap — a paste of a whole book would burn tokens for nothing
//  • per-instance rate limit — crude (Lambda instances don't share memory) but
//    stops rapid-fire abuse on a warm instance without any infra.
const MAX_ARTICLE_CHARS = 50_000;
const RATE_LIMIT = { windowMs: 60_000, max: 8 };
const hits = new Map(); // ip → timestamps

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (list.length >= RATE_LIMIT.max) return true;
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 1000) hits.clear(); // unbounded-growth guard
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!authed(req)) return res.status(401).json({ error: "비밀번호가 필요합니다." });
  try {
    const { body, meta, model } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: "본문이 비어 있습니다." });
    if (body.length > MAX_ARTICLE_CHARS)
      return res.status(400).json({ error: `본문이 너무 깁니다 (${body.length.toLocaleString()}자). ${MAX_ARTICLE_CHARS.toLocaleString()}자 이하로 줄여 주세요.` });
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "?";
    if (rateLimited(ip))
      return res.status(429).json({ error: "요청이 너무 잦습니다. 1분 뒤 다시 시도해 주세요." });
    if (!process.env.ANTHROPIC_API_KEY)
      return res.status(400).json({ error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다." });
    const result = await analyzeArticle(body, meta, { model: model || "sonnet" });
    res.status(200).json(result); // { title, cards, content }
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
