// Card-deck data model (PRD §3, §7). The LLM emits `DeckContent` (10 named
// slots); the renderer walks `CARD_ORDER` to produce the ordered 10 cards.
//
// Text fields may contain inline markup: "<b>…</b>" → bold emphasis, "\n" →
// line break. Keep markup sparse (1–2 <b> per card). Wine accent is NOT driven
// by markup — it lives on designated component slots only (PRD §2.1).

export type CardRole =
  | "cover"
  | "summary"
  | "definition"
  | "compare"
  | "diagnosis"
  | "analysis"
  | "grid"
  | "claim"
  | "conclusion"
  | "closing";

export interface CoverContent {
  kicker: string; // e.g. "Weekly Insight: 14 knot" — wine, Cormorant italic
  headline: string;
}
export interface SummaryContent {
  lines: string[]; // exactly 3, each short
}
export interface DefinitionContent {
  term_ko: string;
  term_en: string;
  body: string;
}
export interface CompareSide {
  label: string; // "하나" / "둘" — whiteFaint
  headline: string; // the situation — white bold
  detail: string; // one quote/aside — keep to one line
}
export interface CompareContent {
  left: CompareSide;
  right: CompareSide;
  common: { punch: string; sub?: string }; // the shared conclusion (punch = wine)
}
export interface DiagnosisContent {
  headline: string;
  paras: string[]; // 2 short paragraphs
}
export interface AnalysisContent {
  headline: string;
  items: string[]; // compressed list
}
export interface GridContent {
  rows: [string, string][]; // [흐린 라벨, bold 결론]
}
export interface ClaimContent {
  headline: string;
  emphasis?: string; // the thesis line — wine
  sub?: string;
}
export interface ConclusionContent {
  intro: string;
  couplet: [string, string]; // 대구 2줄
}

export interface DeckContent {
  cover: CoverContent;
  summary: SummaryContent;
  definition: DefinitionContent;
  compare: CompareContent;
  diagnosis: DiagnosisContent;
  analysis: AnalysisContent;
  grid: GridContent;
  claim: ClaimContent;
  conclusion: ConclusionContent;
  // `closing` is a fixed card (PRD §8) — no per-issue content.
}

export interface DeckMeta {
  issue: number;
  slug: string;
  title: string;
}

export interface Deck {
  meta: DeckMeta;
  content: DeckContent;
  /** Background image — URL (dev) or inlined dataURL (capture, PRD §11.3). */
  bg: string;
  /** background-position per issue, e.g. "center 30%" (PRD §11.5). */
  focal?: string;
  /** Per-card dim overrides; falls back to CARD_ORDER defaults. */
  dims?: Partial<Record<CardRole, number>>;
}

export interface CardSpec {
  role: CardRole;
  /** Filename slug for this card (PRD §4.2). */
  cardname: string;
  /** Default dim — the cinematic rhythm (PRD §2.4, Appendix B). */
  dim: number;
  /** Body safe-area top — ONLY 180 or 200 (PRD §2.3). */
  top: number;
}

// Order = swipe order = file sort order. Dim rhythm: bright open → deepen →
// darkest at the argument → bright close.
export const CARD_ORDER: CardSpec[] = [
  { role: "cover", cardname: "cover", dim: 0.62, top: 180 },
  { role: "summary", cardname: "summary", dim: 0.9, top: 180 },
  { role: "definition", cardname: "definition", dim: 0.9, top: 200 },
  { role: "compare", cardname: "two-stories", dim: 0.9, top: 180 },
  { role: "diagnosis", cardname: "diagnosis", dim: 0.9, top: 180 },
  { role: "analysis", cardname: "analysis", dim: 0.9, top: 180 },
  { role: "grid", cardname: "grid", dim: 0.9, top: 200 },
  { role: "claim", cardname: "claim", dim: 0.9, top: 200 },
  { role: "conclusion", cardname: "conclusion", dim: 0.9, top: 180 },
  { role: "closing", cardname: "closing", dim: 0.62, top: 180 },
];
