// M3 — article → 10-card deck content via Claude (PRD §7).
// Uses forced tool-use so the model MUST return JSON matching DECK_SCHEMA — no
// brittle prose-parsing. Output is a first draft; a human edits before capture.

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
  required: ["title", "card_roles", "cover", "summary", "definition", "compare", "diagnosis", "analysis", "grid", "claim", "conclusion"],
  additionalProperties: false,
  properties: {
    title: { ...str, description: "이 카드뉴스의 제목 (글의 핵심을 담아 짧게)" },
    card_roles: {
      type: "array",
      items: { type: "string", enum: SELECTABLE_ROLES },
      minItems: 3,
      maxItems: 8,
      description: "이 글에 최적인 본문 카드 구성 (cover/closing은 자동 포함). 글이 짧거나 단순하면 적게, 논증이 풍부하면 많이.",
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
      properties: { term_ko: str, term_en: str, body: str },
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

const SYSTEM = `당신은 뉴스레터 "eigen knot"의 카드뉴스 에디터다. "이슈라는 현상에서 본질을 통찰하는" 미니멀·에디토리얼 톤으로, 글 한 편을 인스타그램 카드뉴스 10장으로 압축한다.

[원칙 — 반드시 지킬 것]
- 카드당 한 생각. 텍스트는 적을수록 좋다. 여백이 콘텐츠다.
- 04번 compare(대비 장면)가 이 브랜드의 시그니처다. 글에서 평행한 두 상황/장면을 찾아 나란히 놓고, 하단 common.punch로 둘을 꿰는 한 줄을 만든다. 두 블록(left/right)은 형식이 완전히 같아야 내용 차이가 드러난다.
- "장면 먼저, 분석 나중." 글의 첫 대비/장면을 04로 끌어올려라. 결론을 02 summary에서 미리 다 말하면 04의 충격이 죽는다.
- 군더더기 제거("~라는 것이다", "~인 셈이다"). 단문으로. 나열은 가운뎃점(·)으로 압축.
- 영문 라벨 남용 금지. 영문은 cover.kicker와 definition.term_en 정도만.
- 강조는 절제. 핵심 어구 1~2개를 <b>...</b>로 감싸되 카드당 1~2개 이내. (색 강조는 시스템이 알아서 입힌다.)
- summary.lines는 정확히 3줄, 각 줄은 짧게. conclusion.couplet은 대구를 이루는 2줄.
- grid.rows는 짧아야 한다: 좌측 라벨은 2~5어절, 우측 결론은 한 문장(전체 ~20자 내). 긴 설명이 필요하면 grid가 아니라 analysis.items로 보내라.
- compare의 left/right detail은 각 1문장. 카드가 세로로 넘치면 전체가 실패한다.
- 모든 텍스트는 한국어. 의미 단위 줄바꿈이 필요하면 \\n을 직접 넣어라(특히 헤드라인).

[구성 결정 — card_roles]
- 글을 읽고 이 글에 최적인 본문 카드 구성을 네가 결정하라. 모든 슬롯을 쓸 필요 없다.
- 진짜 평행한 두 장면이 있을 때만 compare를 포함하라. 짧은 글이면 4~5장(summary·definition·claim·conclusion 정도)이 낫다.
- 모든 콘텐츠 슬롯은 채우되(스키마 필수), card_roles에 없는 슬롯은 내보내기에서 제외된다.

[제목 — title]
- 글의 핵심 통찰을 담은 카드뉴스 제목을 직접 지어라. 표지 headline과 같아도 된다.

emit_deck 도구로만 응답하라.`;

export async function analyzeArticle(body, meta, { model = "sonnet" } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY가 없습니다. `export ANTHROPIC_API_KEY=sk-...` 하거나, --deck <content.json>으로 수동 콘텐츠를 넘기세요.",
    );
  }
  const client = new Anthropic({ apiKey });
  const modelId = MODELS[model] ?? model;
  const userText = `호 번호: ${meta.issue}\n제목: ${meta.title}\n슬러그: ${meta.slug}\n\n[뉴스레터 본문]\n${body}`;

  const res = await client.messages.create({
    model: modelId,
    max_tokens: 4096,
    system: SYSTEM,
    tools: [{ name: "emit_deck", description: "카드뉴스 10장 콘텐츠를 구조화해 반환한다.", input_schema: DECK_SCHEMA }],
    tool_choice: { type: "tool", name: "emit_deck" },
    messages: [{ role: "user", content: userText }],
  });

  const tool = res.content.find((b) => b.type === "tool_use");
  if (!tool) throw new Error("모델이 emit_deck 도구를 호출하지 않았습니다.");
  const { title, card_roles, ...content } = tool.input;
  // cover/closing은 항상 포함, 본문은 모델 선택을 정식 순서로 정렬.
  const order = ["summary", "definition", "compare", "diagnosis", "analysis", "grid", "claim", "conclusion"];
  const selected = order.filter((r) => Array.isArray(card_roles) && card_roles.includes(r));
  const cards = ["cover", ...(selected.length ? selected : order), "closing"];
  return { title: title || "", cards, content };
}
