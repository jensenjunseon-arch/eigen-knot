import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CardRole, Deck } from "@/types";
import { CARD_ORDER } from "@/types";
import { RenderCard } from "@/cards/cards";
import { cardFilename } from "@/lib/filename";
import { SAMPLE_DECK } from "@/sample";
import { cardOverflow } from "./shared";

/* ════════════════════════════════════════════════════════════════════════
   eigen knot — card studio (M4)
   글 붙여넣기 → AI 초안 → 카드별 인라인 편집 → dim/focal 조정 → PNG ZIP 내보내기.
   덱은 localStorage에 자동 저장된다 (배경 포함이 용량을 넘으면 배경만 제외).
   ════════════════════════════════════════════════════════════════════════ */

const STORE_KEY = "ek-studio-v1";
const BODY_ROLES: CardRole[] = ["summary", "definition", "compare", "diagnosis", "analysis", "grid", "claim", "conclusion"];

const ROLE_LABELS: Record<CardRole, string> = {
  cover: "표지",
  summary: "세 줄 요약",
  definition: "정의",
  compare: "★ 대비 장면",
  diagnosis: "진단",
  analysis: "심화 분석",
  grid: "대비 그리드",
  claim: "핵심 주장",
  conclusion: "결론",
  closing: "끝맺음 (고정)",
};

const FIELD_LABELS: Record<string, string> = {
  kicker: "킥커 (영문)",
  headline: "헤드라인",
  lines: "요약 3줄",
  term_ko: "개념 (한글)",
  term_en: "개념 (영문)",
  body: "설명",
  left: "장면 하나",
  right: "장면 둘",
  label: "라벨",
  detail: "부연",
  common: "공통 결론",
  punch: "결정타 (와인)",
  sub: "보조 문장",
  paras: "문단",
  items: "항목",
  rows: "행 (좌 라벨 → 우 결론)",
  intro: "도입",
  couplet: "대구 2줄",
  emphasis: "강조 (와인)",
};

type Path = (string | number)[];

function setAtPath<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const clone: Record<string | number, unknown> = Array.isArray(obj)
    ? ([...(obj as unknown[])] as unknown as Record<string | number, unknown>)
    : { ...(obj as Record<string | number, unknown>) };
  clone[head] = setAtPath(clone[head], rest, value);
  return clone as T;
}

/* ── 범용 필드 에디터: string → textarea, array → 목록, object → 재귀 ────── */
function FieldEditor({
  value,
  path,
  onSet,
}: {
  value: unknown;
  path: Path;
  onSet: (path: Path, v: unknown) => void;
}): ReactNode {
  if (typeof value === "string") {
    return (
      <textarea
        value={value}
        rows={Math.max(1, Math.ceil(value.length / 26) + (value.match(/\n/g)?.length ?? 0))}
        onChange={(e) => onSet(path, e.target.value)}
        style={ui.textarea}
      />
    );
  }
  if (Array.isArray(value)) {
    const isTupleRows = value.every((v) => Array.isArray(v));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {value.map((item, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "start" }}>
            <FieldEditor value={item} path={[...path, i]} onSet={onSet} />
            <button
              title="이 항목 삭제"
              style={ui.iconBtn}
              onClick={() => onSet(path, value.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          style={ui.ghostBtn}
          onClick={() => onSet(path, [...value, isTupleRows ? ["", ""] : ""])}
        >
          + 항목 추가
        </button>
      </div>
    );
  }
  if (typeof value === "object" && value !== null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <div style={ui.fieldLabel}>{FIELD_LABELS[k] ?? k}</div>
            <FieldEditor value={v} path={[...path, k]} onSet={onSet} />
          </div>
        ))}
      </div>
    );
  }
  return null;
}

