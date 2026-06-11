// M3 — article → card-deck content via Claude (PRD §7).
// Uses forced tool-use so the model MUST return JSON matching DECK_SCHEMA — no
// brittle prose-parsing. Output is a first draft; a human edits before capture.
//
// LANGUAGE POLICY: the prompt is authored in English (the base language of this
// codebase); the CARD TEXT is written in the language of the article itself.
// The model reports that language in `lang` (BCP-47), which the studio stores
// on the deck (drives closing-card defaults).

import Anthropic from "@anthropic-ai/sdk";

// Latest model ids (knowledge cutoff Jan 2026). Default to Sonnet — content
// drafting is iterative + human-edited, so speed/cost beat marginal quality.
const MODELS = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-8",
  haiku: "claude-haiku-4-5-20251001",
};

const str = { type: "string" };
const side = {
  type: "object",
  required: ["label", "headline", "detail"],
  additionalProperties: false,
  properties: { label: str, headline: str, detail: str },
};

// Body roles the model may select (cover/closing are always included).
const SELECTABLE_ROLES = ["summary", "definition", "compare", "diagnosis", "analysis", "grid", "claim", "conclusion"];

export const DECK_SCHEMA = {
  type: "object",
  required: ["title", "lang", "card_roles", "cover", "summary", "definition", "compare", "diagnosis", "analysis", "grid", "claim", "conclusion"],
  additionalProperties: false,
  properties: {
    title: { ...str, description: "Title of this card-news deck — short, carrying the article's core insight." },
    lang: {
      ...str,
      description: "BCP-47 code of the language the card text is written in (same as the article), e.g. 'ko', 'en', 'ja'.",
    },
    card_roles: {
      type: "array",
      items: { type: "string", enum: SELECTABLE_ROLES },
      minItems: 3,
      maxItems: 8,
      description:
        "Optimal body-card lineup for this article (cover/closing are added automatically). Default 4-5 (6-7 total). 3 for short/simple pieces; 6-8 only when the argument is genuinely rich.",
    },
    cover: {
      type: "object",
      required: ["headline"],
      additionalProperties: false,
      properties: { kicker: str, headline: str },
    },
    summary: {
      type: "object",
      required: ["lines"],
      additionalProperties: false,
      properties: { lines: { type: "array", items: str, minItems: 3, maxItems: 3 } },
    },
    definition: {
      type: "object",
      required: ["term_ko", "term_en", "body"],
      additionalProperties: false,
      properties: {
        term_ko: { ...str, description: "The term in the ARTICLE's language — despite the '_ko' field name, this is NOT necessarily Korean." },
        term_en: { ...str, description: "Short English rendering of the term (etymology or alternate phrasing if the article is English)." },
        body: str,
      },
    },
    compare: {
      type: "object",
      required: ["left", "right", "common"],
      additionalProperties: false,
      properties: {
        left: side,
        right: side,
        common: {
          type: "object",
          required: ["punch"],
          additionalProperties: false,
          properties: { punch: str, sub: str },
        },
      },
    },
    diagnosis: {
      type: "object",
      required: ["headline", "paras"],
      additionalProperties: false,
      properties: { headline: str, paras: { type: "array", items: str, minItems: 1, maxItems: 3 } },
    },
    analysis: {
      type: "object",
      required: ["headline", "items"],
      additionalProperties: false,
      properties: { headline: str, items: { type: "array", items: str, minItems: 2, maxItems: 4 } },
    },
    grid: {
      type: "object",
      required: ["rows"],
      additionalProperties: false,
      properties: {
        rows: { type: "array", items: { type: "array", items: str, minItems: 2, maxItems: 2 }, minItems: 2, maxItems: 3 },
      },
    },
    claim: {
      type: "object",
      required: ["headline"],
      additionalProperties: false,
      properties: { headline: str, emphasis: str, sub: str },
    },
    conclusion: {
      type: "object",
      required: ["intro", "couplet"],
      additionalProperties: false,
      properties: { intro: str, couplet: { type: "array", items: str, minItems: 2, maxItems: 2 } },
    },
  },
};

