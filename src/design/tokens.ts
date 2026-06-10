// eigen knot design tokens — the single source of truth (PRD §2).
// Hard rule: text hierarchy is TWO levels + accent only.
//   white (main) / whiteFaint (secondary) / wine (decisive accent).
// Never introduce a 3rd opacity tier — it reads as visual noise (PRD §2.1, §10).

export const EK = {
  cream: "#EFEAE0", // light "featured" bg — currently unused (PRD §4.3)
  ink: "#1A1814", // dark text on cream
  white: "#FFFFFF", // main text on photo
  whiteFaint: "rgba(255,255,255,0.55)", // secondary / labels / watermark
  wine: "#C44058", // accent 1 — kicker, the decisive line (use ≤5×/deck)
  chartreuse: "#D6D55A", // accent 2 — brand self-reference only (very rare)
} as const;

export const FONT = {
  // Korean body & headlines — myeongjo (serif) is mandatory.
  serif: "'Noto Serif KR', 'Nanum Myeongjo', serif",
  // English kicker / watermark / labels — used italic.
  display: "'Cormorant Garamond', 'Times New Roman', serif",
} as const;

// Type scale for the 1080×1350 canvas (PRD §2.2).
// Body never below 30px (≈11px on mobile = legibility floor).
export const TYPE = {
  coverHead: 84, // 76–92 depending on length
  h2: 60, // 52–68 card headline
  body: 36, // 30–40 — Korean myeongjo runs small, so default high
  bodySm: 32,
  sub: 26, // 22–28 secondary
  kicker: 30, // wine, italic
  watermark: 30,
  label: 24,
  num: 30,
} as const;

export const CANVAS = { w: 1080, h: 1350 } as const;

// Safe area (PRD §2.3). top is ONLY ever 180 or 200 — never per-card ad hoc,
// or text jumps vertically while swiping.
export const SAFE = { left: 120, right: 140, topA: 180, topB: 200 } as const;
