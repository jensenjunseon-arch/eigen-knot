// Card-deck data model (PRD §3, §7). The LLM emits `DeckContent` (named slots);
// the renderer walks the deck's active roles to produce the ordered cards.
//
// Text fields may contain inline markup: "<b>…</b>" → bold emphasis, "\n" →
// line break. Keep markup sparse (1–2 <b> per card).

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
  kicker: string;
  headline: string;
}
export interface SummaryContent {
  lines: string[];
}
export interface DefinitionContent {
  term_ko: string;
  term_en: string;
  body: string;
}
export interface CompareSide {
  label: string;
  headline: string;
  detail: string;
}
export interface CompareContent {
  left: CompareSide;
  right: CompareSide;
  common: { punch: string; sub?: string };
}
export interface DiagnosisContent {
  headline: string;
  paras: string[];
}
export interface AnalysisContent {
  headline: string;
  items: string[];
}
export interface GridContent {
  rows: [string, string][];
}
export interface ClaimContent {
  headline: string;
  emphasis?: string;
  sub?: string;
}
export interface ConclusionContent {
  intro: string;
  couplet: [string, string];
}
/** Closing (brand) card. All lines editable; empty string hides a line.
 *  When the whole object is absent, eigen-knot brand defaults are used. */
export interface ClosingContent {
  tagline: string;
  subline: string;
  note: string;
  footer: string;
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
  closing?: ClosingContent;
}

/** Brand defaults for the closing card (used when deck.content.closing is absent). */
export function defaultClosing(issue: number): ClosingContent {
  return {
    tagline: "현상 뒤에 본질을 꿰뚫는 시선",
    subline: "심리학자가 발행하는 뉴스레터",
    note: "[아이겐 노트]",
    footer: `Weekly Insight · ${issue} knot  |  Subscribe at eigenknot.com`,
  };
}

export interface DeckMeta {
  issue: number;
  slug: string;
  title: string;
  /** User-chosen deck name (any language). Drives the ZIP filename and every
   *  image filename: {name}.zip / {NN}-{name}-{cardname}.png. Empty → legacy
   *  eigen-knot auto-naming from slug+issue. */
  customZipName?: string;
}

/* ── Platform size presets ────────────────────────────────────────────────── */
export interface Platform {
  id: string;
  label: string;
  w: number;
  h: number;
}
export const PLATFORMS: Platform[] = [
  { id: "ig-45", label: "Instagram 4:5", w: 1080, h: 1350 },
  { id: "ig-11", label: "Instagram 1:1", w: 1080, h: 1080 },
  { id: "story", label: "스토리/릴스 9:16", w: 1080, h: 1920 },
  { id: "x-169", label: "X (트위터) 16:9", w: 1600, h: 900 },
];
export const DEFAULT_SIZE = { w: 1080, h: 1350 };

/* ── Deck ─────────────────────────────────────────────────────────────────── */
export interface Deck {
  meta: DeckMeta;
  content: DeckContent;
  /** Background image — URL (dev) or inlined dataURL (capture, PRD §11.3). */
  bg: string;
  /** background-position per issue, e.g. "center 30%" (PRD §11.5). */
  focal?: string;
  /** Per-card dim overrides; falls back to CARD_ORDER defaults. */
  dims?: Partial<Record<CardRole, number>>;
  /** Canvas size; default 1080×1350 (Instagram 4:5). */
  size?: { w: number; h: number };
  /** Korean font choice id (see FONT_CHOICES); default noto-serif. */
  font?: string;
  /** Global type-size multiplier (0.7–1.4); default 1. */
  typeScale?: number;
  /** Accent color (CSS color: hex / rgb()); default wine #C44058. */
  accent?: string;
  /** Brand self-reference color (closing card); default chartreuse #D6D55A. */
  accent2?: string;
  /** Watermark text; default "eigen knot". Empty string hides it. */
  watermark?: string;
  /** Ordered subset of roles to render; default = all 10. */
  cards?: CardRole[];
}

export interface CardSpec {
  role: CardRole;
  /** Filename slug for this card (PRD §4.2). */
  cardname: string;
  /** Default dim — the cinematic rhythm (PRD §2.4, Appendix B). */
  dim: number;
  /** Body safe-area top at the 1350-high reference canvas — 180 or 200 only. */
  top: number;
}

// Canonical order = swipe order = file sort order.
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

export const ALL_ROLES: CardRole[] = CARD_ORDER.map((s) => s.role);

/** The deck's active card specs, in canonical order. */
export function activeSpecs(deck: Deck): CardSpec[] {
  const wanted = deck.cards?.length ? new Set(deck.cards) : null;
  return wanted ? CARD_ORDER.filter((s) => wanted.has(s.role)) : CARD_ORDER;
}

export function deckSize(deck: Deck): { w: number; h: number } {
  return deck.size ?? DEFAULT_SIZE;
}