/* ── 카드 썸네일 ─────────────────────────────────────────────────────────── */
function Thumb({
  deck,
  index,
  selected,
  onSelect,
  scale,
}: {
  deck: Deck;
  index: number;
  selected: boolean;
  onSelect: () => void;
  scale: number;
}) {
  const spec = CARD_ORDER[index];
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const { v, h } = cardOverflow(ref.current);
    setOverflow(v || h);
  });
  const dim = deck.dims?.[spec.role] ?? spec.dim;
  return (
    <div style={{ cursor: "pointer" }} onClick={onSelect}>
      <div
        style={{
          width: 1080 * scale,
          height: 1350 * scale,
          overflow: "hidden",
          borderRadius: 8,
          outline: selected ? "3px solid #C44058" : "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 14px 30px -18px rgba(0,0,0,.8)",
        }}
      >
        <div ref={ref} style={{ width: 1080, height: 1350, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <RenderCard deck={deck} spec={spec} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "#9a97a8", fontFamily: "ui-monospace, monospace" }}>
        <span>
          {String(index + 1).padStart(2, "0")} {ROLE_LABELS[spec.role]} · dim {dim.toFixed(2)}
        </span>
        {overflow && <span style={{ color: "#ff6b6b" }}>⚠ 넘침</span>}
      </div>
    </div>
  );
}

