import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CardRole, Deck, DeckContent } from "@/types";
import { CARD_ORDER, ALL_ROLES, PLATFORMS, activeSpecs, deckSize } from "@/types";
import { RenderCard } from "@/cards/cards";
import { cardFilename } from "@/lib/filename";
import { FONT_CHOICES, DEFAULT_FONT_ID } from "@/design/fonts";
import { SAMPLE_DECK } from "@/sample";
import { cardOverflow } from "./shared";
import { apiFetch, checkPassword, getPw, savePw, imageToBg, downloadBase64 } from "./api";

/* ════════════════════════════════════════════════════════════════════════
   eigen knot — card studio 2.0
   인트로(글 입력) → 스튜디오(상세 편집). 덱은 localStorage에 자동 저장.
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
  closing: "끝맺음",
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
  punch: "결정타 (강조색)",
  sub: "보조 문장",
  paras: "문단",
  items: "항목",
  rows: "행 (좌 라벨 → 우 결론)",
  intro: "도입",
  couplet: "대구 2줄",
  emphasis: "강조 문장 (강조색)",
};

const ACCENT_PRESETS = [
  { label: "와인", value: "#C44058" },
  { label: "플럼", value: "#8E4585" },
  { label: "네이비", value: "#3D6B9E" },
  { label: "포레스트", value: "#3F7249" },
  { label: "오커", value: "#C98A2B" },
  { label: "코랄", value: "#E2725B" },
];

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

/* ── 범용 필드 에디터 ────────────────────────────────────────────────────── */
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
            <button title="이 항목 삭제" style={ui.iconBtn} onClick={() => onSet(path, value.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        <button style={ui.ghostBtn} onClick={() => onSet(path, [...value, isTupleRows ? ["", ""] : ""])}>
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
  width,
}: {
  deck: Deck;
  index: number;
  selected: boolean;
  onSelect: () => void;
  width: number;
}) {
  const specs = activeSpecs(deck);
  const spec = specs[index];
  const { w, h } = deckSize(deck);
  const scale = width / w;
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const { v, h: hov } = cardOverflow(ref.current, h);
    setOverflow(v || hov);
  });
  const dim = deck.dims?.[spec.role] ?? spec.dim;
  return (
    <div style={{ cursor: "pointer" }} onClick={onSelect}>
      <div
        style={{
          width,
          height: Math.round(h * scale),
          overflow: "hidden",
          borderRadius: 8,
          outline: selected ? `3px solid ${deck.accent ?? "#C44058"}` : "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 14px 30px -18px rgba(0,0,0,.8)",
        }}
      >
        <div ref={ref} style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>
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

/* ── 인트로 화면: AI 플랫폼식 입력 ──────────────────────────────────────── */
function Intro({
  hasSaved,
  onContinue,
  onAI,
  onSample,
  onLoad,
  busy,
  notice,
}: {
  hasSaved: boolean;
  onContinue: () => void;
  onAI: (article: string, title: string, issue: number) => void;
  onSample: () => void;
  onLoad: (f: File) => void;
  busy: boolean;
  notice: string | null;
}) {
  const [article, setArticle] = useState("");
  const [title, setTitle] = useState("");
  const [issue, setIssue] = useState(1);
  return (
    <div style={ui.introRoot}>
      <div style={ui.introCol}>
        <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", color: "#C44058", fontSize: 34, textAlign: "center" }}>
          eigen knot
        </div>
        <div style={{ color: "#8e8b9c", fontSize: 15, textAlign: "center", margin: "10px 0 34px" }}>
          글 한 편이 카드뉴스가 됩니다 — 붙여넣고, 다듬고, 내보내세요.
        </div>

        <div style={ui.introBox}>
          <textarea
            style={ui.introTextarea}
            placeholder={"뉴스레터 본문이나 쓰고 싶은 글을 여기에 붙여넣으세요…\n\nAI가 표지·요약·대비 장면·결론까지 카드 초안을 만들어 드립니다."}
            value={article}
            onChange={(e) => setArticle(e.target.value)}
          />
          <div style={{ display: "flex", gap: 10, padding: "0 14px 14px", flexWrap: "wrap" }}>
            <input
              style={{ ...ui.input, flex: "1 1 220px" }}
              placeholder="제목 (예: 뉴스레터를 시작한 이유)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              style={{ ...ui.input, width: 110, flex: "none" }}
              type="number"
              min={1}
              value={issue}
              onChange={(e) => setIssue(Number(e.target.value) || 1)}
              title="호 번호"
            />
            <button
              style={{ ...ui.primaryBtn, flex: "none", opacity: busy || !article.trim() ? 0.55 : 1 }}
              disabled={busy || !article.trim()}
              onClick={() => onAI(article, title, issue)}
            >
              {busy ? "AI가 카드를 만드는 중…" : "AI로 카드 만들기 →"}
            </button>
          </div>
        </div>

        {notice && <div style={{ color: notice.startsWith("✗") ? "#ff6b6b" : "#b9e2b4", fontSize: 13, textAlign: "center", marginTop: 14 }}>{notice}</div>}

        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 22, flexWrap: "wrap" }}>
          {hasSaved && (
            <button style={ui.ghostBtn} onClick={onContinue}>
              ↩ 이어서 편집
            </button>
          )}
          <button style={ui.ghostBtn} onClick={onSample}>
            샘플 틀로 시작 (AI 없이)
          </button>
          <label style={{ ...ui.ghostBtn, display: "inline-block" }}>
            deck.json 불러오기
            <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && onLoad(e.target.files[0])} />
          </label>
        </div>
      </div>
    </div>
  );
}