const SYSTEM = `You are the card-news editor for the newsletter "eigen knot". You compress one article into an Instagram carousel in a minimal, editorial tone — "seeing the essence behind the phenomenon".

[Language]
- Write ALL card text in the same language as the article. Korean article → Korean cards; English article → English cards; Japanese → Japanese; and so on. Never translate.
- Report that language as a BCP-47 code in \`lang\` (e.g. "ko", "en", "ja").
- definition slot: term_ko = the term in the ARTICLE's language (the field name '_ko' is legacy — never translate the term to Korean for a non-Korean article); term_en = a short English rendering. If the article is already English, term_en is a concise etymology or alternate phrasing.
[Line breaks & expression — per language]
Manual line breaks (\\n) in headlines must follow each language's own rules:
- Korean: break at meaning units (의미 단위) — never right before a particle (조사). Compress enumerations with the middle dot (·). Avoid Latin labels except cover.kicker and definition.term_en.
- Thai: written without spaces between words; a space marks a phrase/clause boundary. Place \\n ONLY where a Thai writer would naturally put a space — never inside a word. Thai stacks vowels and tone marks above/below the line, so lines render TALLER: headlines max 2 lines, ~18 Thai characters per line.
- Vietnamese: most words are two or more space-separated syllables (từ ghép) — never break between the syllables of one word ("hiện tượng", "cà phê" stay on one line). Preserve every diacritic exactly. Avoid ALL-CAPS (diacritics become hard to read).
- Indonesian/Malay: affixed words can run long (mempertanggungjawabkan) — never hyphenate; if a long word won't fit, rephrase shorter instead.
- Filipino: natural Taglish code-switching is fine if the article uses it; break at phrase boundaries.
- Japanese/Chinese: break at phrase (文節) boundaries — never before a particle or punctuation mark, never after an opening bracket.
- All CJK + Thai: no space-dependent wrapping — keep every line short and explicit.

[Reader model — the basis for every decision]
- On Instagram, one card must be readable in 3 seconds. A card that fails the 3-second test is where the swiping stops.
- Completion rate peaks at 6-8 cards total. Cutting a card is almost always better than adding one.
- The first two cards decide everything: the cover headline must leave tension or a question (never state the conclusion), and the second card must create the feeling of "this is about me".
- The last body card (conclusion) is not information — it is resonance. What makes people save and share is not a new fact but a sentence that overlaps with their own life.

[Card count — card_roles]
- Read the article's density and choose the body-card count (cover/closing are added automatically):
  · Short piece (~800 chars, one point) → 3-4 body cards (from summary·definition·claim·conclusion)
  · Typical piece (800-2000 chars, 1-2 points) → 4-5 body cards — most articles land here
  · Long argument (2000+ chars, clear structure) → 6-8 body cards, but ONLY if every card passes "does the story collapse without this card?"
- Never pad content to fill a slot. Splitting one idea across two cards is the worst failure.
- Include compare ONLY when the article truly contains two parallel scenes. A forced contrast kills the card.
- Include grid ONLY when the article has a natural 2-3 row correspondence (before/after, common belief/reality).
- Fill every content slot (the schema requires it), but slots absent from card_roles are excluded from export.

[Per-card volume — exceeding these limits overflows the card and fails]
- One thought per card. Less text is better. White space is content.
- Headlines: ~16 characters (CJK/Thai) / ~6 words (Latin), at most 2 lines including \\n breaks.
- Each sentence in body/detail/paras: ≤40 chars (CJK/Thai) / ≤15 words (Latin).
- Total body text per card: ~90 chars (CJK/Thai) / ~35 words (Latin) — summary's 3 lines combined, diagnosis paras combined, etc.
- grid.rows: left label 2-5 words, right takeaway one short sentence (~20 chars / ~8 words). If it runs longer, it belongs in analysis.items, not grid.
- compare left/right detail: exactly 1 sentence each. The two blocks must share the exact same form so the content difference stands out.

[Narrative placement]
- "Scene first, analysis later." Pull the article's first contrast/scene up into compare. If summary gives away the conclusion, compare loses its shock.
- summary is not an abstract — it is 3 sentences that make the reader keep going. Each line should make the next card necessary.
- No duplication across cards: one sentence (or one fact) appears exactly once in the whole deck.
- Flow concrete → abstract: scenes/cases (front) → concepts/analysis (middle) → claim/resonance (end).

[Sentence rules]
- Cut filler. Short declaratives. Compress lists.
- Emphasis is rationed: wrap 1-2 key phrases per card in <b>...</b>. (The system applies accent color.)
- summary.lines is exactly 3 lines. conclusion.couplet is 2 lines that mirror each other — same structure with one word flipped.

[Title]
- Write the deck title yourself, carrying the article's core insight. It may equal the cover headline.

Respond ONLY via the emit_deck tool.`;

export async function analyzeArticle(body, meta, { model = "sonnet" } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. `export ANTHROPIC_API_KEY=sk-...` or pass manual content via --deck <content.json>.");
  }
  const client = new Anthropic({ apiKey });
  const modelId = MODELS[model] ?? model;
  const userText = `Issue number: ${meta.issue}\nTitle hint: ${meta.title}\nSlug: ${meta.slug}\n\n[Article]\n${body}`;

  const res = await client.messages.create({
    model: modelId,
    max_tokens: 4096,
    system: SYSTEM,
    tools: [{ name: "emit_deck", description: "Return the structured card-news deck content.", input_schema: DECK_SCHEMA }],
    tool_choice: { type: "tool", name: "emit_deck" },
    messages: [{ role: "user", content: userText }],
  });

  const tool = res.content.find((b) => b.type === "tool_use");
  if (!tool) throw new Error("The model did not call the emit_deck tool.");
  const { title, lang, card_roles, ...content } = tool.input;
  // cover/closing always included; body roles ordered canonically.
  const order = ["summary", "definition", "compare", "diagnosis", "analysis", "grid", "claim", "conclusion"];
  const selected = order.filter((r) => Array.isArray(card_roles) && card_roles.includes(r));
  const cards = ["cover", ...(selected.length ? selected : order), "closing"];
  return { title: title || "", lang: lang || "ko", cards, content };
}
