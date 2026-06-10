import { authed } from "./_auth.js";
import { analyzeArticle } from "../content/analyze.mjs";

// POST { body, meta, model } → { content } (Claude draft). Reads
// ANTHROPIC_API_KEY from the Vercel env.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!authed(req)) return res.status(401).json({ error: "비밀번호가 필요합니다." });
  try {
    const { body, meta, model } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: "본문이 비어 있습니다." });
    if (!process.env.ANTHROPIC_API_KEY)
      return res.status(400).json({ error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다." });
    const content = await analyzeArticle(body, meta, { model: model || "sonnet" });
    res.status(200).json({ content });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
