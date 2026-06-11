import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import JSZip from "jszip";
import type { CardRole, Deck, DeckContent } from "@/types";
import { CARD_ORDER, ALL_ROLES, PLATFORMS, activeSpecs, deckSize, defaultClosing } from "@/types";
import { RenderCard } from "@/cards/cards";
import { resolvedZipName, resolvedCardFilename } from "@/lib/filename";
import { FONT_CHOICES, DEFAULT_FONT_ID, defaultFontFor } from "@/design/fonts";
import { SAMPLE_DECK } from "@/sample";
import { cardOverflow } from "./shared";
import { apiFetch, checkPassword, getPw, savePw, imageToBg, downloadBlob } from "./api";
import { I18nProvider, LangSwitch, useI18n } from "./i18n";

/* ════════════════════════════════════════════════════════════════════════
   eigen knot — card studio
   인트로(글 입력 → AI가 제목·구성·장수까지 결정) → 스튜디오(상세 조정).
   덱은 브라우저(localStorage)에 자동 저장된다.
   ════════════════════════════════════════════════════════════════════════ */

const STORE_KEY = "ek-studio-v1";
const BODY_ROLES: CardRole[] = ["summary", "definition", "compare", "diagnosis", "analysis", "grid", "claim", "conclusion"];

// Modern accent palette (tones that stay crisp on dark photos). Labels live in i18n.
const ACCENT_PRESETS = [
  { id: "rose", value: "#FB7185" },
  { id: "violet", value: "#A78BFA" },
  { id: "sky", value: "#38BDF8" },
  { id: "emerald", value: "#34D399" },
  { id: "amber", value: "#FBBF24" },
  { id: "wine", value: "#C44058" },
];

type Path = (string | number)[];

// 알림 색: ✗ 빨강 · ⚠ 주황 · ✓ 초록.
function noticeColor(notice: string): string {
  if (notice.startsWith("✗")) return "#C5221F";
  if (notice.startsWith("⚠")) return "#E37400";
  return "#1E8E3E";
}

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
  const { t, d } = useI18n();
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
            <button title={t("removeItem")} style={ui.iconBtn} onClick={() => onSet(path, value.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        <button style={ui.ghostBtn} onClick={() => onSet(path, [...value, isTupleRows ? ["", ""] : ""])}>
          {t("addItem")}
        </button>
      </div>
    );
  }
  if (typeof value === "object" && value !== null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <div style={ui.fieldLabel}>{d.fields[k] ?? k}</div>
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
  onZoom,
  width,
}: {
  deck: Deck;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onZoom?: () => void;
  width: number;
}) {
  const { t, d } = useI18n();
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
    <div style={{ cursor: "pointer" }} onClick={onSelect} onDoubleClick={onZoom}>
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
          {String(index + 1).padStart(2, "0")} {d.roles[spec.role]} · dim {dim.toFixed(2)}
        </span>
        {overflow && <span style={{ color: "#C5221F" }}>{t("overflowBadge")}</span>}
      </div>
    </div>
  );
}

