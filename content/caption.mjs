// Deck → Instagram caption + hashtags via Claude (forced tool-use).
// Independent of the CARD language: the user picks the CAPTION language
// (Korean or English) in the studio. Each call nudges a fresh angle via a
// high temperature + a rotating "variation" hint, so hitting 다시 생성 (regenerate)
// yields a genuinely different caption rather than the same text.

import Anthropic from "@anthropic-ai/sdk";

const MODELS = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-8",
  haiku: "claude-haiku-4-5-20251001",
};

const str = { type: "string" };

export const CAPTION_SCHEMA = {
  type: "object",
  required: ["caption", "hashtags"],
  additionalProperties: false,
  properties: {
    caption: {
      ...str,
      description:
        "The Instagram caption body — WITHOUT hashtags. A scroll-stopping first line (the hook), then 2-4 short lines that give the gist and invite a save/comment. Use line breaks for rhythm. ~300-600 characters. End with a light call to action (e.g. a question, or 저장해두세요 / save this).",
    },
    hashtags: {
      type: "array",
      items: str,
      minItems: 8,
      maxItems: 15,
      description:
        "8-15 hashtags WITHOUT the leading '#'. Mix broad-reach tags with 2-3 niche/topic-specific ones. Match the caption language, but a few widely-used English tags are fine even for a Korean caption.",
    },
  },
};

// Flatten the active deck into a plain-text digest the captioner can read.
// Strips inline <b> markup and \n; only includes roles present in `cards`.
function deckDigest({ title, content, cards }) {
  const clean = (s) => (typeof s === "string" ? s.replace(/<\/?b>/g, "").replace(/\n/g, " ").trim() : "");
  const active = Array.isArray(cards) && cards.length ? cards : Object.keys(content || {});
  const out = [];
  if (title) out.push(`Title: ${clean(title)}`);
  const c = content || {};
  const has = (role) => active.includes(role) && c[role];
  if (c.cover?.headline) out.push(`Cover: ${clean(c.cover.headline)}`);
  if (has("summary")) out.push(`Summary: ${(c.summary.lines || []).map(clean).join(" / ")}`);
  if (has("definition")) out.push(`Definition: ${clean(c.definition.term_ko)} — ${clean(c.definition.body)}`);
  if (has("compare"))
    out.push(
      `Compare: ${clean(c.compare.left?.headline)} (${clean(c.compare.left?.detail)}) vs ${clean(c.compare.right?.headline)} (${clean(c.compare.right?.detail)}) → ${clean(c.compare.common?.punch)}`,
    );
  if (has("diagnosis")) out.push(`Diagnosis: ${clean(c.diagnosis.headline)} — ${(c.diagnosis.paras || []).map(clean).join(" ")}`);
  if (has("analysis")) out.push(`Analysis: ${clean(c.analysis.headline)} — ${(c.analysis.items || []).map(clean).join("; ")}`);
  if (has("grid")) out.push(`Grid: ${(c.grid.rows || []).map((r) => r.map(clean).join(" → ")).join("; ")}`);
  if (has("claim")) out.push(`Claim: ${clean(c.claim.headline)} ${clean(c.claim.emphasis)} ${clean(c.claim.sub)}`);
  if (has("conclusion")) out.push(`Conclusion: ${clean(c.conclusion.intro)} ${(c.conclusion.couplet || []).map(clean).join(" / ")}`);
  return out.filter(Boolean).join("\n");
}

const SYSTEM = (lang) => {
  const isKo = String(lang).toLowerCase().startsWith("ko");
  const langLine = isKo
    ? "Write the caption AND the hashtags in Korean (자연스러운 한국어). A few common English hashtags are fine."
    : "Write the caption AND the hashtags in English.";
  return `You are a social-media editor writing the Instagram caption for a card-news carousel.
You are given a digest of the carousel's cards. Write the post that goes UNDER the carousel.

[Language]
- ${langLine}

[Caption craft]
- Instagram shows only the first ~125 characters before "... more", so the FIRST line must stop the scroll on its own — a hook, a tension, a question. Never open with "오늘은 ~에 대해" / "Today we'll talk about".
- Then 2-4 short lines that deliver the core insight and make the reader want to save or comment. Short sentences, line breaks for breathing room. Match the carousel's calm, editorial voice — no hype, no emoji spam (0-2 tasteful emoji max, or none).
- End with one light call to action (a question to the reader, or an invitation to save/share).
- Do NOT put hashtags inside the caption field — they go in the separate hashtags array.

[Hashtags]
- 8-15 tags, no '#' prefix, no spaces inside a tag.
- Mix: a few broad high-reach tags + 2-3 specific to this post's topic. Relevance over volume.

Respond ONLY via the emit_caption tool.`;
};

export async function generateCaption(deck, { lang = "ko", model = "sonnet", variation = 0 } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  const client = new Anthropic({ apiKey });
  const modelId = MODELS[model] ?? model;

  const digest = deckDigest(deck);
  if (!digest.trim()) throw new Error("덱 내용이 비어 있습니다.");

  // Rotating angle hints so each regenerate explores a different opening.
  const ANGLES = [
    "Open with a provocative question.",
    "Open with a concrete scene or moment.",
    "Open with a surprising one-line claim.",
    "Open by naming a feeling the reader knows well.",
    "Open with a short, punchy contrast.",
  ];
  const angle = ANGLES[((Number(variation) % ANGLES.length) + ANGLES.length) % ANGLES.length];
  const userText = `Carousel digest:\n${digest}\n\nVariation #${variation}. ${angle} Make this caption distinctly different from a typical one — fresh wording, fresh angle.`;

  const res = await client.messages.create({
    model: modelId,
    max_tokens: 1024,
    temperature: 1,
    system: SYSTEM(lang),
    tools: [{ name: "emit_caption", description: "Return the Instagram caption and hashtags.", input_schema: CAPTION_SCHEMA }],
    tool_choice: { type: "tool", name: "emit_caption" },
    messages: [{ role: "user", content: userText }],
  });

  const tool = res.content.find((b) => b.type === "tool_use");
  if (!tool) throw new Error("The model did not call the emit_caption tool.");
  const { caption, hashtags } = tool.input;
  return { caption: caption || "", hashtags: Array.isArray(hashtags) ? hashtags : [] };
}
