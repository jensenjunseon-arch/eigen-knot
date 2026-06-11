import { Fragment } from "react";
import { EK, FONT } from "@/design/tokens";
import type {
  ClosingContent,
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
import { defaultClosing } from "@/types";
import { Rich } from "@/lib/richText";
import { BaseProps, CardBase, CardBody, Kicker, Label, Rule, resolveTheme, useTheme } from "./CardBase";

type CardProps<C> = BaseProps & { c: C; top: number };

/* 01 — Cover ────────────────────────────────────────────────────────────── */
function CoverCard({ c, top, ...base }: CardProps<CoverContent>) {
  const t = base.theme;
  return (
    <CardBase {...base}>
      <CardBody top={top}>
        <Kicker>{c.kicker}</Kicker>
        <h1
          className="ek-balance"
          style={{ margin: 0, fontWeight: 600, fontSize: t.ts(84), lineHeight: 1.18, letterSpacing: "-0.015em" }}
        >
          <Rich text={c.headline} />
        </h1>
      </CardBody>
    </CardBase>
  );
}

/* 02 — Three-line summary ───────────────────────────────────────────────── */
function SummaryCard({ c, top, ...base }: CardProps<SummaryContent>) {
  const t = base.theme;
  return (
    <CardBase {...base}>
      <CardBody top={top}>
        <div style={{ display: "flex", flexDirection: "column", gap: t.ts(44) }}>
          {c.lines.map((line, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: t.ts(28), alignItems: "baseline" }}>
              <span style={{ fontFamily: FONT.display, fontStyle: "italic", fontWeight: 600, fontSize: t.ts(40), color: EK.whiteFaint }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ fontSize: t.ts(36), lineHeight: 1.5, fontWeight: 400 }}>
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
function DefinitionCard({ c, top, ...base }: CardProps<DefinitionContent>) {
  const t = base.theme;
  return (
    <CardBase {...base}>
      <CardBody top={top}>
        <h2 style={{ margin: 0, fontWeight: 600, fontSize: t.ts(60), lineHeight: 1.25, letterSpacing: "-0.01em" }}>
          <Rich text={c.term_ko} />
        </h2>
        <div
          className="ek-nowrap"
          style={{ fontFamily: FONT.display, fontStyle: "italic", fontWeight: 500, fontSize: t.ts(34), color: EK.whiteFaint, marginTop: t.ts(10) }}
        >
          {c.term_en}
        </div>
        <Rule />
        <p style={{ margin: 0, fontSize: t.ts(36), lineHeight: 1.6, fontWeight: 400 }}>
          <Rich text={c.body} />
        </p>
      </CardBody>
    </CardBase>
  );
}

/* 04 — ★ Two stories (the signature contrast card) ──────────────────────── */
function CompareBlock({ side }: { side: CompareSide }) {
  const t = useTheme();
  return (
    <div>
      <Label>{side.label}</Label>
      <div style={{ fontSize: t.ts(46), fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.01em" }}>
        <Rich text={side.headline} />
      </div>
      <div style={{ fontSize: t.ts(26), lineHeight: 1.5, color: EK.whiteFaint, marginTop: t.ts(12) }}>
        <Rich text={side.detail} />
      </div>
    </div>
  );
}
function CompareCard({ c, top, ...base }: CardProps<CompareContent>) {
  const t = base.theme;
  return (
    <CardBase {...base}>
      <CardBody top={top}>
        {/* Both blocks share IDENTICAL formatting so the CONTENT difference speaks. */}
        <div style={{ display: "flex", flexDirection: "column", gap: t.ts(30) }}>
          <CompareBlock side={c.left} />
          <div style={{ height: 2, background: EK.whiteFaint, opacity: 0.5 }} />
          <CompareBlock side={c.right} />
        </div>
        <div style={{ marginTop: t.ts(40) }}>
          <div style={{ fontSize: t.ts(44), fontWeight: 600, color: t.accent, lineHeight: 1.3, letterSpacing: "-0.01em" }}>
            <Rich text={c.common.punch} />
          </div>
          {c.common.sub && (
            <div style={{ fontSize: t.ts(26), color: EK.whiteFaint, marginTop: t.ts(12) }}>
              <Rich text={c.common.sub} />
            </div>
          )}
        </div>
      </CardBody>
    </CardBase>
  );
}

/* 05 — Diagnosis ────────────────────────────────────────────────────────── */
function DiagnosisCard({ c, top, ...base }: CardProps<DiagnosisContent>) {
  const t = base.theme;
  return (
    <CardBase {...base}>
      <CardBody top={top}>
        <h2 style={{ margin: 0, fontWeight: 600, fontSize: t.ts(60), lineHeight: 1.25, letterSpacing: "-0.01em" }}>
          <Rich text={c.headline} />
        </h2>
        <Rule />
        <div style={{ display: "flex", flexDirection: "column", gap: t.ts(24) }}>
          {c.paras.map((p, i) => (
            <p key={i} style={{ margin: 0, fontSize: t.ts(36), lineHeight: 1.6, fontWeight: 400 }}>
              <Rich text={p} />
            </p>
          ))}
        </div>
      </CardBody>
    </CardBase>
  );
}

/* 06 — Analysis (list) ──────────────────────────────────────────────────── */
function AnalysisCard({ c, top, ...base }: CardProps<AnalysisContent>) {
  const t = base.theme;
  return (
    <CardBase {...base}>
      <CardBody top={top}>
        <h2 style={{ margin: 0, fontWeight: 600, fontSize: t.ts(60), lineHeight: 1.25, letterSpacing: "-0.01em" }}>
          <Rich text={c.headline} />
        </h2>
        <Rule />
        <div style={{ display: "flex", flexDirection: "column", gap: t.ts(22) }}>
          {c.items.map((it, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: t.ts(22), alignItems: "start" }}>
              <span style={{ width: t.ts(9), height: t.ts(9), borderRadius: "50%", background: EK.whiteFaint, marginTop: t.ts(18) }} />
              <span style={{ fontSize: t.ts(32), lineHeight: 1.5 }}>
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
function GridCard({ c, top, ...base }: CardProps<GridContent>) {
  const t = base.theme;
  return (
    <CardBase {...base}>
      <CardBody top={top}>
        {/* Left labels stay nowrap so conclusions align on one X-axis (§3.2);
            the right column wraps (keep-all) — long lines must never clip. */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: t.ts(30), rowGap: t.ts(34), alignItems: "baseline" }}>
          {c.rows.map((r, i) => (
            <Fragment key={i}>
              <span className="ek-nowrap" style={{ fontSize: t.ts(34), color: EK.whiteFaint, fontWeight: 400 }}>
                <Rich text={r[0]} />
              </span>
              <span style={{ fontSize: t.ts(40), color: EK.white, fontWeight: 600, lineHeight: 1.4 }}>
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
function ClaimCard({ c, top, ...base }: CardProps<ClaimContent>) {
  const t = base.theme;
  return (
    <CardBase {...base}>
      <CardBody top={top}>
        <h2 style={{ margin: 0, fontWeight: 600, fontSize: t.ts(60), lineHeight: 1.25, letterSpacing: "-0.01em" }}>
          <Rich text={c.headline} />
        </h2>
        <Rule />
        {c.emphasis && (
          <div style={{ fontSize: t.ts(52), fontWeight: 600, color: t.accent, lineHeight: 1.3, letterSpacing: "-0.01em" }}>
            <Rich text={c.emphasis} />
          </div>
        )}
        {c.sub && (
          <p style={{ margin: `${t.ts(22)}px 0 0`, fontSize: t.ts(36), lineHeight: 1.6, color: EK.whiteFaint }}>
            <Rich text={c.sub} />
          </p>
        )}
      </CardBody>
    </CardBase>
  );
}

/* 09 — Conclusion (couplet) ─────────────────────────────────────────────── */
function ConclusionCard({ c, top, ...base }: CardProps<ConclusionContent>) {
  const t = base.theme;
  return (
    <CardBase {...base}>
      <CardBody top={top}>
        <p style={{ margin: 0, fontSize: t.ts(36), lineHeight: 1.6, fontWeight: 400 }}>
          <Rich text={c.intro} />
        </p>
        <Rule />
        <div style={{ display: "flex", flexDirection: "column", gap: t.ts(16) }}>
          {c.couplet.map((l, i) => (
            <div key={i} style={{ fontSize: t.ts(48), fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.01em" }}>
              <Rich text={l} />
            </div>
          ))}
        </div>
      </CardBody>
    </CardBase>
  );
}

/* 10 — Closing (editable; empty string hides a line) ────────────────────── */
function ClosingCard({ meta, c, ...base }: BaseProps & { meta: DeckMeta; c?: ClosingContent }) {
  const t = base.theme;
  const cl = c ?? defaultClosing(meta.issue);
  return (
    <CardBase {...base} watermark={false}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: `0 ${Math.round(120 * t.sx)}px`,
        }}
      >
        {cl.tagline.trim() !== "" && (
          <div className="ek-ko" style={{ fontSize: t.ts(40), fontWeight: 500, lineHeight: 1.5 }}>
            <Rich text={cl.tagline} />
          </div>
        )}
        {cl.subline.trim() !== "" && (
          <div className="ek-ko" style={{ fontSize: t.ts(30), color: EK.whiteFaint, marginTop: t.ts(14) }}>
            <Rich text={cl.subline} />
          </div>
        )}
        {/* The single accent2 moment in the whole deck — brand self-reference (§2.1). */}
        <div
          className="ek-nowrap"
          style={{ fontFamily: FONT.display, fontStyle: "italic", fontWeight: 600, fontSize: t.ts(66), color: t.accent2, margin: `${t.ts(50)}px 0 ${t.ts(6)}px` }}
        >
          {t.watermark.trim() !== "" ? t.watermark : "eigen knot"}
        </div>
        {cl.note.trim() !== "" && (
          <div className="ek-ko" style={{ fontSize: t.ts(26), color: EK.whiteFaint }}>
            <Rich text={cl.note} />
          </div>
        )}
        {cl.footer.trim() !== "" && (
          <div
            className="ek-nowrap"
            style={{ fontFamily: FONT.display, fontStyle: "italic", fontSize: t.ts(27), color: EK.whiteFaint, marginTop: t.ts(42), letterSpacing: "0.02em" }}
          >
            <Rich text={cl.footer} />
          </div>
        )}
      </div>
    </CardBase>
  );
}

/* Dispatcher ────────────────────────────────────────────────────────────── */
export function RenderCard({ deck, spec }: { deck: Deck; spec: CardSpec }) {
  const dim = deck.dims?.[spec.role] ?? spec.dim;
  const theme = resolveTheme(deck);
  const base: BaseProps = { bg: deck.bg, dim, focal: deck.focal, theme };
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
      return <ClosingCard {...base} meta={deck.meta} c={c.closing} />;
  }
}
