import { Fragment, type CSSProperties } from "react";
import { EK, FONT, TYPE } from "@/design/tokens";
import type {
  CompareContent,
  CompareSide,
  ConclusionContent,
  CoverContent,
  Deck,
  DeckMeta,
  DefinitionContent,
  DiagnosisContent,
  AnalysisContent,
  ClaimContent,
  GridContent,
  SummaryContent,
  CardSpec,
} from "@/types";
import { Rich } from "@/lib/richText";
import { BaseProps, CardBase, CardBody, Kicker, Label, Rule } from "./CardBase";

// Shared type fragments (module-scoped — no global `styles` collision, PRD §11.8).
const h2Style: CSSProperties = {
  margin: 0,
  fontWeight: 600,
  fontSize: TYPE.h2,
  lineHeight: 1.25,
  letterSpacing: "-0.01em",
};
const paraStyle: CSSProperties = { margin: 0, fontSize: TYPE.body, lineHeight: 1.6, fontWeight: 400 };

type CardProps<C> = BaseProps & { c: C; top: number };

/* 01 — Cover ────────────────────────────────────────────────────────────── */
function CoverCard({ bg, dim, focal, c, top }: CardProps<CoverContent>) {
  return (
    <CardBase bg={bg} dim={dim} focal={focal}>
      <CardBody top={top}>
        <Kicker>{c.kicker}</Kicker>
        <h1
          className="ek-balance"
          style={{ margin: 0, fontWeight: 600, fontSize: TYPE.coverHead, lineHeight: 1.18, letterSpacing: "-0.015em" }}
        >
          <Rich text={c.headline} />
        </h1>
      </CardBody>
    </CardBase>
  );
}

/* 02 — Three-line summary ───────────────────────────────────────────────── */
function SummaryCard({ bg, dim, focal, c, top }: CardProps<SummaryContent>) {
  return (
    <CardBase bg={bg} dim={dim} focal={focal}>
      <CardBody top={top}>
        <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
          {c.lines.map((line, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 28, alignItems: "baseline" }}>
              <span style={{ fontFamily: FONT.display, fontStyle: "italic", fontWeight: 600, fontSize: 40, color: EK.whiteFaint }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ fontSize: TYPE.body, lineHeight: 1.5, fontWeight: 400 }}>
                <Rich text={line} />
              </span>
            </div>
          ))}
        </div>
      </CardBody>
    </CardBase>
  );
}

/* 03 — Definition ───────────────────────────────────────────────────────── */
function DefinitionCard({ bg, dim, focal, c, top }: CardProps<DefinitionContent>) {
  return (
    <CardBase bg={bg} dim={dim} focal={focal}>
      <CardBody top={top}>
        <h2 style={h2Style}>
          <Rich text={c.term_ko} />
        </h2>
        <div
          className="ek-nowrap"
          style={{ fontFamily: FONT.display, fontStyle: "italic", fontWeight: 500, fontSize: 34, color: EK.whiteFaint, marginTop: 10 }}
        >
          {c.term_en}
        </div>
        <Rule />
        <p style={paraStyle}>
          <Rich text={c.body} />
        </p>
      </CardBody>
    </CardBase>
  );
}