/* ── 메인 스튜디오 ──────────────────────────────────────────────────────── */
export function Studio() {
  const [deck, setDeck] = useState<Deck>(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Deck;
        // 옛 저장본의 bg가 dataURL이 아니면(자산 URL 등) 샘플 배경으로 교체.
        return { ...saved, bg: saved.bg?.startsWith("data:") ? saved.bg : SAMPLE_DECK.bg };
      }
    } catch {
      /* corrupt store → sample */
    }
    return SAMPLE_DECK;
  });
  const [sel, setSel] = useState(0);
  const [article, setArticle] = useState("");
  const [busy, setBusy] = useState<null | "ai" | "export">(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Autosave (bg가 5MB 한도를 넘기면 배경 없이 저장).
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(deck));
    } catch {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ ...deck, bg: "" }));
      } catch {
        /* give up silently — export still works */
      }
    }
  }, [deck]);

  const setContent = (path: Path, v: unknown) =>
    setDeck((d) => ({ ...d, content: setAtPath(d.content, path, v) }));

  const spec = CARD_ORDER[sel];
  const selDim = deck.dims?.[spec.role] ?? spec.dim;
  const bodyDim = deck.dims?.summary ?? 0.9;

  /* 이미지 업로드 — svg는 url-encoded로 (base64 svg는 Chromium 배경에서 디코드 실패) */
  const onUpload = (file: File) => {
    if (file.type === "image/svg+xml") {
      file.text().then((t) => setDeck((d) => ({ ...d, bg: `data:image/svg+xml,${encodeURIComponent(t)}` })));
    } else {
      const r = new FileReader();
      r.onload = () => setDeck((d) => ({ ...d, bg: String(r.result) }));
      r.readAsDataURL(file);
    }
  };

  /* AI 초안 */
  const runAI = async () => {
    setBusy("ai");
    setNotice(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: article, meta: deck.meta }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      j.content.cover = { ...j.content.cover, kicker: `Weekly Insight: ${deck.meta.issue} knot` };
      setDeck((d) => ({ ...d, content: j.content }));
      setNotice("✓ AI 초안 완성 — 카드를 눌러 다듬어 주세요.");
    } catch (e) {
      setNotice(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  /* PNG ZIP 내보내기 */
  const runExport = async () => {
    setBusy("export");
    setNotice(null);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deck }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      setNotice(j.overflowAny ? "⚠ 일부 카드가 넘쳤습니다 — 빨간 ⚠ 카드를 다듬어 주세요." : "✓ PNG 10장 + ZIP 완성");
      if (j.zipUrl) window.location.href = j.zipUrl;
    } catch (e) {
      setNotice(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  /* deck.json 저장/불러오기 */
  const saveJson = () => {
    const blob = new Blob([JSON.stringify({ ...deck, bg: undefined }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `deck-issue-${String(deck.meta.issue).padStart(3, "0")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const loadJson = (file: File) => {
    file.text().then((t) => {
      try {
        const j = JSON.parse(t);
        // 전체 deck(meta+content) 또는 content-only JSON 둘 다 허용.
        if (j.content && j.meta) setDeck((d) => ({ ...j, bg: d.bg }));
        else if (j.cover) setDeck((d) => ({ ...d, content: j }));
        else throw new Error("형식이 아님");
        setNotice("✓ 덱 불러옴");
      } catch {
        setNotice("✗ deck.json 형식이 아닙니다");
      }
    });
  };

  return (
    <div style={ui.root}>
      {/* ── 상단 바 ── */}
      <header style={ui.topbar}>
        <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", color: "#C44058", fontSize: 17 }}>
          eigen knot <span style={{ color: "#8e8b9c", fontStyle: "normal", fontSize: 13 }}>card studio</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {notice && <span style={{ fontSize: 12.5, color: notice.startsWith("✗") ? "#ff6b6b" : "#b9e2b4", marginRight: 8 }}>{notice}</span>}
          <button style={ui.ghostBtn} onClick={saveJson}>deck.json 저장</button>
          <label style={{ ...ui.ghostBtn, display: "inline-block" }}>
            불러오기
            <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && loadJson(e.target.files[0])} />
          </label>
          <button
            style={{ ...ui.primaryBtn, opacity: busy ? 0.6 : 1 }}
            disabled={busy !== null}
            onClick={runExport}
          >
            {busy === "export" ? "내보내는 중… (~20초)" : "PNG 10장 내보내기"}
          </button>
        </div>
      </header>

      <div style={ui.cols}>
        {/* ── 좌측 패널 ── */}
        <aside style={ui.side}>
          <Section title="호 정보">
            <Row label="호 번호">
              <input
                style={ui.input}
                type="number"
                value={deck.meta.issue}
                onChange={(e) => setDeck((d) => ({ ...d, meta: { ...d.meta, issue: Number(e.target.value) || 0 } }))}
              />
            </Row>
            <Row label="슬러그 (영문)">
              <input
                style={ui.input}
                value={deck.meta.slug}
                onChange={(e) => setDeck((d) => ({ ...d, meta: { ...d.meta, slug: e.target.value } }))}
              />
            </Row>
            <Row label="제목">
              <input
                style={ui.input}
                value={deck.meta.title}
                onChange={(e) => setDeck((d) => ({ ...d, meta: { ...d.meta, title: e.target.value } }))}
              />
            </Row>
          </Section>

          <Section title="배경 사진">
            <label style={{ ...ui.primaryBtn, display: "block", textAlign: "center" }}>
              이미지 업로드 (jpg/png)
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
            </label>
            <Row label="초점 (focal)">
              <input
                style={ui.input}
                value={deck.focal ?? "center"}
                onChange={(e) => setDeck((d) => ({ ...d, focal: e.target.value }))}
              />
            </Row>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["center", "center 25%", "center 35%", "center 50%"].map((f) => (
                <button key={f} style={ui.chipBtn} onClick={() => setDeck((d) => ({ ...d, focal: f }))}>
                  {f}
                </button>
              ))}
            </div>
            <Row label={`본문 dim 일괄 · ${bodyDim.toFixed(2)}`}>
              <input
                type="range"
                min={0.5}
                max={0.94}
                step={0.01}
                value={bodyDim}
                style={{ width: "100%" }}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDeck((d) => ({
                    ...d,
                    dims: { ...d.dims, ...Object.fromEntries(BODY_ROLES.map((r) => [r, v])) },
                  }));
                }}
              />
            </Row>
          </Section>

          <Section title="글 → AI 초안">
            <textarea
              style={{ ...ui.textarea, minHeight: 110 }}
              placeholder="뉴스레터 본문을 붙여넣고 'AI 초안 만들기'를 누르세요. (.env에 ANTHROPIC_API_KEY 필요)"
              value={article}
              onChange={(e) => setArticle(e.target.value)}
            />
            <button
              style={{ ...ui.primaryBtn, width: "100%", opacity: busy ? 0.6 : 1 }}
              disabled={busy !== null || !article.trim()}
              onClick={runAI}
            >
              {busy === "ai" ? "분석 중…" : "AI 초안 만들기"}
            </button>
          </Section>

          <Section title={`카드 편집 — ${String(sel + 1).padStart(2, "0")} ${ROLE_LABELS[spec.role]}`}>
            <Row label={`이 카드 dim · ${selDim.toFixed(2)}`}>
              <input
                type="range"
                min={0.4}
                max={0.94}
                step={0.01}
                value={selDim}
                style={{ width: "100%" }}
                onChange={(e) =>
                  setDeck((d) => ({ ...d, dims: { ...d.dims, [spec.role]: Number(e.target.value) } }))
                }
              />
            </Row>
            {spec.role === "closing" ? (
              <div style={{ fontSize: 12.5, color: "#8e8b9c", lineHeight: 1.6 }}>
                끝맺음 카드는 매 호 고정 문구입니다 (브랜드 자산).
              </div>
            ) : (
              <FieldEditor
                value={deck.content[spec.role as keyof typeof deck.content]}
                path={[spec.role]}
                onSet={setContent}
              />
            )}
          </Section>
        </aside>

        {/* ── 카드 그리드 ── */}
        <main style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))", gap: 22 }}>
            {CARD_ORDER.map((s, i) => (
              <Thumb key={s.role} deck={deck} index={i} selected={i === sel} onSelect={() => setSel(i)} scale={248 / 1080} />
            ))}
          </div>
          <div style={{ marginTop: 18, fontSize: 11.5, color: "#6f6c7d", fontFamily: "ui-monospace, monospace" }}>
            {cardFilename(1, deck.meta.slug, deck.meta.issue, "cover")} …
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── 작은 레이아웃 헬퍼/스타일 ──────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14, marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, letterSpacing: "0.08em", color: "#C44058", fontWeight: 600 }}>{title}</div>
      {children}
    </section>
  );
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={ui.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

const ui: Record<string, CSSProperties> = {
  root: { minHeight: "100vh", background: "#14131a", color: "#e8e6f0", fontFamily: "system-ui, sans-serif" },
  topbar: {
    position: "sticky", top: 0, zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 20px", background: "rgba(20,19,26,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  cols: { display: "flex", gap: 24, padding: "18px 20px 80px", alignItems: "flex-start" },
  side: { width: 340, flex: "none", position: "sticky", top: 64, maxHeight: "calc(100vh - 80px)", overflowY: "auto", paddingRight: 6 },
  fieldLabel: { fontSize: 11.5, color: "#8e8b9c", marginBottom: 5 },
  input: {
    width: "100%", boxSizing: "border-box", background: "#1e1d26", color: "#e8e6f0",
    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "7px 9px", fontSize: 13.5,
  },
  textarea: {
    width: "100%", boxSizing: "border-box", background: "#1e1d26", color: "#e8e6f0",
    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "7px 9px", fontSize: 13.5,
    fontFamily: "inherit", lineHeight: 1.5, resize: "vertical",
  },
  primaryBtn: {
    background: "#C44058", color: "#fff", border: "none", borderRadius: 7,
    padding: "9px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
  },
  ghostBtn: {
    background: "transparent", color: "#cfccdb", border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 7, padding: "7px 12px", fontSize: 12.5, cursor: "pointer",
  },
  chipBtn: {
    background: "#1e1d26", color: "#cfccdb", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 999, padding: "4px 10px", fontSize: 11.5, cursor: "pointer",
  },
  iconBtn: {
    background: "transparent", color: "#8e8b9c", border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 6, width: 26, height: 26, cursor: "pointer", lineHeight: 1,
  },
};
