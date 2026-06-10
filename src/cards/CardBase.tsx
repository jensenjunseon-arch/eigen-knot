import type { CSSProperties, ReactNode } from "react";
import { EK, FONT, TYPE, CANVAS } from "@/design/tokens";

export interface BaseProps {
  bg: string;
  dim: number;
  focal?: string;
}

// The frame every card shares: photo + dim gradient overlay + watermark, at the
// native 1080×1350 canvas. `.ek-card` is the element Playwright screenshots;
// `.ek-ko` cascades keep-all line-breaking to all text inside (PRD §2.3, §2.4).
export function CardBase({
  children,
  dim,
  bg,
  focal = "center",
  watermark = true,
}: BaseProps & { children: ReactNode; watermark?: boolean }) {
  const d = Math.min(0.94, Math.max(0, dim)); // keep dim+0.06 ≤ 1
  return (
    <div
      className="ek-card ek-ko"
      style={{
        width: CANVAS.w,
        height: CANVAS.h,
        position: "relative",
        overflow: "hidden",
        fontFamily: FONT.serif,
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
      {watermark && (
        <div
          className="ek-nowrap"
          style={{
            position: "absolute",
            bottom: 180,
            right: 120,
            fontFamily: FONT.display,
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: TYPE.watermark,
            color: EK.whiteFaint,
            letterSpacing: "0.01em",
          }}
        >
          eigen knot
        </div>
      )}
    </div>
  );
}

// Body safe area. `top` is ONLY ever 180 or 200 (PRD §2.3).
export function CardBody({
  children,
  top = 180,
  style,
}: {
  children: ReactNode;
  top?: number;
  style?: CSSProperties;
}) {
  return (
    <div data-ekbody style={{ position: "absolute", top, left: 120, right: 140, ...style }}>
      {children}
    </div>
  );
}

// English kicker — Cormorant italic, wine (PRD §2.1 — a designated wine slot).
export function Kicker({ children }: { children: ReactNode }) {
  return (
    <div
      className="ek-nowrap"
      style={{
        fontFamily: FONT.display,
        fontStyle: "italic",
        fontWeight: 600,
        fontSize: TYPE.kicker,
        color: EK.wine,
        letterSpacing: "0.01em",
        marginBottom: 28,
      }}
    >
      {children}
    </div>
  );
}

// Thin editorial rule under headlines (the 룰선).
export function Rule({ width = 96, top = 28, bottom = 28 }: { width?: number; top?: number; bottom?: number }) {
  return <div style={{ width, height: 2, background: EK.whiteFaint, margin: `${top}px 0 ${bottom}px` }} />;
}

// Secondary label — whiteFaint (the second of only two text tiers).
export function Label({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: TYPE.label, color: EK.whiteFaint, fontWeight: 400, marginBottom: 14, letterSpacing: "0.01em" }}>
      {children}
    </div>
  );
}
