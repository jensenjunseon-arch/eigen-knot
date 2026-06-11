import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import JSZip from "jszip";
import type { CardRole, Deck, DeckContent } from "@/types";
import { CARD_ORDER, ALL_ROLES, PLATFORMS, activeSpecs, deckSize } from "@/types";
import { RenderCard } from "@/cards/cards";
import { zipName, kebab, cardFilename, resolvedZipName } from "@/lib/filename";
import { FONT_CHOICES, DEFAULT_FONT_ID } from "@/design/fonts";
import { SAMPLE_DECK } from "@/sample";
import { cardOverflow } from "./shared";
import { apiFetch, checkPassword, getPw, savePw, imageToBg, downloadBlob } from "./api";

/* ════════════════════════════════════════════════════════════════════════
   eigen knot — card studio
   인트로(글 입력 → AI가 제목·구성·장수까지 결정) → 스튜디오(상세 조정).
   덱은 브라우저(localStorage)에 자동 저장된다.
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

// 모던 강조색 팔레트 (다크 사진 위에서 또렷한 톤).
const ACCENT_PRESETS = [
  { label: "로즈", value: "#FB7185" },
  { label: "바이올렛", value: "#A78BFA" },
  { label: "스카이", value: "#38BDF8" },
  { label: "에메랄드", value: "#34D399" },
  { label: "앰버", value: "#FBBF24" },
  { label: "와인 (클래식)", value: "#C44058" },
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
          borderRadius: 14,
          outline: selected ? "2px solid #4E86FF" : "1px solid rgba(0,0,0,0.09)",
          boxShadow: selected ? "0 0 0 4px rgba(78,134,255,0.2), 0 8px 24px -8px rgba(66,133,244,0.25)" : "0 4px 16px -4px rgba(0,0,0,0.12)",
          transition: "outline .12s ease, box-shadow .12s ease",
        }}
      >
        <div ref={ref} style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <RenderCard deck={deck} spec={spec} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11.5, color: "#5F6368" }}>
        <span>
          {String(index + 1).padStart(2, "0")} {ROLE_LABELS[spec.role]} · dim {dim.toFixed(2)}
        </span>
        {overflow && <span style={{ color: "#C5221F" }}>⚠ 넘침</span>}
      </div>
    </div>
  );
}

/* ── 인트로: 글만 던지면 AI가 전부 결정 ─────────────────────────────────── */
function Intro({
  hasSaved,
  onContinue,
  onAI,
  onSample,
  busy,
  notice,
}: {
  hasSaved: boolean;
  onContinue: () => void;
  onAI: (article: string) => void;
  onSample: () => void;
  busy: boolean;
  notice: string | null;
}) {
  const [article, setArticle] = useState("");
  const ready = article.trim().length > 0 && !busy;
  return (
    <div style={ui.introRoot}>
      <div style={ui.introCol}>
        <div style={ui.gradientTitle}>무엇을 카드뉴스로 만들까요?</div>
        <div style={{ color: "#5F6368", fontSize: 15, textAlign: "center", margin: "12px 0 30px" }}>
          글을 붙여넣으면 AI가 제목, 카드 구성, 장수까지 알아서 정합니다.
        </div>

        <div style={ui.introBox}>
          <textarea
            style={ui.introTextarea}
            placeholder="뉴스레터 본문이나 쓰고 싶은 글을 여기에 붙여넣으세요…"
            value={article}
            onChange={(e) => setArticle(e.target.value)}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px 12px" }}>
            <span style={{ fontSize: 12, color: "#80868B" }}>
              {busy ? "AI가 글을 읽고 카드 구성을 설계하는 중…" : "붙여넣은 뒤 → 버튼"}
            </span>
            <button
              title="AI로 카드 만들기"
              disabled={!ready}
              onClick={() => onAI(article)}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "none",
                cursor: ready ? "pointer" : "default",
                background: ready ? "linear-gradient(135deg,#4E86FF,#9B72F8)" : "#D8E3F0",
                color: ready ? "#fff" : "#80868B",
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background .15s ease",
              }}
            >
              {busy ? "…" : "↑"}
            </button>
          </div>
        </div>

        {notice && (
          <div style={{ color: notice.startsWith("✗") ? "#C5221F" : "#1E8E3E", fontSize: 13, textAlign: "center", marginTop: 14 }}>
            {notice}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 26, flexWrap: "wrap" }}>
          {hasSaved && (
            <button style={ui.chipLg} onClick={onContinue}>
              ↩ 이어서 편집
            </button>
          )}
          <button style={ui.chipLg} onClick={onSample}>
            샘플로 둘러보기
          </button>
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
  const [prog, setProg] = useState("");
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

  /* AI — 인트로: 새 호 생성(제목·구성 자동) / 스튜디오: 내용 재작성 */
  const runAI = async (text: string, fresh: boolean) => {
    if (!text.trim()) return;
    setBusy("ai");
    setNotice(null);
    const issue = fresh ? (deck?.meta.issue ?? 0) + 1 || 1 : (deck?.meta.issue ?? 1);
    const meta = {
      issue,
      slug: fresh || !deck?.meta.slug ? `knot-${String(issue).padStart(3, "0")}` : deck.meta.slug,
      title: fresh ? "" : (deck?.meta.title ?? ""),
    };
    try {
      const j = await apiFetch<{ title: string; cards: CardRole[]; content: DeckContent }>("/api/analyze", {
        body: text,
        meta,
      });
      const content: DeckContent = {
        ...j.content,
        cover: { ...j.content.cover, kicker: `Weekly Insight: ${meta.issue} knot` },
      };
      setDeck((d) => ({
        ...(d ?? SAMPLE_DECK),
        meta: { ...meta, title: j.title || meta.title },
        content,
        cards: j.cards,
        bg: d?.bg ?? SAMPLE_DECK.bg,
      }));
      setSel(0);
      setPhase("studio");
      setNotice(`✓ ${j.cards.length}장 구성 완료 — 카드를 눌러 다듬어 주세요.`);
    } catch (e) {
      setNotice(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  /* PNG 내보내기 — 카드 1장씩 캡처 후 브라우저에서 ZIP 조립 */
  const runExport = async () => {
    if (!deck) return;
    setBusy("export");
    setNotice(null);
    try {
      const n = specs.length;
      const zip = new JSZip();
      let anyOverflow = false;
      for (let i = 0; i < n; i++) {
        setProg(`${i + 1}/${n}`);
        const card = await apiFetch<{ name: string; b64: string; overflow: boolean }>("/api/capture-card", {
          deck,
          index: i,
        });
        zip.file(card.name, card.b64, { base64: true });
        if (card.overflow) anyOverflow = true;
      }
      setProg("zip…");
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, resolvedZipName(deck));
      setNotice(anyOverflow ? "⚠ 일부 카드가 넘쳤습니다 — ⚠ 표시 카드를 다듬어 주세요." : `✓ PNG ${n}장 다운로드 완료`);
    } catch (e) {
      setNotice(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      setProg("");
    }
  };

  const onUpload = (file: File) => {
    imageToBg(file)
      .then((bg) => patch({ bg }))
      .catch((e) => setNotice(`✗ ${e instanceof Error ? e.message : String(e)}`));
  };

  if (!checked) return null;
  if (!unlocked) return <LoginGate onUnlock={() => setUnlocked(true)} />;

  if (phase === "intro") {
    return (
      <Intro
        hasSaved={!!deck}
        onContinue={() => setPhase("studio")}
        onAI={(text) => void runAI(text, true)}
        onSample={() => {
          setDeck((d) => d ?? SAMPLE_DECK);
          setPhase("studio");
        }}
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

  return (
    <div style={ui.root}>
      <header style={ui.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button style={ui.iconPill} onClick={() => setPhase("intro")} title="처음 화면으로">
            ←
          </button>
          <span style={{ ...ui.gradientText, fontSize: 16, fontWeight: 600 }}>eigen knot</span>
          <span style={{ color: "#80868B", fontSize: 12.5 }}>card studio</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {notice && <span style={{ fontSize: 12.5, color: notice.startsWith("✗") ? "#C5221F" : "#1E8E3E" }}>{notice}</span>}
          <button style={{ ...ui.primaryPill, opacity: busy ? 0.6 : 1 }} disabled={busy !== null} onClick={runExport}>
            {busy === "export" ? `내보내는 중 ${prog}` : `PNG ${specs.length}장 내보내기`}
          </button>
        </div>
      </header>

      <div style={ui.cols}>
        {/* ── 좌측 패널 ── */}
        <aside style={ui.side}>
          <Panel title={`카드 편집 — ${String(selIdx + 1).padStart(2, "0")} ${ROLE_LABELS[spec.role]}`} defaultOpen>
            <Row label={`이 카드 dim · ${selDim.toFixed(2)}`}>
              <input
                type="range"
                min={0.4}
                max={0.94}
                step={0.01}
                value={selDim}
                style={ui.range}
                onChange={(e) => patch({ dims: { ...deck.dims, [spec.role]: Number(e.target.value) } })}
              />
            </Row>
            {spec.role === "closing" ? (
              <div style={{ fontSize: 12.5, color: "#9AA0A6", lineHeight: 1.6 }}>
                끝맺음 카드는 고정 문구입니다 (워터마크 문구는 ‘디자인’에서 변경).
              </div>
            ) : (
              <FieldEditor value={deck.content[spec.role as keyof DeckContent]} path={[spec.role]} onSet={setContent} />
            )}
            {(() => {
              const custom = deck.meta.customCardNames?.[spec.role] ?? "";
              const autoName = cardFilename(selIdx + 1, deck.meta.slug, deck.meta.issue, spec.cardname);
              const converted = kebab(custom.trim());
              return (
                <Row label="이미지 파일명 (비우면 자동생성)">
                  <input
                    style={ui.input}
                    placeholder={autoName.replace(".png", "")}
                    value={custom}
                    onChange={(e) =>
                      patch({ meta: { ...deck.meta, customCardNames: { ...deck.meta.customCardNames, [spec.role]: e.target.value } } })
                    }
                  />
                  {custom.trim() && converted !== custom.trim() && (
                    <div style={{ fontSize: 11, color: "#C5221F", marginTop: 4 }}>변환됨 → <b>{converted || "(유효하지 않은 이름)"}</b></div>
                  )}
                  <div style={{ fontSize: 11, color: "#80868B", marginTop: 3, fontFamily: "monospace", wordBreak: "break-all" }}>
                    {custom.trim() ? `${converted || "card"}.png` : autoName}
                  </div>
                </Row>
              );
            })()}
          </Panel>

          <Panel title="디자인" defaultOpen>
            <Row label="폰트">
              <select style={ui.input} value={deck.font ?? DEFAULT_FONT_ID} onChange={(e) => patch({ font: e.target.value })}>
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
                style={ui.range}
                onChange={(e) => patch({ typeScale: Number(e.target.value) })}
              />
            </Row>
            <Row label="강조색">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {ACCENT_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    title={p.label}
                    onClick={() => patch({ accent: p.value })}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: p.value,
                      border: "none",
                      outline: accent.toLowerCase() === p.value.toLowerCase() ? "2px solid #fff" : "2px solid transparent",
                      outlineOffset: 2,
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
              <input
                style={ui.input}
                value={deck.accent ?? "#C44058"}
                placeholder="#FB7185 또는 rgb(251,113,133)"
                onChange={(e) => patch({ accent: e.target.value })}
              />
            </Row>
            <Row label="브랜드색 (끝맺음 카드)">
              <input style={ui.input} value={deck.accent2 ?? "#D6D55A"} onChange={(e) => patch({ accent2: e.target.value })} />
            </Row>
            <Row label="워터마크 문구 (비우면 숨김)">
              <input style={ui.input} value={deck.watermark ?? "eigen knot"} onChange={(e) => patch({ watermark: e.target.value })} />
            </Row>
            <Row label="플랫폼 사이즈">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PLATFORMS.map((p) => {
                  const active = w === p.w && h === p.h;
                  return (
                    <button
                      key={p.id}
                      style={{
                        ...ui.chip,
                        ...(active ? { background: "#4E86FF", color: "#fff", borderColor: "transparent" } : {}),
                      }}
                      onClick={() => patch({ size: { w: p.w, h: p.h } })}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: "#80868B", marginTop: 6 }}>
                현재 {w}×{h}px — 사이즈를 바꾸면 ⚠ 넘침 표시를 확인하세요.
              </div>
            </Row>
          </Panel>

          <Panel title="배경 사진">
            <label style={{ ...ui.primaryPill, display: "block", textAlign: "center" }}>
              이미지 업로드 (jpg/png)
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
            </label>
            <Row label="초점 (focal)">
              <input style={ui.input} value={deck.focal ?? "center"} onChange={(e) => patch({ focal: e.target.value })} />
            </Row>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["center", "center 25%", "center 35%", "center 50%"].map((f) => (
                <button key={f} style={ui.chip} onClick={() => patch({ focal: f })}>
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
                style={ui.range}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  patch({ dims: { ...deck.dims, ...Object.fromEntries(BODY_ROLES.map((r) => [r, v])) } });
                }}
              />
            </Row>
          </Panel>

          <Panel title={`카드 구성 · ${specs.length}장`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {CARD_ORDER.map((s) => {
                const current = deck.cards?.length ? deck.cards : ALL_ROLES;
                const on = current.includes(s.role);
                return (
                  <label
                    key={s.role}
                    style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer", color: on ? "#1A1C22" : "#80868B" }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const next = on ? current.filter((r) => r !== s.role) : ALL_ROLES.filter((r) => current.includes(r) || r === s.role);
                        if (next.length === 0) return;
                        patch({ cards: next });
                        setSel(0);
                      }}
                    />
                    {ROLE_LABELS[s.role]}
                  </label>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#80868B" }}>해제한 카드는 내보내기에서 빠지고, 파일 번호는 자동으로 당겨집니다.</div>
          </Panel>

          <Panel title="호 정보">
            <Row label="호 번호">
              <input
                style={ui.input}
                type="number"
                value={deck.meta.issue}
                onChange={(e) => patch({ meta: { ...deck.meta, issue: Number(e.target.value) || 0 } })}
              />
            </Row>
            <Row label="슬러그 (영문 kebab — 파일명용)">
              <input style={ui.input} value={deck.meta.slug} onChange={(e) => patch({ meta: { ...deck.meta, slug: e.target.value } })} />
              {(() => {
                const converted = kebab(deck.meta.slug);
                const raw = deck.meta.slug.trim();
                if (!raw) return <div style={{ fontSize: 11, color: "#C5221F", marginTop: 4 }}>슬러그를 입력하면 파일명이 생성됩니다.</div>;
                if (converted !== raw) return <div style={{ fontSize: 11, color: "#C5221F", marginTop: 4 }}>변환됨 → <b>{converted || "(빈 슬러그)"}</b></div>;
                return null;
              })()}
            </Row>
            {(() => {
              const customZip = deck.meta.customZipName ?? "";
              const converted = kebab(customZip.trim());
              const autoZip = zipName(deck.meta.slug, deck.meta.issue);
              return (
                <Row label="ZIP 파일명 (비우면 자동생성)">
                  <input
                    style={ui.input}
                    placeholder={autoZip.replace(".zip", "")}
                    value={customZip}
                    onChange={(e) => patch({ meta: { ...deck.meta, customZipName: e.target.value } })}
                  />
                  {customZip.trim() && converted !== customZip.trim() && (
                    <div style={{ fontSize: 11, color: "#C5221F", marginTop: 4 }}>변환됨 → <b>{converted || "(유효하지 않은 이름)"}</b></div>
                  )}
                  <div style={{ fontSize: 11, color: "#80868B", marginTop: 3, wordBreak: "break-all", fontFamily: "monospace" }}>
                    {resolvedZipName(deck)}
                  </div>
                </Row>
              );
            })()}
            <Row label="제목">
              <input style={ui.input} value={deck.meta.title} onChange={(e) => patch({ meta: { ...deck.meta, title: e.target.value } })} />
            </Row>
          </Panel>

          <Panel title="글 → AI 다시 구성">
            <textarea
              style={{ ...ui.textarea, minHeight: 90 }}
              placeholder="본문을 붙여넣고 누르면 카드 내용과 구성을 새로 만듭니다 (현재 편집 내용은 덮어씌워짐)."
              value={article}
              onChange={(e) => setArticle(e.target.value)}
            />
            <button
              style={{ ...ui.primaryPill, width: "100%", opacity: busy || !article.trim() ? 0.55 : 1 }}
              disabled={busy !== null || !article.trim()}
              onClick={() => void runAI(article, false)}
            >
              {busy === "ai" ? "분석 중…" : "AI로 다시 구성"}
            </button>
          </Panel>
        </aside>

        {/* ── 카드 그리드 ── */}
        <main style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))", gap: 22 }}>
            {specs.map((s, i) => (
              <Thumb key={s.role} deck={deck} index={i} selected={i === selIdx} onSelect={() => setSel(i)} width={248} />
            ))}
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
        <div style={{ ...ui.gradientText, fontSize: 24, fontWeight: 600 }}>eigen knot</div>
        <div style={{ color: "#5F6368", fontSize: 13, margin: "8px 0 22px" }}>비밀번호를 입력하세요</div>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setLocal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ ...ui.input, marginBottom: 12 }}
          placeholder="비밀번호"
        />
        {err && <div style={{ color: "#F28B82", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
        <button style={{ ...ui.primaryPill, width: "100%", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
          {busy ? "확인 중…" : "들어가기"}
        </button>
      </div>
    </div>
  );
}

/* ── 패널/행 ────────────────────────────────────────────────────────────── */
function Panel({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={ui.panel}>
      <button onClick={() => setOpen((o) => !o)} style={ui.panelHead}>
        <span>{title}</span>
        <span style={{ color: "#80868B", fontSize: 11 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 11, padding: "2px 14px 14px" }}>{children}</div>}
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

/* ── Gemini 라이트 UI 토큰 ───────────────────────────────────────────────
   Gemini 배경: 상단에서 파란 글로우가 퍼져 내려오는 화이트-블루 그라데이션.
   서피스는 반투명 흰색 유리 패널(glassmorphism). 텍스트는 Google 다크톤.
   ─────────────────────────────────────────────────────────────────────── */
const GRADIENT = "linear-gradient(90deg,#4E86FF 0%,#9B72F8 55%,#F66B97 100%)";
// 상단 중앙에서 파란 빛이 퍼져 아래로 흰색으로 빠지는 Gemini 특유의 배경.
const PAGE_BG =
  "radial-gradient(ellipse 90% 60% at 50% 0%, #C0DAFF 0%, #D8ECFF 28%, #EBF5FF 55%, #F4FAFF 100%)";

const ui: Record<string, CSSProperties> = {
  root: { minHeight: "100vh", background: PAGE_BG, color: "#1A1C22", fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif" },
  gradientText: { backgroundImage: GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" },
  gradientTitle: {
    backgroundImage: GRADIENT,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    fontSize: 32,
    fontWeight: 700,
    textAlign: "center",
    letterSpacing: "-0.01em",
  },
  gate: { position: "fixed", inset: 0, background: PAGE_BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" },
  gateCard: { width: 330, padding: 30, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 22, boxShadow: "0 4px 28px rgba(66,133,244,0.1)" },
  introRoot: { minHeight: "100vh", background: PAGE_BG, color: "#1A1C22", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif", padding: 24 },
  introCol: { width: "min(760px, 94vw)" },
  introBox: {
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 26,
    overflow: "hidden",
    backdropFilter: "blur(18px)",
    boxShadow: "0 8px 40px rgba(66,133,244,0.12), 0 2px 8px rgba(0,0,0,0.04)",
  },
  introTextarea: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 190,
    background: "transparent",
    color: "#1A1C22",
    border: "none",
    outline: "none",
    padding: "20px 18px 10px",
    fontSize: 15.5,
    lineHeight: 1.7,
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
    padding: "12px 22px",
    background: "rgba(224,240,255,0.82)",
    backdropFilter: "blur(14px)",
    borderBottom: "1px solid rgba(0,0,0,0.07)",
  },
  cols: { display: "flex", gap: 26, padding: "20px 22px 90px", alignItems: "flex-start" },
  side: { width: 350, flex: "none", position: "sticky", top: 66, maxHeight: "calc(100vh - 84px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 4 },
  // flexShrink:0 필수 — 없으면 maxHeight+overflow:auto flex column에서 패널이
  // 스크롤 대신 찌그러져 아래 내용이 잘린다.
  panel: { background: "rgba(255,255,255,0.82)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 18, overflow: "hidden", flexShrink: 0, backdropFilter: "blur(10px)" },
  panelHead: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "transparent",
    border: "none",
    padding: "13px 14px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: "#2D3142",
    textAlign: "left",
  },
  fieldLabel: { fontSize: 11.5, color: "#5F6368", marginBottom: 5 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "#EDF2FA",
    color: "#1A1C22",
    border: "1px solid rgba(0,0,0,0.09)",
    borderRadius: 12,
    padding: "8px 11px",
    fontSize: 13.5,
    outline: "none",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    background: "#EDF2FA",
    color: "#1A1C22",
    border: "1px solid rgba(0,0,0,0.09)",
    borderRadius: 12,
    padding: "8px 11px",
    fontSize: 13.5,
    fontFamily: "inherit",
    lineHeight: 1.55,
    resize: "vertical",
    outline: "none",
  },
  range: { width: "100%", accentColor: "#4E86FF" },
  primaryPill: {
    background: GRADIENT,
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "9px 18px",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  ghostBtn: {
    background: "#EDF2FA",
    color: "#2D3142",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 999,
    padding: "7px 13px",
    fontSize: 12.5,
    cursor: "pointer",
  },
  chip: {
    background: "#EDF2FA",
    color: "#2D3142",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 999,
    padding: "5px 12px",
    fontSize: 11.5,
    cursor: "pointer",
  },
  chipLg: {
    background: "rgba(255,255,255,0.78)",
    color: "#2D3142",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 999,
    padding: "10px 18px",
    fontSize: 13.5,
    cursor: "pointer",
  },
  iconPill: {
    background: "rgba(255,255,255,0.78)",
    color: "#2D3142",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 999,
    width: 34,
    height: 34,
    cursor: "pointer",
    fontSize: 15,
  },
  iconBtn: {
    background: "transparent",
    color: "#5F6368",
    border: "1px solid rgba(0,0,0,0.14)",
    borderRadius: 8,
    width: 26,
    height: 26,
    cursor: "pointer",
    lineHeight: 1,
  },
};
