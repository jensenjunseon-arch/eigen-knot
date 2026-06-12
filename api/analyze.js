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

// 첨부 원고 (이미지/PDF). 클라이언트가 이미지를 ≤1568px JPEG로 줄여 보내고
// PDF는 3MB로 막지만, 서버에서도 한 번 더 검증한다 (Vercel 본문 한도 4.5MB).
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
const MAX_MEDIA = 3;
const MAX_MEDIA_B64 = 4_200_000; // 합계 base64 문자 수

function validateMedia(media) {
  if (media == null) return null;
  if (!Array.isArray(media) || media.length > MAX_MEDIA) return `첨부는 최대 ${MAX_MEDIA}개까지입니다.`;
  let total = 0;
  for (const m of media) {
    if (!m || !MEDIA_TYPES.has(m.media_type) || typeof m.data !== "string") return "지원하지 않는 첨부 형식입니다 (이미지/PDF만).";
    total += m.data.length;
  }
  if (total > MAX_MEDIA_B64) return "첨부 파일이 너무 큽니다 — 더 작은 파일로 시도해 주세요.";
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!authed(req)) return res.status(401).json({ error: "비밀번호가 필요합니다." });
  try {
    const { body, meta, model, media } = req.body || {};
    const mediaErr = validateMedia(media);
    if (mediaErr) return res.status(400).json({ error: mediaErr });
    if ((!body || !body.trim()) && !(media && media.length))
      return res.status(400).json({ error: "본문이 비어 있습니다." });
    if (body && body.length > MAX_ARTICLE_CHARS)
      return res.status(400).json({ error: `본문이 너무 깁니다 (${body.length.toLocaleString()}자). ${MAX_ARTICLE_CHARS.toLocaleString()}자 이하로 줄여 주세요.` });
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "?";
    if (rateLimited(ip))
      return res.status(429).json({ error: "요청이 너무 잦습니다. 1분 뒤 다시 시도해 주세요." });
    if (!process.env.ANTHROPIC_API_KEY)
      return res.status(400).json({ error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다." });
    const result = await analyzeArticle(body, meta, { model: model || "sonnet", media: media || [] });
    res.status(200).json(result); // { title, cards, content }
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
