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
      description:
        "이 글에 최적인 본문 카드 구성 (cover/closing은 자동 포함). 기본은 4~5장(총 6~7장). 글이 짧거나 단순하면 3장, 논증이 정말 풍부할 때만 6~8장.",
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

const SYSTEM = `당신은 뉴스레터 "eigen knot"의 카드뉴스 에디터다. "이슈라는 현상에서 본질을 통찰하는" 미니멀·에디토리얼 톤으로, 글 한 편을 인스타그램 카드뉴스로 압축한다.

[독자 행동 모델 — 모든 결정의 기준]
- 인스타그램에서 카드 1장은 3초 안에 읽혀야 한다. 3초에 안 읽히는 카드는 스와이프가 끊기는 지점이다.
- 완독률은 총 6~8장에서 가장 높다. 장수를 늘리는 것보다 한 장을 빼는 결정이 거의 항상 옳다.
- 첫 2장이 승부처다: 표지 headline은 긴장이나 질문을 남겨야 하고(결론을 말하지 말 것), 둘째 카드는 "내 이야기다"라는 감각을 만들어야 한다.
- 마지막 본문 카드(conclusion)는 정보가 아니라 여운이다. 저장·공유를 부르는 건 새 정보가 아니라 자기 삶에 겹쳐지는 문장이다.

[장수 결정 — card_roles]
- 글의 밀도를 보고 본문 카드 수를 정하라 (cover/closing은 자동 포함):
  · 단상·짧은 글(~800자, 논점 1개) → 본문 3~4장 (summary·definition·claim·conclusion 중에서)
  · 보통 글(800~2000자, 논점 1~2개) → 본문 4~5장 — 대부분의 글은 여기다
  · 긴 논증(2000자+, 구조가 뚜렷) → 본문 6~8장, 단 "이 카드를 빼면 이야기가 무너지는가?"에 전부 yes일 때만
- 슬롯을 채우려고 내용을 늘리지 마라. 같은 말을 두 카드에 나누는 것이 최악이다.
- 진짜 평행한 두 장면이 글에 있을 때만 compare를 포함하라. 억지로 대비를 만들면 카드가 죽는다.
- grid는 글에 자연스러운 2~3개의 대응 구조(전/후, 통념/실제)가 있을 때만.
- 모든 콘텐츠 슬롯은 채우되(스키마 필수), card_roles에 없는 슬롯은 내보내기에서 제외된다.

[카드당 분량 — 어기면 카드가 넘쳐서 실패한다]
- 카드당 한 생각. 텍스트는 적을수록 좋다. 여백이 콘텐츠다.
- headline류는 16자 내외, 줄바꿈 포함 최대 2줄. body·detail·paras의 문장은 각 40자 이내.
- 한 카드의 본문 총량은 ~90자를 넘기지 마라 (summary 3줄 합계, diagnosis paras 합계 등).
- grid.rows: 좌측 라벨 2~5어절, 우측 결론 한 문장(~20자). 길어지면 grid가 아니라 analysis.items로.
- compare의 left/right detail은 각 1문장. 두 블록(left/right)은 형식이 완전히 같아야 내용 차이가 드러난다.

[서사 배치]
- "장면 먼저, 분석 나중." 글의 첫 대비/장면을 compare로 끌어올려라. 결론을 summary에서 미리 다 말하면 compare의 충격이 죽는다.
- summary는 글의 요약이 아니라 "계속 읽게 만드는 3개의 문장"이다. 각 줄이 다음 카드를 궁금하게 만들어야 한다.
- 카드 간 중복 금지: 한 문장(또는 같은 사실)은 덱 전체에서 한 번만 등장한다.
- 흐름은 구체→추상: 장면/사례(앞) → 개념/분석(중간) → 주장/여운(끝).

[문장 규칙]
- 군더더기 제거("~라는 것이다", "~인 셈이다"). 단문으로. 나열은 가운뎃점(·)으로 압축.
- 영문 남용 금지. 영문은 cover.kicker와 definition.term_en 정도만.
- 강조는 절제: 핵심 어구를 <b>...</b>로 감싸되 카드당 1~2개. (색 강조는 시스템이 입힌다.)
- summary.lines는 정확히 3줄. conclusion.couplet은 대구를 이루는 2줄 — 구조가 같고 한 단어가 뒤집혀야 대구다.
- 모든 텍스트는 한국어. 의미 단위 줄바꿈이 필요하면 \\n을 직접 넣어라(특히 헤드라인 — 조사 앞에서 끊지 말 것).

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
    tools: [{ name: "emit_deck", description: "카드뉴스 콘텐츠를 구조화해 반환한다.", input_schema: DECK_SCHEMA }],
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
