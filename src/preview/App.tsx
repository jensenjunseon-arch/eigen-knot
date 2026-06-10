import { useEffect, useRef } from "react";
import type { Deck } from "@/types";
import { activeSpecs, deckSize } from "@/types";
import { RenderCard } from "@/cards/cards";
import { fontProbes, FONT_PROBE_TEXT } from "@/design/fonts";
import { SAMPLE_DECK } from "@/sample";
import { cardOverflow } from "./shared";
import { Studio } from "./studio";

declare global {
  interface Window {
    __EK_DECK__?: Deck;
    __EK_READY__?: boolean;
    __EK_OVERFLOW__?: boolean;
  }
}

/* ── Capture mode: ONE card at native canvas size; gate readiness for
   Playwright. window.__EK_READY__ flips true only after the SELECTED font is
   really loaded (not a fallback) and the background image is decoded. ──────── */
function CaptureView({ deck, index }: { deck: Deck; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const specs = activeSpecs(deck);
  const spec = specs[Math.min(Math.max(index, 0), specs.length - 1)];
  const { w, h } = deckSize(deck);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await document.fonts.ready;
        await Promise.all(fontProbes(deck.font).map((p) => document.fonts.load(p, FONT_PROBE_TEXT)));
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
      const { v, h: hov } = cardOverflow(ref.current, h);
      window.__EK_OVERFLOW__ = v || hov;
      if (v || hov)
        console.warn(
          `[eigen-knot] card ${index} (${spec.role}) overflows: ${[v && "vertical", hov && "horizontal"].filter(Boolean).join("+")}`,
        );
      window.__EK_READY__ = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [deck, index, spec.role, h]);

  return (
    <div ref={ref} style={{ width: w, height: h }}>
      <RenderCard deck={deck} spec={spec} />
    </div>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("capture") === "1") {
    const deck = window.__EK_DECK__ ?? SAMPLE_DECK;
    const i = Number(params.get("i") ?? "0");
    return <CaptureView deck={deck} index={Number.isInteger(i) ? i : 0} />;
  }
  return <Studio />;
}
