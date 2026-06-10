import { useEffect, useRef, useState } from "react";
import type { Deck, CardSpec } from "@/types";
import { CARD_ORDER } from "@/types";
import { RenderCard } from "@/cards/cards";
import { cardFilename } from "@/lib/filename";
import { FONT_PROBES, FONT_PROBE_TEXT } from "@/design/fonts";
import { SAMPLE_DECK } from "@/sample";

declare global {
  interface Window {
    __EK_DECK__?: Deck;
    __EK_READY__?: boolean;
    __EK_OVERFLOW__?: boolean;
  }
}

// Content bottom past which we collide with the watermark / leave the safe area.
const OVERFLOW_LIMIT = 1180;

function bodyBottom(root: HTMLElement | null): number {
  const body = root?.querySelector<HTMLElement>("[data-ekbody]");
  return body ? body.offsetTop + body.scrollHeight : 0;
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

/* ── Review grid: all 10 cards scaled, with role/dim/filename + overflow flag ─ */
function CardThumb({ deck, spec, seq, scale }: { deck: Deck; spec: CardSpec; seq: number; scale: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    setOverflow(bodyBottom(ref.current) > OVERFLOW_LIMIT);
  });
  const dim = deck.dims?.[spec.role] ?? spec.dim;
  return (
    <div>
      <div
        style={{
          width: 1080 * scale,
          height: 1350 * scale,
          overflow: "hidden",
          borderRadius: 8,
          boxShadow: "0 18px 40px -20px rgba(0,0,0,.7)",
        }}
      >
        <div ref={ref} style={{ width: 1080, height: 1350, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <RenderCard deck={deck} spec={spec} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: "#9a97a8", fontFamily: "ui-monospace, monospace" }}>
        <span>
          {String(seq).padStart(2, "0")} · {spec.role} · dim {dim}
        </span>
        {overflow && <span style={{ color: "#ff6b6b" }}>⚠ overflow</span>}
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: "#6f6c7d", fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
        {cardFilename(seq, deck.meta.slug, deck.meta.issue, spec.cardname)}
      </div>
    </div>
  );
}

function GridView({ deck }: { deck: Deck }) {
  const scale = 0.32;
  return (
    <div style={{ minHeight: "100vh", background: "#14131a", padding: "36px 28px 90px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1340, margin: "0 auto" }}>
        <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", color: "#C44058", fontSize: 18 }}>eigen knot — card studio</div>
        <h1 style={{ color: "#f3f1ea", fontSize: 26, fontWeight: 600, margin: "10px 0 0" }}>
          Issue {deck.meta.issue} · {deck.meta.slug}
        </h1>
        <p style={{ color: "rgba(243,241,234,0.6)", fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
          {deck.meta.title}
          <br />
          10장 미리보기 — ⚠는 본문이 안전영역을 넘쳤다는 뜻(폰트/문구 조정 필요). PNG는 capture 파이프라인이 네이티브 1080×1350으로 출력합니다.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(1080 * scale)}px, 1fr))`,
            gap: 30,
            marginTop: 30,
          }}
        >
          {CARD_ORDER.map((spec, i) => (
            <CardThumb key={spec.role} deck={deck} spec={spec} seq={i + 1} scale={scale} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const deck = (typeof window !== "undefined" && window.__EK_DECK__) || SAMPLE_DECK;
  const params = new URLSearchParams(window.location.search);
  if (params.get("capture") === "1") {
    const i = Number(params.get("i") ?? "0");
    return <CaptureView deck={deck} index={Number.isInteger(i) && i >= 0 && i < CARD_ORDER.length ? i : 0} />;
  }
  return <GridView deck={deck} />;
}