/* 04 — ★ Two stories (the signature contrast card) ──────────────────────── */
function CompareBlock({ side }: { side: CompareSide }) {
  return (
    <div>
      <Label>{side.label}</Label>
      <div style={{ fontSize: 46, fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.01em" }}>
        <Rich text={side.headline} />
      </div>
      <div style={{ fontSize: TYPE.sub, lineHeight: 1.5, color: EK.whiteFaint, marginTop: 12 }}>
        <Rich text={side.detail} />
      </div>
    </div>
  );
}
function CompareCard({ bg, dim, focal, c, top }: CardProps<CompareContent>) {
  return (
    <CardBase bg={bg} dim={dim} focal={focal}>
      <CardBody top={top}>
        {/* Both blocks share IDENTICAL formatting so the CONTENT difference speaks. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          <CompareBlock side={c.left} />
          <div style={{ height: 2, background: EK.whiteFaint, opacity: 0.5 }} />
          <CompareBlock side={c.right} />
        </div>
        <div style={{ marginTop: 40 }}>
          <div style={{ fontSize: 44, fontWeight: 600, color: EK.wine, lineHeight: 1.3, letterSpacing: "-0.01em" }}>
            <Rich text={c.common.punch} />
          </div>
          {c.common.sub && (
            <div style={{ fontSize: TYPE.sub, color: EK.whiteFaint, marginTop: 12 }}>
              <Rich text={c.common.sub} />
            </div>
          )}
        </div>
      </CardBody>
    </CardBase>
  );
}

/* 05 — Diagnosis ────────────────────────────────────────────────────────── */
function DiagnosisCard({ bg, dim, focal, c, top }: CardProps<DiagnosisContent>) {
  return (
    <CardBase bg={bg} dim={dim} focal={focal}>
      <CardBody top={top}>
        <h2 style={h2Style}>
          <Rich text={c.headline} />
        </h2>
        <Rule />
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {c.paras.map((p, i) => (
            <p key={i} style={paraStyle}>
              <Rich text={p} />
            </p>
          ))}
        </div>
      </CardBody>
    </CardBase>
  );
}

/* 06 — Analysis (list) ──────────────────────────────────────────────────── */
function AnalysisCard({ bg, dim, focal, c, top }: CardProps<AnalysisContent>) {
  return (
    <CardBase bg={bg} dim={dim} focal={focal}>
      <CardBody top={top}>
        <h2 style={h2Style}>
          <Rich text={c.headline} />
        </h2>
        <Rule />
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {c.items.map((it, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 22, alignItems: "start" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: EK.whiteFaint, marginTop: 18 }} />
              <span style={{ fontSize: TYPE.bodySm, lineHeight: 1.5 }}>
                <Rich text={it} />
              </span>
            </div>
          ))}
        </div>
      </CardBody>
    </CardBase>
  );
}

/* 07 — Contrast grid ────────────────────────────────────────────────────── */
function GridCard({ bg, dim, focal, c, top }: CardProps<GridContent>) {
  return (
    <CardBase bg={bg} dim={dim} focal={focal}>
      <CardBody top={top}>
        {/* Left labels stay nowrap so conclusions align on one X-axis (§3.2);
            the right column wraps (keep-all) — long lines must never clip. */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 30, rowGap: 34, alignItems: "baseline" }}>
          {c.rows.map((r, i) => (
            <Fragment key={i}>
              <span className="ek-nowrap" style={{ fontSize: 34, color: EK.whiteFaint, fontWeight: 400 }}>
                <Rich text={r[0]} />
              </span>
              <span style={{ fontSize: 40, color: EK.white, fontWeight: 600, lineHeight: 1.4 }}>
                <Rich text={r[1]} />
              </span>
            </Fragment>
          ))}
        </div>
      </CardBody>
    </CardBase>
  );
}

/* 08 — Claim ────────────────────────────────────────────────────────────── */
function ClaimCard({ bg, dim, focal, c, top }: CardProps<ClaimContent>) {
  return (
    <CardBase bg={bg} dim={dim} focal={focal}>
      <CardBody top={top}>
        <h2 style={h2Style}>
          <Rich text={c.headline} />
        </h2>
        <Rule />
        {c.emphasis && (
          <div style={{ fontSize: 52, fontWeight: 600, color: EK.wine, lineHeight: 1.3, letterSpacing: "-0.01em" }}>
            <Rich text={c.emphasis} />
          </div>
        )}
        {c.sub && (
          <p style={{ margin: "22px 0 0", fontSize: TYPE.body, lineHeight: 1.6, color: EK.whiteFaint }}>
            <Rich text={c.sub} />
          </p>
        )}
      </CardBody>
    </CardBase>
  );
}

/* 09 — Conclusion (couplet) ─────────────────────────────────────────────── */
function ConclusionCard({ bg, dim, focal, c, top }: CardProps<ConclusionContent>) {
  return (
    <CardBase bg={bg} dim={dim} focal={focal}>
      <CardBody top={top}>
        <p style={paraStyle}>
          <Rich text={c.intro} />
        </p>
        <Rule />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {c.couplet.map((l, i) => (
            <div key={i} style={{ fontSize: 48, fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.01em" }}>
              <Rich text={l} />
            </div>
          ))}
        </div>
      </CardBody>
    </CardBase>
  );
}

/* 10 — Closing (fixed) ──────────────────────────────────────────────────── */
function ClosingCard({ bg, dim, focal, meta }: BaseProps & { meta: DeckMeta }) {
  return (
    <CardBase bg={bg} dim={dim} focal={focal} watermark={false}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 120px",
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 500, lineHeight: 1.5 }}>현상 뒤에 본질을 꿰뚫는 시선</div>
        <div style={{ fontSize: 30, color: EK.whiteFaint, marginTop: 14 }}>심리학자가 발행하는 뉴스레터</div>
        {/* The single chartreuse moment in the whole deck — brand self-reference (§2.1). */}
        <div
          className="ek-nowrap"
          style={{ fontFamily: FONT.display, fontStyle: "italic", fontWeight: 600, fontSize: 66, color: EK.chartreuse, margin: "50px 0 6px" }}
        >
          eigen knot
        </div>
        <div style={{ fontSize: 26, color: EK.whiteFaint }}>[아이겐 노트]</div>
        <div
          className="ek-nowrap"
          style={{ fontFamily: FONT.display, fontStyle: "italic", fontSize: 27, color: EK.whiteFaint, marginTop: 42, letterSpacing: "0.02em" }}
        >
          Weekly Insight · {meta.issue} knot&nbsp;&nbsp;|&nbsp;&nbsp;Subscribe at eigenknot.com
        </div>
      </div>
    </CardBase>
  );
}

/* Dispatcher ────────────────────────────────────────────────────────────── */
export function RenderCard({ deck, spec }: { deck: Deck; spec: CardSpec }) {
  const dim = deck.dims?.[spec.role] ?? spec.dim;
  const base: BaseProps = { bg: deck.bg, dim, focal: deck.focal };
  const c = deck.content;
  switch (spec.role) {
    case "cover":
      return <CoverCard {...base} c={c.cover} top={spec.top} />;
    case "summary":
      return <SummaryCard {...base} c={c.summary} top={spec.top} />;
    case "definition":
      return <DefinitionCard {...base} c={c.definition} top={spec.top} />;
    case "compare":
      return <CompareCard {...base} c={c.compare} top={spec.top} />;
    case "diagnosis":
      return <DiagnosisCard {...base} c={c.diagnosis} top={spec.top} />;
    case "analysis":
      return <AnalysisCard {...base} c={c.analysis} top={spec.top} />;
    case "grid":
      return <GridCard {...base} c={c.grid} top={spec.top} />;
    case "claim":
      return <ClaimCard {...base} c={c.claim} top={spec.top} />;
    case "conclusion":
      return <ConclusionCard {...base} c={c.conclusion} top={spec.top} />;
    case "closing":
      return <ClosingCard {...base} meta={deck.meta} />;
  }
}