/* ── 모바일 감지 ────────────────────────────────────────────────────────── */
function useIsMobile(): boolean {
  const [m, setM] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const fn = (e: MediaQueryListEvent) => setM(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return m;
}

/* ── 모바일 캐러셀: 인스타그램과 같은 좌우 스와이프 + 스냅 ─────────────────
   확대 없이 현재 크기로 한 장씩 넘겨 보고, 멈춘 카드가 곧 선택된 카드가
   되어 아래 편집 패널과 동기화된다. ─────────────────────────────────────── */
function CarouselView({ deck, selIdx, onSel }: { deck: Deck; selIdx: number; onSel: (i: number) => void }) {
  const specs = activeSpecs(deck);
  const ref = useRef<HTMLDivElement>(null);
  const gap = 14;
  // 퍼센트 패딩·부모 폭은 스크롤 콘텐츠와 순환 참조라 화면 폭 기준으로만 계산한다.
  // pad = (화면 − 카드)/2 → 첫/끝 카드도 중앙 스냅.
  const measure = () => {
    const w = window.innerWidth - 44; // .ek-cols 좌우 패딩 22px씩
    const cw = Math.min(320, w - 56);
    return { cardW: cw, pad: Math.max(12, Math.round((w - cw) / 2)) };
  };
  const [{ cardW, pad }, setDims] = useState({ cardW: Math.min(320, window.innerWidth - 100), pad: 28 });
  useEffect(() => {
    const fit = () => setDims(measure());
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 스와이프가 멈춘 위치의 카드를 선택으로 반영.
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.max(0, Math.min(specs.length - 1, Math.round(el.scrollLeft / (cardW + gap))));
    if (i !== selIdx) onSel(i);
  };
  return (
    <div
      ref={ref}
      onScroll={onScroll}
      style={{
        display: "flex",
        gap,
        overflowX: "auto",
        scrollSnapType: "x mandatory",
        padding: `4px ${pad}px 10px`,
        WebkitOverflowScrolling: "touch",
      }}
    >
      {specs.map((s, i) => (
        <div key={s.role} style={{ flex: "none", scrollSnapAlign: "center" }}>
          <Thumb deck={deck} index={i} selected={i === selIdx} onSelect={() => onSel(i)} width={cardW} />
        </div>
      ))}
    </div>
  );
}

/* ── 갤러리 뷰 (Finder 스타일): 큰 미리보기 + 아래 필름스트립 ──────────────
   더블클릭으로 진입, Esc/✕로 복귀, ←/→로 카드 이동. 사이드바 편집 패널은
   그대로 살아 있어서 "크게 보면서 다듬는" 루프가 된다. ─────────────────── */
function GalleryView({
  deck,
  selIdx,
  onSel,
  onClose,
}: {
  deck: Deck;
  selIdx: number;
  onSel: (i: number) => void;
  onClose: () => void;
}) {
  const { t, d } = useI18n();
  const specs = activeSpecs(deck);
  const spec = specs[selIdx];
  const { w, h } = deckSize(deck);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  // 큰 카드 스케일: 가용 폭과 (뷰포트 − 필름스트립/헤더) 높이에 맞춘다.
  useEffect(() => {
    const fit = () => {
      const availW = wrapRef.current?.offsetWidth ?? 600;
      const availH = Math.max(320, window.innerHeight - 330);
      setScale(Math.min(availW / w, availH / h));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [w, h]);

  // 키보드: ←/→ 이동, Esc 닫기.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onSel(Math.max(0, selIdx - 1));
      if (e.key === "ArrowRight") onSel(Math.min(specs.length - 1, selIdx + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selIdx, specs.length, onClose, onSel]);

  // 선택 카드가 필름스트립 밖이면 보이게 스크롤.
  useEffect(() => {
    stripRef.current?.children[selIdx]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selIdx]);

  return (
    <div ref={wrapRef}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: "#5F6368" }}>
          {String(selIdx + 1).padStart(2, "0")} {d.roles[spec.role]} · {selIdx + 1}/{specs.length}
          <span style={{ marginLeft: 12, color: "#9AA0A6", fontSize: 11.5 }}>{t("galleryHint")}</span>
        </span>
        <button style={ui.chip} onClick={onClose}>
          {t("galleryClose")}
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "center" }} onDoubleClick={onClose}>
        <div
          style={{
            width: Math.round(w * scale),
            height: Math.round(h * scale),
            overflow: "hidden",
            borderRadius: 18,
            boxShadow: "0 18px 60px -18px rgba(20,40,80,0.45)",
          }}
        >
          <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <RenderCard deck={deck} spec={spec} />
          </div>
        </div>
      </div>

      <div
        ref={stripRef}
        style={{ display: "flex", gap: 14, overflowX: "auto", marginTop: 16, paddingBottom: 10 }}
      >
        {specs.map((s, i) => (
          <div key={s.role} style={{ flex: "none" }}>
            <Thumb deck={deck} index={i} selected={i === selIdx} onSelect={() => onSel(i)} onZoom={onClose} width={110} />
          </div>
        ))}
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
  const { t } = useI18n();
  const [article, setArticle] = useState("");
  const ready = article.trim().length > 0 && !busy;
  return (
    <div style={ui.introRoot}>
      <LangSwitch style={{ position: "fixed", top: 14, right: 14, zIndex: 20 }} />
      <div style={ui.introCol}>
        <div className="ek-intro-title" style={ui.gradientTitle}>{t("introTitle")}</div>
        <div style={{ color: "#5F6368", fontSize: 15, textAlign: "center", margin: "12px 0 30px", lineHeight: 1.7, whiteSpace: "pre-line" }}>
          {t("introSub")}
        </div>

        <div style={ui.introBox}>
          <textarea
            style={ui.introTextarea}
            placeholder={t("introPlaceholder")}
            value={article}
            onChange={(e) => setArticle(e.target.value)}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px 12px" }}>
            <span style={{ fontSize: 12, color: "#80868B" }}>
              {busy ? t("introBusy") : ""}
            </span>
            <button
              title={t("aiMakeCards")}
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
          <div style={{ color: noticeColor(notice), fontSize: 13, textAlign: "center", marginTop: 14 }}>
            {notice}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 26, flexWrap: "wrap" }}>
          {hasSaved && (
            <button style={ui.chipLg} onClick={onContinue}>
              {t("continueEditing")}
            </button>
          )}
          <button style={ui.chipLg} onClick={onSample}>
            {t("exploreSample")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 메인 스튜디오 ──────────────────────────────────────────────────────── */
export function Studio() {
  return (
    <I18nProvider>
      <StudioInner />
    </I18nProvider>
  );
}

function StudioInner() {
  const { t, d } = useI18n();
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
  const [shareFiles, setShareFiles] = useState<File[] | null>(null);
  const [gallery, setGallery] = useState(false);
  const isMobile = useIsMobile();
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
    setDeck((d) => {
      if (!d) return d;
      // closing은 lazy — 첫 편집 때 기본 문구를 먼저 채워 넣어야 한 칸만 남는 사고가 없다.
      const content = path[0] === "closing" && !d.content.closing
        ? { ...d.content, closing: defaultClosing(d.meta.issue, d.lang) }
        : d.content;
      return { ...d, content: setAtPath(content, path, v) };
    });
  const patch = (p: Partial<Deck>) => setDeck((d) => (d ? { ...d, ...p } : d));

  /* AI — 인트로: 새 호 생성(제목·구성 자동) / 스튜디오: 내용 재작성 */
  const runAI = async (text: string, fresh: boolean) => {
    if (!text.trim()) return;
    setBusy("ai");
    setNotice(null);
    // 비워둔 호 번호는 비운 채로 둔다 (파일명·끝맺음 문구에서 자동 생략).
    const issue = fresh ? (deck?.meta.issue ?? 0) + 1 || 1 : deck?.meta.issue;
    const meta = {
      issue,
      slug: fresh || !deck?.meta.slug ? `knot-${String(issue ?? 1).padStart(3, "0")}` : deck.meta.slug,
      title: fresh ? "" : (deck?.meta.title ?? ""),
    };
    try {
      const j = await apiFetch<{ title: string; cards: CardRole[]; content: DeckContent; lang?: string }>("/api/analyze", {
        body: text,
        meta,
      });
      // 모델이 쓴 킥커를 살린다 — 비어 있을 때만 기본 문구로 채움.
      const content: DeckContent = {
        ...j.content,
        cover: { ...j.content.cover, kicker: j.content.cover.kicker?.trim() || (meta.issue ? `Weekly Insight: ${meta.issue} knot` : "Weekly Insight") },
      };
      setDeck((d) => {
        const lang = j.lang ?? d?.lang;
        // 카드 언어가 바뀌면 그 언어에 맞는 폰트로 시드 (사용자는 '디자인'에서 변경 가능).
        const langChanged = lang !== (d?.lang ?? "ko");
        return {
          ...(d ?? SAMPLE_DECK),
          meta: { ...meta, title: j.title || meta.title },
          content,
          cards: j.cards,
          lang,
          font: langChanged ? defaultFontFor(lang) : (d?.font ?? defaultFontFor(lang)),
          bg: d?.bg ?? SAMPLE_DECK.bg,
        };
      });
      setSel(0);
      setPhase("studio");
      setNotice(t("composed", { n: j.cards.length }));
    } catch (e) {
      setNotice(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  /* PNG 내보내기 — 카드 1장씩 캡처 후 브라우저에서 ZIP 조립.
     모바일(Web Share 지원)에서는 PNG들을 공유 시트로도 넘길 수 있게 보관 →
     "사진첩에 저장" 버튼 (iOS 공유 시트의 '이미지 저장'이 사진 앱으로 들어간다). */
  const runExport = async () => {
    if (!deck) return;
    setBusy("export");
    setNotice(null);
    setShareFiles(null);
    try {
      const n = specs.length;
      const zip = new JSZip();
      const files: File[] = [];
      let anyOverflow = false;
      for (let i = 0; i < n; i++) {
        setProg(`${i + 1}/${n}`);
        // 일시적 네트워크/콜드스타트 오류로 10장짜리 내보내기가 통째로 죽지 않게
        // 카드마다 1번 재시도.
        let card: { name: string; b64: string; overflow: boolean };
        try {
          card = await apiFetch("/api/capture-card", { deck, index: i });
        } catch {
          setProg(t("retrying", { p: `${i + 1}/${n}` }));
          card = await apiFetch("/api/capture-card", { deck, index: i });
        }
        zip.file(card.name, card.b64, { base64: true });
        const bytes = Uint8Array.from(atob(card.b64), (ch) => ch.charCodeAt(0));
        files.push(new File([bytes], card.name, { type: "image/png" }));
        if (card.overflow) anyOverflow = true;
      }
      setProg("zip…");
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, resolvedZipName(deck));
      const canShare =
        typeof navigator.canShare === "function" && navigator.canShare({ files });
      if (canShare) setShareFiles(files);
      setNotice(
        anyOverflow
          ? t("someOverflow")
          : t("downloadDone", { n }) + (canShare ? t("shareHintSuffix") : ""),
      );
    } catch (e) {
      setNotice(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      setProg("");
    }
  };

  /* 사진첩 저장 — 공유 시트는 사용자 탭에서만 열 수 있어 별도 버튼으로 제공 */
  const runShare = async () => {
    if (!shareFiles) return;
    try {
      await navigator.share({ files: shareFiles });
    } catch (e) {
      // 사용자가 시트를 닫은 경우(AbortError)는 조용히 무시.
      if (e instanceof Error && e.name !== "AbortError") setNotice(t("shareFailed", { msg: e.message }));
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
      <header className="ek-topbar" style={ui.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={ui.iconPill} onClick={() => setPhase("intro")} title={t("backToStart")}>
            ←
          </button>
          <span style={{ ...ui.gradientText, fontSize: 16, fontWeight: 600 }}>eigen knot</span>
          <span className="ek-topbar-sub" style={{ color: "#80868B", fontSize: 12.5 }}>card studio</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <LangSwitch />
          {shareFiles && busy === null && (
            <button style={ui.chip} onClick={() => void runShare()}>
              {t("saveToPhotos")}
            </button>
          )}
          <button className="ek-export-btn" style={{ ...ui.primaryPill, opacity: busy ? 0.6 : 1 }} disabled={busy !== null} onClick={runExport}>
            <span className="ek-export-full">{busy === "export" ? t("exporting", { p: prog }) : t("exportPngs", { n: specs.length })}</span>
            <span className="ek-export-short">{busy === "export" ? (prog || "…") : t("exportShort")}</span>
          </button>
        </div>
        {notice && <div className="ek-topbar-notice" style={{ color: noticeColor(notice) }}>{notice}</div>}
      </header>

      <div className="ek-cols" style={ui.cols}>
        {/* ── 좌측 패널 ── */}
        <aside className="ek-side" style={ui.side}>
          <Panel title={t("cardEdit", { nn: String(selIdx + 1).padStart(2, "0"), role: d.roles[spec.role] })} defaultOpen>
            <Row label={t("cardDim", { v: selDim.toFixed(2) })}>
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
              <>
                <FieldEditor value={deck.content.closing ?? defaultClosing(deck.meta.issue, deck.lang)} path={["closing"]} onSet={setContent} />
                <div style={{ fontSize: 11.5, color: "#9AA0A6", lineHeight: 1.6 }}>
                  {t("closingHint")}
                </div>
              </>
            ) : (
              <FieldEditor value={deck.content[spec.role as keyof DeckContent]} path={[spec.role]} onSet={setContent} />
            )}
          </Panel>

          <Panel title={t("design")} defaultOpen>
            <Row label={t("font")}>
              <select style={ui.input} value={deck.font ?? DEFAULT_FONT_ID} onChange={(e) => patch({ font: e.target.value })}>
                {FONT_CHOICES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {d.fontNames[f.id] ?? f.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label={t("typeSize", { v: Math.round((deck.typeScale ?? 1) * 100) })}>
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
            <Row label={t("accentColor")}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {ACCENT_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    className="ek-swatch"
                    title={d.accents[p.id] ?? p.id}
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
                placeholder={t("accentPlaceholder")}
                onChange={(e) => patch({ accent: e.target.value })}
              />
            </Row>
            <Row label={t("brandColor")}>
              <input style={ui.input} value={deck.accent2 ?? "#D6D55A"} onChange={(e) => patch({ accent2: e.target.value })} />
            </Row>
            <Row label={t("watermarkLabel")}>
              <input style={ui.input} value={deck.watermark ?? "eigen knot"} onChange={(e) => patch({ watermark: e.target.value })} />
            </Row>
            <Row label={t("platformSize")}>
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
                      {d.platforms[p.id] ?? p.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: "#80868B", marginTop: 6 }}>
                {t("sizeNote", { w, h })}
              </div>
            </Row>
          </Panel>

          <Panel title={t("bgPhoto")}>
            <label style={{ ...ui.primaryPill, display: "block", textAlign: "center" }}>
              {t("uploadImage")}
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
            </label>
            <Row label={t("focal")}>
              <input style={ui.input} value={deck.focal ?? "center"} onChange={(e) => patch({ focal: e.target.value })} />
            </Row>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["center", "center 25%", "center 35%", "center 50%"].map((f) => (
                <button key={f} style={ui.chip} onClick={() => patch({ focal: f })}>
                  {f}
                </button>
              ))}
            </div>
            <Row label={t("bodyDimAll", { v: bodyDim.toFixed(2) })}>
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

          <Panel title={t("composition", { n: specs.length })}>
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
                    {d.roles[s.role]}
                  </label>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#80868B" }}>{t("compositionNote")}</div>
          </Panel>

          <Panel title={t("filenames")}>
            <Row label={t("deckNameLabel")}>
              <input
                style={ui.input}
                placeholder={t("deckNamePlaceholder")}
                value={deck.meta.customZipName ?? ""}
                onChange={(e) => patch({ meta: { ...deck.meta, customZipName: e.target.value } })}
              />
            </Row>
            {(() => {
              const first = specs[0];
              const last = specs[specs.length - 1];
              return (
                <div style={{ fontSize: 11, color: "#80868B", fontFamily: "monospace", wordBreak: "break-all", display: "flex", flexDirection: "column", gap: 3 }}>
                  <div>ZIP&nbsp;&nbsp;{resolvedZipName(deck)}</div>
                  {first && <div>PNG&nbsp;&nbsp;{resolvedCardFilename(1, deck, first.role)}</div>}
                  {specs.length > 2 && <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;⋮</div>}
                  {last && specs.length > 1 && <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{resolvedCardFilename(specs.length, deck, last.role)}</div>}
                </div>
              );
            })()}
            <Row label={t("issueLabel")}>
              <input
                style={ui.input}
                type="number"
                value={deck.meta.issue ?? ""}
                min={1}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  patch({ meta: { ...deck.meta, issue: raw === "" ? undefined : Math.max(1, Math.round(Number(raw)) || 1) } });
                }}
              />
            </Row>
          </Panel>

          <Panel title={t("reAi")}>
            <textarea
              style={{ ...ui.textarea, minHeight: 90 }}
              placeholder={t("reAiPlaceholder")}
              value={article}
              onChange={(e) => setArticle(e.target.value)}
            />
            <button
              style={{ ...ui.primaryPill, width: "100%", opacity: busy || !article.trim() ? 0.55 : 1 }}
              disabled={busy !== null || !article.trim()}
              onClick={() => void runAI(article, false)}
            >
              {busy === "ai" ? t("analyzing") : t("reAiButton")}
            </button>
          </Panel>
        </aside>

        {/* ── 카드: 모바일=좌우 스와이프 캐러셀 / 데스크톱=그리드·갤러리 ── */}
        <main className="ek-main" style={{ flex: 1, minWidth: 0 }}>
          {isMobile ? (
            <CarouselView deck={deck} selIdx={selIdx} onSel={setSel} />
          ) : gallery ? (
            <GalleryView deck={deck} selIdx={selIdx} onSel={setSel} onClose={() => setGallery(false)} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))", gap: 22 }}>
              {specs.map((s, i) => (
                <Thumb
                  key={s.role}
                  deck={deck}
                  index={i}
                  selected={i === selIdx}
                  onSelect={() => setSel(i)}
                  onZoom={() => {
                    setSel(i);
                    setGallery(true);
                  }}
                  width={248}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ── 로그인 게이트 ──────────────────────────────────────────────────────── */
function LoginGate({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useI18n();
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
      setErr(t("wrongPassword"));
      setBusy(false);
    }
  };
  return (
    <div style={ui.gate}>
      <LangSwitch style={{ position: "fixed", top: 14, right: 14, zIndex: 20 }} />
      <div style={ui.gateCard}>
        <div style={{ ...ui.gradientText, fontSize: 24, fontWeight: 600 }}>eigen knot</div>
        <div style={{ color: "#5F6368", fontSize: 13, margin: "8px 0 22px" }}>{t("enterPassword")}</div>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setLocal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ ...ui.input, marginBottom: 12 }}
          placeholder={t("passwordPlaceholder")}
        />
        {err && <div style={{ color: "#F28B82", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
        <button style={{ ...ui.primaryPill, width: "100%", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
          {busy ? t("checking") : t("enter")}
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
