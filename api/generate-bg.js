import { authed } from "./_auth.js";

// POST { prompt, aspect } → { b64, mime } — one background image via Gemini
// (gemini-2.5-flash-image). The style frame is enforced server-side so every
// generated background stays dark/muted enough for white typography.
//
// Cost guards (this endpoint spends Gemini credits):
//  • prompt length cap
//  • per-instance rate limit (in-memory; resets on cold start — good enough
//    for a password-gated, friends-only deployment)

const MAX_PROMPT_CHARS = 600;
const RATE_LIMIT = { windowMs: 60_000, max: 4 };
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

// Supported Gemini aspect ratios → pick the closest to the deck canvas.
const ASPECTS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

function closestAspect(w, h) {
  const target = w / h;
  let best = "4:5";
  let bestDiff = Infinity;
  for (const a of ASPECTS) {
    const [aw, ah] = a.split(":").map(Number);
    const diff = Math.abs(aw / ah - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = a;
    }
  }
  return best;
}

const STYLE_FRAME = (subject) =>
  `Generate a single atmospheric photographic background image for an editorial Instagram card. ` +
  `White typography will be overlaid on it, so the image must be dark, muted, slightly underexposed, ` +
  `with soft focus and gentle depth. Cinematic, minimal, calm. ` +
  `Absolutely no text, no letters, no numbers, no watermark, no logo, no border, no frame. ` +
  `Subject and mood: ${subject}`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!authed(req)) return res.status(401).json({ error: "Password required." });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(400).json({ error: "GEMINI_API_KEY is not set (Vercel env)." });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return res.status(429).json({ error: "Too many requests — try again in a minute." });

  const { prompt, w, h } = req.body || {};
  if (!prompt?.trim()) return res.status(400).json({ error: "prompt is required" });
  if (prompt.length > MAX_PROMPT_CHARS)
    return res.status(400).json({ error: `prompt too long (${prompt.length} > ${MAX_PROMPT_CHARS})` });

  const aspectRatio = closestAspect(Number(w) || 1080, Number(h) || 1350);

  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: STYLE_FRAME(prompt.trim()) }] }],
          generationConfig: { imageConfig: { aspectRatio } },
        }),
      },
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j?.error?.message || `Gemini API ${r.status}`;
      return res.status(502).json({ error: msg });
    }
    const part = j?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part) return res.status(502).json({ error: "Gemini returned no image." });
    return res.status(200).json({ b64: part.inlineData.data, mime: part.inlineData.mimeType || "image/png" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