/* ── 메인 스튜디오 ──────────────────────────────────────────────────────── */
export function Studio() {
  const [deck, setDeck] = useState<Deck | null>(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Deck;
        return { ...saved, bg: saved.bg?.startsWith("data:") ? saved.bg : SAMPLE_DECK.bg };
      }
    } catch {
      /* corrupt store → intro */
    }
    return null;
  });
  const [phase, setPhase] = useState<"intro" | "studio">("intro");
  const [sel, setSel] = useState(0);
  const [article, setArticle] = useState("");
  const [busy, setBusy] = useState<null | "ai" | "export">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    checkPassword(getPw()).then((r) => {
      setUnlocked(r.ok || !!r.open);
      setChecked(true);
    });
  }, []);

  useEffect(() => {
    if (!deck) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(deck));
    } catch {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ ...deck, bg: "" }));
      } catch {
        /* quota — export still works */
      }
    }
  }, [deck]);

  const specs = deck ? activeSpecs(deck) : CARD_ORDER;
  const selIdx = Math.min(sel, specs.length - 1);
  const spec = specs[selIdx];

  const setContent = (path: Path, v: unknown) =>
    setDeck((d) => (d ? { ...d, content: setAtPath(d.content, path, v) } : d));

  const patch = (p: Partial<Deck>) => setDeck((d) => (d ? { ...d, ...p } : d));

  /* AI 초안 (인트로/스튜디오 공용) */
  const runAI = async (text: string, title?: string, issue?: number) => {
    if (!text.trim()) return;
    setBusy("ai");
    setNotice(null);
    const meta = {
      issue: issue ?? deck?.meta.issue ?? 1,
      slug: deck?.meta.slug || `knot-${String(issue ?? 1).padStart(3, "0")}`,
      title: title || deck?.meta.title || "",
    };
    try {
      const j = await apiFetch<{ content: DeckContent }>("/api/analyze", { body: text, meta });
      const content: DeckContent = {
        ...j.content,
        cover: { ...j.content.cover, kicker: `Weekly Insight: ${meta.issue} knot` },
      };
      setDeck((d) => ({ ...(d ?? SAMPLE_DECK), meta, content, bg: d?.bg ?? SAMPLE_DECK.bg }));
      setPhase("studio");
      setNotice("✓ AI 초안 완성 — 카드를 눌러 다듬어 주세요.");
    } catch (e) {
      setNotice(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  /* PNG 내보내기 */
  const runExport = async () => {
    if (!deck) return;
    setBusy("export");
    setNotice(null);
    try {
      const j = await apiFetch<{ zipB64: string; zipName: string; overflowAny: boolean }>("/api/capture", { deck });
      downloadBase64(j.zipB64, j.zipName);
      setNotice(j.overflowAny ? "⚠ 일부 카드가 넘쳤습니다 — ⚠ 표시 카드를 다듬어 주세요." : "✓ ZIP 다운로드 완료");
    } catch (e) {
      setNotice(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  /* deck.json 저장/불러오기 */
  const saveJson = () => {
    if (!deck) return;
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
        if (j.content && j.meta) {
          setDeck((d) => ({ ...j, bg: d?.bg?.startsWith("data:") ? d.bg : SAMPLE_DECK.bg }));
        } else if (j.cover) {
          setDeck((d) => ({ ...(d ?? SAMPLE_DECK), content: j }));
        } else throw new Error("bad json");
        setPhase("studio");
        setNotice("✓ 덱 불러옴");
      } catch {
        setNotice("✗ deck.json 형식이 아닙니다");
      }
    });
  };

  const onUpload = (file: File) => {
    imageToBg(file)
      .then((bg) => patch({ bg }))
      .catch((e) => setNotice(`✗ ${e instanceof Error ? e.message : String(e)}`));
  };

  if (!checked) return null;
  if (!unlocked) return <LoginGate onUnlock={() => setUnlocked(true)} />;

  /* ── 인트로 ── */
  if (phase === "intro") {
    return (
      <Intro
        hasSaved={!!deck}
        onContinue={() => setPhase("studio")}
        onAI={(text, title, issue) => void runAI(text, title, issue)}
        onSample={() => {
          setDeck((d) => d ?? SAMPLE_DECK);
          setPhase("studio");
        }}
        onLoad={loadJson}
        busy={busy === "ai"}
        notice={notice}
      />
    );
  }

  if (!deck) {
    setPhase("intro");
    return null;
  }

  const { w, h } = deckSize(deck);
  const bodyDim = deck.dims?.summary ?? 0.9;
  const selDim = deck.dims?.[spec.role] ?? spec.dim;
  const accent = deck.accent ?? "#C44058";

  /* ── 스튜디오 ── */
  return (
    <div style={ui.root}>
      <header style={ui.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button style={ui.ghostBtn} onClick={() => setPhase("intro")} title="처음 화면으로">
            ←
          </button>
          <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", color: "#C44058", fontSize: 17 }}>
            eigen knot <span style={{ color: "#8e8b9c", fontStyle: "normal", fontSize: 13 }}>card studio</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {notice && <span style={{ fontSize: 12.5, color: notice.startsWith("✗") ? "#ff6b6b" : "#b9e2b4", marginRight: 8 }}>{notice}</span>}
          <button style={ui.ghostBtn} onClick={saveJson}>
            deck.json 저장
          </button>
          <label style={{ ...ui.ghostBtn, display: "inline-block" }}>
            불러오기
            <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && loadJson(e.target.files[0])} />
          </label>
          <button style={{ ...ui.primaryBtn, opacity: busy ? 0.6 : 1 }} disabled={busy !== null} onClick={runExport}>
            {busy === "export" ? "내보내는 중… (~20초)" : `PNG ${specs.length}장 내보내기`}
          </button>
        </div>
      </header>

      <div style={ui.cols}>
        {/* ── 좌측 패널 ── */}
        <aside style={ui.side}>
          {/* 선택 카드 편집 — 가장 자주 쓰므로 맨 위 */}
          <Section title={`카드 편집 — ${String(selIdx + 1).padStart(2, "0")} ${ROLE_LABELS[spec.role]}`} defaultOpen>
            <Row label={`이 카드 dim · ${selDim.toFixed(2)}`}>
              <input
                type="range"
                min={0.4}
                max={0.94}
                step={0.01}
                value={selDim}
                style={{ width: "100%" }}
                onChange={(e) => patch({ dims: { ...deck.dims, [spec.role]: Number(e.target.value) } })}
              />
            </Row>
            {spec.role === "closing" ? (
              <div style={{ fontSize: 12.5, color: "#8e8b9c", lineHeight: 1.6 }}>
                끝맺음 카드는 고정 문구입니다 (워터마크 문구는 ‘디자인’에서 변경).
              </div>
            ) : (
              <FieldEditor value={deck.content[spec.role as keyof DeckContent]} path={[spec.role]} onSet={setContent} />
            )}
          </Section>

          {/* 디자인 */}
          <Section title="디자인" defaultOpen>
            <Row label="폰트">
              <select
                style={ui.input}
                value={deck.font ?? DEFAULT_FONT_ID}
                onChange={(e) => patch({ font: e.target.value })}
              >
                {FONT_CHOICES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label={`글자 크기 · ${Math.round((deck.typeScale ?? 1) * 100)}%`}>
              <input
                type="range"
                min={0.7}
                max={1.4}
                step={0.02}
                value={deck.typeScale ?? 1}
                style={{ width: "100%" }}
                onChange={(e) => patch({ typeScale: Number(e.target.value) })}
              />
            </Row>
            <Row label="강조색">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {ACCENT_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    title={p.label}
                    onClick={() => patch({ accent: p.value })}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: p.value,
                      border: accent.toLowerCase() === p.value.toLowerCase() ? "2px solid #fff" : "2px solid transparent",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
              <input
                style={ui.input}
                value={deck.accent ?? "#C44058"}
                placeholder="#C44058 또는 rgb(196,64,88)"
                onChange={(e) => patch({ accent: e.target.value })}
              />
            </Row>
            <Row label="브랜드색 (끝맺음 카드)">
              <input
                style={ui.input}
                value={deck.accent2 ?? "#D6D55A"}
                placeholder="#D6D55A"
                onChange={(e) => patch({ accent2: e.target.value })}
              />
            </Row>
            <Row label="워터마크 문구 (비우면 숨김)">
              <input
                style={ui.input}
                value={deck.watermark ?? "eigen knot"}
                onChange={(e) => patch({ watermark: e.target.value })}
              />
            </Row>
            <Row label="플랫폼 사이즈">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PLATFORMS.map((p) => {
                  const active = w === p.w && h === p.h;
                  return (
                    <button
                      key={p.id}
                      style={{ ...ui.chipBtn, ...(active ? { background: "#C44058", color: "#fff", borderColor: "#C44058" } : {}) }}
                      onClick={() => patch({ size: { w: p.w, h: p.h } })}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: "#6f6c7d", marginTop: 6 }}>
                현재 {w}×{h}px — 사이즈를 바꾸면 ⚠ 넘침 표시를 확인하세요.
              </div>
            </Row>
          </Section>

          {/* 배경 */}
          <Section title="배경 사진">
            <label style={{ ...ui.primaryBtn, display: "block", textAlign: "center" }}>
              이미지 업로드 (jpg/png)
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
            </label>
            <Row label="초점 (focal)">
              <input style={ui.input} value={deck.focal ?? "center"} onChange={(e) => patch({ focal: e.target.value })} />
            </Row>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["center", "center 25%", "center 35%", "center 50%"].map((f) => (
                <button key={f} style={ui.chipBtn} onClick={() => patch({ focal: f })}>
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
                  patch({ dims: { ...deck.dims, ...Object.fromEntries(BODY_ROLES.map((r) => [r, v])) } });
                }}
              />
            </Row>
          </Section>

          {/* 카드 구성 */}
          <Section title={`카드 구성 · ${specs.length}장`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {CARD_ORDER.map((s) => {
                const current = deck.cards?.length ? deck.cards : ALL_ROLES;
                const on = current.includes(s.role);
                return (
                  <label key={s.role} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer", color: on ? "#e8e6f0" : "#6f6c7d" }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const next = on ? current.filter((r) => r !== s.role) : ALL_ROLES.filter((r) => current.includes(r) || r === s.role);
                        if (next.length === 0) return; // 최소 1장
                        patch({ cards: next });
                        setSel(0);
                      }}
                    />
                    {ROLE_LABELS[s.role]}
                  </label>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#6f6c7d" }}>해제한 카드는 내보내기에서 빠집니다. 파일 번호는 자동으로 당겨집니다.</div>
          </Section>

          {/* 호 정보 */}
          <Section title="호 정보">
            <Row label="호 번호">
              <input
                style={ui.input}
                type="number"
                value={deck.meta.issue}
                onChange={(e) => patch({ meta: { ...deck.meta, issue: Number(e.target.value) || 0 } })}
              />
            </Row>
            <Row label="슬러그 (영문 kebab)">
              <input style={ui.input} value={deck.meta.slug} onChange={(e) => patch({ meta: { ...deck.meta, slug: e.target.value } })} />
            </Row>
            <Row label="제목">
              <input style={ui.input} value={deck.meta.title} onChange={(e) => patch({ meta: { ...deck.meta, title: e.target.value } })} />
            </Row>
          </Section>

          {/* 글 → AI 재생성 */}
          <Section title="글 → AI 초안 다시 만들기">
            <textarea
              style={{ ...ui.textarea, minHeight: 90 }}
              placeholder="본문을 붙여넣고 누르면 카드 내용을 새로 작성합니다 (현재 편집 내용은 덮어씌워짐)."
              value={article}
              onChange={(e) => setArticle(e.target.value)}
            />
            <button
              style={{ ...ui.primaryBtn, width: "100%", opacity: busy || !article.trim() ? 0.55 : 1 }}
              disabled={busy !== null || !article.trim()}
              onClick={() => void runAI(article)}
            >
              {busy === "ai" ? "분석 중…" : "AI 초안 만들기"}
            </button>
          </Section>
        </aside>

        {/* ── 카드 그리드 ── */}
        <main style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))", gap: 22 }}>
            {specs.map((s, i) => (
              <Thumb key={s.role} deck={deck} index={i} selected={i === selIdx} onSelect={() => setSel(i)} width={248} />
            ))}
          </div>
          <div style={{ marginTop: 18, fontSize: 11.5, color: "#6f6c7d", fontFamily: "ui-monospace, monospace" }}>
            {cardFilename(1, deck.meta.slug, deck.meta.issue, specs[0].cardname)} …
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── 로그인 게이트 ──────────────────────────────────────────────────────── */
function LoginGate({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setLocal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    const r = await checkPassword(pw);
    if (r.ok || r.open) {
      savePw(pw);
      onUnlock();
    } else {
      setErr("비밀번호가 올바르지 않습니다.");
      setBusy(false);
    }
  };
  return (
    <div style={ui.gate}>
      <div style={ui.gateCard}>
        <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", color: "#C44058", fontSize: 22 }}>eigen knot</div>
        <div style={{ color: "#8e8b9c", fontSize: 13, margin: "6px 0 20px" }}>card studio — 비밀번호를 입력하세요</div>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setLocal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ ...ui.input, marginBottom: 12 }}
          placeholder="비밀번호"
        />
        {err && <div style={{ color: "#ff6b6b", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
        <button style={{ ...ui.primaryBtn, width: "100%", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
          {busy ? "확인 중…" : "들어가기"}
        </button>
      </div>
    </div>
  );
}

/* ── 접이식 섹션 ────────────────────────────────────────────────────────── */
function Section({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, marginTop: 12 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "transparent",
          border: "none",
          padding: "2px 0 10px",
          cursor: "pointer",
          fontSize: 12,
          letterSpacing: "0.08em",
          color: "#C44058",
          fontWeight: 600,
        }}
      >
        {title}
        <span style={{ color: "#6f6c7d", fontSize: 11 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>}
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
  gate: { position: "fixed", inset: 0, background: "#14131a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" },
  gateCard: { width: 320, padding: 28, background: "#1e1d26", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 },
  introRoot: { minHeight: "100vh", background: "#14131a", color: "#e8e6f0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: 24 },
  introCol: { width: "min(720px, 94vw)" },
  introBox: { background: "#1e1d26", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, overflow: "hidden", boxShadow: "0 30px 80px -40px rgba(0,0,0,.8)" },
  introTextarea: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 220,
    background: "transparent",
    color: "#e8e6f0",
    border: "none",
    outline: "none",
    padding: "18px 16px",
    fontSize: 15,
    lineHeight: 1.65,
    fontFamily: "inherit",
    resize: "vertical",
  },
  topbar: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 20px",
    background: "rgba(20,19,26,0.92)",
    backdropFilter: "blur(8px)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  cols: { display: "flex", gap: 24, padding: "18px 20px 80px", alignItems: "flex-start" },
  side: { width: 340, flex: "none", position: "sticky", top: 64, maxHeight: "calc(100vh - 80px)", overflowY: "auto", paddingRight: 6 },
  fieldLabel: { fontSize: 11.5, color: "#8e8b9c", marginBottom: 5 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "#1e1d26",
    color: "#e8e6f0",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    padding: "7px 9px",
    fontSize: 13.5,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    background: "#1e1d26",
    color: "#e8e6f0",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    padding: "7px 9px",
    fontSize: 13.5,
    fontFamily: "inherit",
    lineHeight: 1.5,
    resize: "vertical",
  },
  primaryBtn: {
    background: "#C44058",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "9px 14px",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  ghostBtn: {
    background: "transparent",
    color: "#cfccdb",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 7,
    padding: "7px 12px",
    fontSize: 12.5,
    cursor: "pointer",
  },
  chipBtn: {
    background: "#1e1d26",
    color: "#cfccdb",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11.5,
    cursor: "pointer",
  },
  iconBtn: {
    background: "transparent",
    color: "#8e8b9c",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 6,
    width: 26,
    height: 26,
    cursor: "pointer",
    lineHeight: 1,
  },
};
