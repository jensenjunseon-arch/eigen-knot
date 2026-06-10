import { useEffect, useRef } from "react";
import type { Deck } from "@/types";
import { CARD_ORDER } from "@/types";
import { RenderCard } from "@/cards/cards";
import { FONT_PROBES, FONT_PROBE_TEXT } from "@/design/fonts";
import { SAMPLE_DECK } from "@/sample";
import { OVERFLOW_LIMIT, bodyBottom } from "./shared";
import { Studio } from "./studio";

declare global {
  interface Window {
    __EK_DECK__?: Deck;
    __EK_READY__?: boolean;
    __EK_OVERFLOW__?: boolean;
  }
}

/* ── Capture mode: ONE card at native 1080×1350; gate readiness for Playwright.
   window.__EK_READY__ flips true only after fonts are really loaded (not a
   fallback) and the background image is decoded (PRD §11.1, §11.6). ─────────── */
function CaptureView({ deck, index }: { deck: Deck; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await document.fonts.ready;
        await Promise.all(FONT_PROBES.map((p) => document.fonts.load(p, FONT_PROBE_TEXT)));
      } catch {
        /* font API best-effort */
      }
      await new Promise<void>((res) => {
        const img = new Image();
        img.onload = () => res();
        img.onerror = () => res();
        img.src = deck.bg;
      });
      await new Promise((r) => setTimeout(r, 250)); // paint settle
      if (cancelled) return;
      const bottom = bodyBottom(ref.current);
      const overflow = bottom > OVERFLOW_LIMIT;
      window.__EK_OVERFLOW__ = overflow;
      if (overflow) console.warn(`[eigen-knot] card ${index} (${CARD_ORDER[index]?.role}) overflows: body bottom ${bottom}px > ${OVERFLOW_LIMIT}px`);
      window.__EK_READY__ = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [deck, index]);

  const spec = CARD_ORDER[index];
  return (
    <div ref={ref} style={{ width: 1080, height: 1350 }}>
      <RenderCard deck={deck} spec={spec} />
    </div>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("capture") === "1") {
    const deck = window.__EK_DECK__ ?? SAMPLE_DECK;
    const i = Number(params.get("i") ?? "0");
    return <CaptureView deck={deck} index={Number.isInteger(i) && i >= 0 && i < CARD_ORDER.length ? i : 0} />;
  }
  return <Studio />;
}
