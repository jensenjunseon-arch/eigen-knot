import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { EK, FONT } from "@/design/tokens";
import { fontById } from "@/design/fonts";
import type { Deck } from "@/types";
import { deckSize } from "@/types";

/* ── Card theme: everything user-tunable, resolved once per deck ──────────
   Children read it via useTheme(): accent colors, font family, watermark,
   canvas size, and ts(px) — the type-scale function every fontSize/spacing
   goes through. sx/sy scale the safe areas for non-4:5 canvases. ─────────── */
export interface CardTheme {
  w: number;
  h: number;
  sx: number; // w / 1080
  sy: number; // h / 1350
  ts: (px: number) => number;
  accent: string;
  accent2: string;
  fontFamily: string;
  watermark: string;
}

const ThemeCtx = createContext<CardTheme | null>(null);

export function useTheme(): CardTheme {
  const t = useContext(ThemeCtx);
  if (!t) throw new Error("useTheme outside CardBase");
  return t;
}

const isCssColor = (c: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) || /^rgba?\(/i.test(c);

export function resolveTheme(deck: Deck): CardTheme {
  const { w, h } = deckSize(deck);
  const sx = w / 1080;
  const sy = h / 1350;
  // Auto type scale follows the tighter axis (never below 0.66) so landscape
  // canvases don't overflow instantly; the user slider multiplies on top.
  const auto = Math.max(0.66, Math.min(sx, sy));
  const user = deck.typeScale ?? 1;
  const ts = (px: number) => Math.round(px * auto * user);
  return {
    w,
    h,
    sx,
    sy,
    ts,
    accent: deck.accent && isCssColor(deck.accent) ? deck.accent : EK.wine,
    accent2: deck.accent2 && isCssColor(deck.accent2) ? deck.accent2 : EK.chartreuse,
    fontFamily: fontById(deck.font).family,
    watermark: deck.watermark ?? "eigen knot",
  };
}

export interface BaseProps {
  bg: string;
  dim: number;
  focal?: string;
  theme: CardTheme;
}

// The frame every card shares: photo + dim gradient overlay + watermark, at the
// deck's native canvas size. `.ek-card` is the element Playwright screenshots.
export function CardBase({
  children,
  dim,
  bg,
  focal = "center",
  theme,
  watermark = true,
}: BaseProps & { children: ReactNode; watermark?: boolean }) {
  const d = Math.min(0.94, Math.max(0, dim));
  return (
    <ThemeCtx.Provider value={theme}>
      <div
        className="ek-card ek-ko"
        style={{
          width: theme.w,
          height: theme.h,
          position: "relative",
          overflow: "hidden",
          fontFamily: theme.fontFamily,
          color: EK.white,
          backgroundImage: `url("${bg}")`,
          backgroundSize: "cover",
          backgroundPosition: focal,
          backgroundRepeat: "no-repeat",
          backgroundColor: "#000",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, rgba(0,0,0,${d + 0.04}) 0%, rgba(0,0,0,${d}) 60%, rgba(0,0,0,${d + 0.06}) 100%)`,
          }}
        />
        <div style={{ position: "relative", width: "100%", height: "100%" }}>{children}</div>
        {watermark && theme.watermark.trim() !== "" && (
          <div
            className="ek-nowrap"
            style={{
              position: "absolute",
              bottom: Math.round(180 * theme.sy),
              right: Math.round(120 * theme.sx),
              fontFamily: FONT.display,
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: theme.ts(30),
              color: EK.whiteFaint,
              letterSpacing: "0.01em",
            }}
          >
            {theme.watermark}
          </div>
        )}
      </div>
    </ThemeCtx.Provider>
  );
}

// Body safe area. `top` is the 1350-reference value (180/200), scaled by sy.
export function CardBody({
  children,
  top = 180,
  style,
}: {
  children: ReactNode;
  top?: number;
  style?: CSSProperties;
}) {
  const t = useTheme();
  return (
    <div
      data-ekbody
      style={{
        position: "absolute",
        top: Math.round(top * t.sy),
        left: Math.round(120 * t.sx),
        right: Math.round(140 * t.sx),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// English kicker — Cormorant italic in the deck accent (a designated slot).
export function Kicker({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <div
      className="ek-nowrap"
      style={{
        fontFamily: FONT.display,
        fontStyle: "italic",
        fontWeight: 600,
        fontSize: t.ts(30),
        color: t.accent,
        letterSpacing: "0.01em",
        marginBottom: t.ts(28),
      }}
    >
      {children}
    </div>
  );
}

// Thin editorial rule under headlines (the 룰선).
export function Rule({ width = 96, top = 28, bottom = 28 }: { width?: number; top?: number; bottom?: number }) {
  const t = useTheme();
  return (
    <div style={{ width: t.ts(width), height: 2, background: EK.whiteFaint, margin: `${t.ts(top)}px 0 ${t.ts(bottom)}px` }} />
  );
}

// Secondary label — whiteFaint (the second of only two text tiers).
export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <div style={{ fontSize: t.ts(24), color: EK.whiteFaint, fontWeight: 400, marginBottom: t.ts(14), letterSpacing: "0.01em" }}>
      {children}
    </div>
  );
}
