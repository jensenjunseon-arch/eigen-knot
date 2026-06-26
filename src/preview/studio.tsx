import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import JSZip from "jszip";
import type { CardRole, CardSpec, Deck, DeckContent } from "@/types";
import { CARD_ORDER, ALL_ROLES, PLATFORMS, activeSpecs, deckSize, defaultClosing } from "@/types";
import { RenderCard } from "@/cards/cards";
import { resolvedZipName, resolvedCardFilename } from "@/lib/filename";
import { FONT_CHOICES, DEFAULT_FONT_ID, defaultFontFor } from "@/design/fonts";
import { SAMPLE_DECK } from "@/sample";
import { cardOverflow } from "./shared";
import { apiFetch, checkPassword, getPw, savePw, imageToBg, b64ToBg, deliverFiles, fileToMedia, type MediaAttachment } from "./api";
import { encodeSlideshow, type AudioInput } from "./video";
import { listDecks, getDeck, saveDeck, deleteDeck, duplicateDeck, renameDeck, migrateOldSlot, newDeckId, type SavedDeck } from "./library";
import { supabaseReady, sendMagicLink, signOut, currentEmail, onAuthChange } from "./supabase";
import { abstractBg, randomSeed } from "@/lib/abstractBg";
import { I18nProvider, LangSwitch, useI18n } from "./i18n";

/* ════════════════════════════════════════════════════════════════════════
   eigen knot — card studio
   보관함(저장된 카드뉴스) → 인트로(글 입력 → AI 구성) → 스튜디오(상세 조정).
   덱들은 브라우저(IndexedDB)의 보관함에 자동 저장된다 (library.ts).
   ════════════════════════════════════════════════════════════════════════ */

const BODY_ROLES: CardRole[] = ["summary", "definition", "compare", "diagnosis", "analysis", "grid", "claim", "conclusion"];

// 2025 trend accent palette. Labels live in i18n.
const ACCENT_PRESETS = [
  { id: "teaberry", value: "#D44B6A" },     // Teaberry — berry crimson
  { id: "banana", value: "#EFE080" },        // Pale Banana — soft lemon
  { id: "amethyst", value: "#9A86C8" },      // Amethyst Orchid — periwinkle purple
  { id: "mandarin", value: "#E57B42" },      // Mandarin Orange — warm terracotta
  { id: "tickled", value: "#F0A8BC" },       // Tickled Pink — blush
  { id: "caramel", value: "#C98A50" },       // Caramel — warm sand
];

// Built-in free BGM for the video export. Each id maps to a CC0 file under
// public/audio/ (provenance in public/audio/CREDITS.md). Labels live in i18n.
const BGM_TRACKS = [
  { id: "lofi", file: "/audio/lofi.mp3" },
  { id: "editorial", file: "/audio/editorial.mp3" },
] as const;
type MusicId = "none" | "upload" | (typeof BGM_TRACKS)[number]["id"];

// Canva 9:16 릴스 생성 페이지. Canva의 무료 음악·영상은 Canva 안에서만 라이선스되므로
// '끌어와 합치기'가 아니라 '카드를 보내 Canva에서 마감'한다 (새 탭으로 연다).
const CANVA_REELS_URL = "https://www.canva.com/create/instagram-reels/";

// 카드의 보이는 텍스트 글자 수(마크업·줄바꿈 제외) — 슬라이드 체류 시간의 근거.
function cardTextLen(c: DeckContent, role: CardRole): number {
  const s = (...xs: (string | undefined)[]) =>
    xs.filter(Boolean).join(" ").replace(/<\/?b>/g, "").replace(/\s+/g, " ").trim().length;
  switch (role) {
    case "cover": return s(c.cover.kicker, c.cover.headline);
    case "summary": return s(...(c.summary.lines || []));
    case "definition": return s(c.definition.term_ko, c.definition.body);
    case "compare": return s(c.compare.left?.headline, c.compare.left?.detail, c.compare.right?.headline, c.compare.right?.detail, c.compare.common?.punch, c.compare.common?.sub);
    case "diagnosis": return s(c.diagnosis.headline, ...(c.diagnosis.paras || []));
    case "analysis": return s(c.analysis.headline, ...(c.analysis.items || []));
    case "grid": return s(...(c.grid.rows || []).flat());
    case "claim": return s(c.claim.headline, c.claim.emphasis, c.claim.sub);
    case "conclusion": return s(c.conclusion.intro, ...(c.conclusion.couplet || []));
    case "closing": return s(c.closing?.tagline, c.closing?.subline, c.closing?.note);
    default: return 30;
  }
}

// 슬라이드별 길이(초): 기본 dwell + 글자당 가산 → 글 많은 카드가 더 오래 머문다.
// pace(전체 속도 배수, 1=기본)를 곱한다. 카드당 2.4–6.5초(pace 1 기준).
function slideDurations(content: DeckContent, specs: CardSpec[], pace: number): number[] {
  return specs.map((sp) => {
    const sec = 2.0 + cardTextLen(content, sp.role) / 22;
    return +(Math.min(6.5, Math.max(2.4, sec)) * pace).toFixed(2);
  });
}

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
  onDownload,
  width,
}: {
  deck: Deck;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onZoom?: () => void;
  onDownload?: () => void;
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
    <div className="ek-thumb" style={{ cursor: "pointer" }} onClick={onSelect} onDoubleClick={onZoom}>
      <div
        style={{
          position: "relative",
          width,
          height: Math.round(h * scale),
          overflow: "hidden",
          borderRadius: 14,
          outline: selected ? "2px solid #4E86FF" : "1px solid rgba(0,0,0,0.09)",
          boxShadow: selected ? "0 0 0 4px rgba(78,134,255,0.2), 0 8px 24px -8px rgba(66,133,244,0.25)" : "0 4px 16px -4px rgba(0,0,0,0.12)",
          transition: "outline .12s ease, box-shadow .12s ease",
        }}
      >
        {onDownload && (
          <button
            className="ek-thumb-dl"
            title={t("downloadThis")}
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 2,
              width: 30,
              height: 30,
              borderRadius: "50%",
              border: "none",
              cursor: "pointer",
              background: "rgba(20,22,30,0.6)",
              color: "#fff",
              fontSize: 14,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(2px)",
            }}
          >
            ↓
          </button>
        )}
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
function CarouselView({ deck, selIdx, onSel, onDownload }: { deck: Deck; selIdx: number; onSel: (i: number) => void; onDownload?: (i: number) => void }) {
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
        <div
          key={s.role}
          style={{
            flex: "none",
            scrollSnapAlign: "center",
            // 지금 보고 있는(=선택된) 카드만 제 크기로 떠오르고, 양옆은 살짝
            // 작고 흐리게 — 어떤 카드를 조정 중인지 몸으로 느껴지는 신호.
            transform: i === selIdx ? "scale(1)" : "scale(0.93)",
            opacity: i === selIdx ? 1 : 0.65,
            transition: "transform .25s ease, opacity .25s ease",
          }}
        >
          <Thumb deck={deck} index={i} selected={i === selIdx} onSelect={() => onSel(i)} onDownload={onDownload && (() => onDownload(i))} width={cardW} />
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
  onDownload,
}: {
  deck: Deck;
  selIdx: number;
  onSel: (i: number) => void;
  onClose: () => void;
  onDownload?: (i: number) => void;
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
        <div style={{ display: "flex", gap: 8 }}>
          {onDownload && (
            <button style={ui.chip} onClick={() => onDownload(selIdx)}>
              {t("downloadThisCard")}
            </button>
          )}
          <button style={ui.chip} onClick={onClose}>
            {t("galleryClose")}
          </button>
        </div>
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
/* ── 원고 첨부 (이미지/PDF) — AI가 읽고 카드로 만든다 ──────────────────── */
// 첨부(이미지/PDF) 상태 + 파일 추가 로직. 버튼 선택과 드래그앤드롭이 공유한다.
interface Attach {
  media: MediaAttachment[];
  setMedia: (m: MediaAttachment[]) => void;
  err: string | null;
  addFiles: (files: FileList | File[] | null) => Promise<void>;
}
function useAttachments(): Attach {
  const { t } = useI18n();
  const [media, setMedia] = useState<MediaAttachment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const addFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    setErr(null);
    const next = [...media];
    for (const f of Array.from(files)) {
      if (next.length >= 3) {
        setErr(t("attachMax"));
        break;
      }
      try {
        next.push(await fileToMedia(f, { pdfTooBig: t("attachPdfTooBig"), unsupported: t("attachUnsupported") }));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    }
    setMedia(next);
  };
  return { media, setMedia, err, addFiles };
}

// 자식을 감싸 파일 드롭존으로 만든다. 드래그 중에만 점선 오버레이를 띄운다.
// dragenter/leave는 자식 위에서도 발화하므로 카운터로 경계를 추적한다.
function DropZone({ att, children, style }: { att: Attach; children: ReactNode; style?: CSSProperties }) {
  const { t } = useI18n();
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  return (
    <div
      style={{ position: "relative", ...style }}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        depth.current -= 1;
        if (depth.current <= 0) {
          depth.current = 0;
          setOver(false);
        }
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        void att.addFiles(e.dataTransfer.files);
      }}
    >
      {children}
      {over && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            border: "2px dashed #4E86FF",
            background: "rgba(78,134,255,0.10)",
            backdropFilter: "blur(1px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#2D5BC8",
            fontSize: 14,
            fontWeight: 600,
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          {t("dropHint")}
        </div>
      )}
    </div>
  );
}

function AttachControl({ att }: { att: Attach }) {
  const { t } = useI18n();
  const { media, setMedia, err, addFiles } = att;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <label style={{ ...ui.chip, cursor: "pointer" }} title={t("attachHint")}>
        {t("attachFile")}
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {media.map((m, i) => (
        <span key={i} style={{ ...ui.chip, display: "inline-flex", alignItems: "center", gap: 6, maxWidth: 190 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.media_type === "application/pdf" ? "📄" : "🖼"} {m.name}
          </span>
          <span style={{ cursor: "pointer", fontWeight: 700 }} onClick={() => setMedia(media.filter((_, j) => j !== i))}>
            ×
          </span>
        </span>
      ))}
      {err && <span style={{ fontSize: 12, color: "#C5221F" }}>{err}</span>}
    </div>
  );
}

function Intro({
  canGoBack,
  onBack,
  onAI,
  onSample,
  busy,
  notice,
}: {
  canGoBack: boolean;
  onBack: () => void;
  onAI: (article: string, media: MediaAttachment[]) => void;
  onSample: () => void;
  busy: boolean;
  notice: string | null;
}) {
  const { t } = useI18n();
  const [article, setArticle] = useState("");
  const att = useAttachments();
  const ready = (article.trim().length > 0 || att.media.length > 0) && !busy;
  return (
    <div style={ui.introRoot}>
      <LangSwitch style={{ position: "fixed", top: 14, right: 14, zIndex: 20 }} />
      <div style={ui.introCol}>
        <div className="ek-intro-title" style={ui.gradientTitle}>{t("introTitle")}</div>
        <div style={{ color: "#5F6368", fontSize: 15, textAlign: "center", margin: "12px 0 30px", lineHeight: 1.7, whiteSpace: "pre-line" }}>
          {t("introSub")}
        </div>

        <DropZone att={att} style={ui.introBox}>
          <textarea
            style={ui.introTextarea}
            placeholder={t("introPlaceholder")}
            value={article}
            onChange={(e) => setArticle(e.target.value)}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 14px 12px" }}>
            {busy ? (
              <span style={{ fontSize: 12, color: "#80868B" }}>{t("introBusy")}</span>
            ) : (
              <AttachControl att={att} />
            )}
            <button
              title={t("aiMakeCards")}
              disabled={!ready}
              onClick={() => onAI(article, att.media)}
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
        </DropZone>

        {notice && (
          <div style={{ color: noticeColor(notice), fontSize: 13, textAlign: "center", marginTop: 14 }}>
            {notice}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 26, flexWrap: "wrap" }}>
          {canGoBack && (
            <button style={ui.chipLg} onClick={onBack}>
              {t("backToLibrary")}
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

/* ── 보관함(내 카드뉴스) ───────────────────────────────────────────────── */
function coverThumbTitle(deck: Deck): string {
  return (deck.content?.cover?.headline || deck.meta?.title || "")
    .replace(/<\/?b>/g, "")
    .replace(/\n/g, " ")
    .trim();
}
function relTime(ts: number, t: (k: "relNow" | "relMin" | "relHour" | "relDay", v?: Record<string, string | number>) => string): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("relNow");
  if (m < 60) return t("relMin", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("relHour", { n: h });
  const dys = Math.floor(h / 24);
  if (dys < 7) return t("relDay", { n: dys });
  return new Date(ts).toLocaleDateString();
}

// 로그인(매직링크) — 보관함 헤더에 들어간다. 로그인하면 이메일 칩 + 로그아웃,
// 비로그인이면 게스트 칩 + 로그인 버튼(이메일 폼 모달).
function AuthControl() {
  const { t } = useI18n();
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void currentEmail().then(setEmail);
    return onAuthChange((e) => {
      setEmail(e);
      if (e) { setOpen(false); setSent(false); }
    });
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabaseReady) { setErr(t("loginNotReady")); return; }
    setBusy(true);
    setErr(null);
    try {
      await sendMagicLink(input);
      setSent(true);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  };

  if (email) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ ...ui.chip, cursor: "default", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={email}>☁ {email}</span>
        <button style={ui.chip} onClick={() => void signOut()}>{t("logout")}</button>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ ...ui.chip, cursor: "default" }}>{t("guestMode")}</span>
        <button style={ui.chip} onClick={() => { setErr(null); setSent(false); setOpen(true); }}>{t("loginBtn")}</button>
      </div>
      {open && (
        <div style={{ ...ui.gate, zIndex: 50 }} onClick={() => setOpen(false)}>
          <div style={ui.gateCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...ui.gradientText, fontSize: 20, fontWeight: 600 }}>{t("loginTitle")}</div>
            <div style={{ color: "#5F6368", fontSize: 13, margin: "8px 0 16px", lineHeight: 1.6 }}>{t("loginSub")}</div>
            {sent ? (
              <div style={{ fontSize: 13.5, color: "#1E8E3E", lineHeight: 1.6 }}>{t("magicSent", { email: input })}</div>
            ) : (
              <form onSubmit={(e) => void submit(e)}>
                <input style={{ ...ui.input, marginBottom: 10 }} type="email" required autoFocus placeholder={t("emailPlaceholder")} value={input} onChange={(e) => setInput(e.target.value)} />
                <button style={{ ...ui.primaryPill, width: "100%", opacity: busy ? 0.6 : 1 }} type="submit" disabled={busy}>{busy ? t("sending") : t("sendLink")}</button>
              </form>
            )}
            {err && <div style={{ color: "#C5221F", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
            <button style={{ ...ui.chip, marginTop: 14 }} onClick={() => setOpen(false)}>{t("cancel")}</button>
          </div>
        </div>
      )}
    </>
  );
}

function Library({
  decks,
  onOpen,
  onNew,
  onDelete,
  onDuplicate,
  onRename,
}: {
  decks: SavedDeck[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const { t } = useI18n();
  const tile: CSSProperties = { background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(66,133,244,0.08)" };
  const iconBtn: CSSProperties = { background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: "#5F6368", padding: 4, lineHeight: 1 };
  return (
    <div style={{ ...ui.introRoot, alignItems: "flex-start", padding: "56px 0 24px" }}>
      <LangSwitch style={{ position: "fixed", top: 14, right: 14, zIndex: 20 }} />
      <div style={{ width: "100%", maxWidth: 940, margin: "0 auto", padding: "0 16px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div className="ek-intro-title" style={{ ...ui.gradientTitle, textAlign: "left", fontSize: 26 }}>{t("libraryTitle")}</div>
          <AuthControl />
        </div>
        <div style={{ color: "#5F6368", fontSize: 13, margin: "8px 0 20px", lineHeight: 1.6 }}>{t("librarySub")}</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14 }}>
          <button
            onClick={onNew}
            style={{ ...tile, aspectRatio: "4 / 5", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", color: "#4E86FF", fontSize: 14, fontWeight: 600, border: "1.5px dashed rgba(78,134,255,0.45)", boxShadow: "none", background: "rgba(255,255,255,0.6)" }}
          >
            <span style={{ fontSize: 30, fontWeight: 400 }}>＋</span>
            {t("newCardNews")}
          </button>
          {decks.map((s) => (
            <div key={s.id} style={tile}>
              <div
                onClick={() => onOpen(s.id)}
                title={t("openDeck")}
                style={{
                  cursor: "pointer",
                  aspectRatio: "4 / 5",
                  position: "relative",
                  background: s.deck.bg?.startsWith("data:") ? `center/cover no-repeat url("${s.deck.bg}")` : "linear-gradient(160deg,#2A2E3A,#15171E)",
                }}
              >
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", padding: 12, background: "linear-gradient(180deg, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.66) 100%)" }}>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.01em", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {coverThumbTitle(s.deck)}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "8px 10px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: "#1A1C22", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "#9AA0A6" }}>{relTime(s.updatedAt, t)}</div>
                </div>
                <div style={{ display: "flex", gap: 2, flex: "none" }}>
                  <button title={t("rename")} style={iconBtn} onClick={() => { const n = window.prompt(t("renamePrompt"), s.name); if (n != null) onRename(s.id, n); }}>✎</button>
                  <button title={t("duplicate")} style={iconBtn} onClick={() => onDuplicate(s.id)}>⧉</button>
                  <button title={t("delete")} style={{ ...iconBtn, color: "#C5221F" }} onClick={() => { if (window.confirm(t("confirmDelete", { name: s.name }))) onDelete(s.id); }}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {decks.length === 0 && <div style={{ color: "#80868B", fontSize: 13, marginTop: 18, textAlign: "center" }}>{t("emptyLibrary")}</div>}
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
  const [deck, setDeck] = useState<Deck | null>(null);
  // 보관함: 이 브라우저에 저장된 카드뉴스 목록 + 현재 편집 중인 덱의 id.
  const [library, setLibrary] = useState<SavedDeck[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"library" | "intro" | "studio">("library");
  const [sel, setSel] = useState(0);
  const [article, setArticle] = useState("");
  const [busy, setBusy] = useState<null | "ai" | "export" | "bg" | "caption" | "video">(null);
  const [bgPrompt, setBgPrompt] = useState("");
  const reAtt = useAttachments();
  // 영상(릴스/쇼츠) 내보내기 옵션.
  const [vidMusic, setVidMusic] = useState<MusicId>("lofi");
  const [vidPace, setVidPace] = useState(1);
  const [vidUpload, setVidUpload] = useState<File | null>(null);
  const [vidConsent, setVidConsent] = useState(false);
  // 인스타그램 캡션·해시태그. variation을 올릴 때마다 다른 각도로 새로 쓴다.
  const [captionLang, setCaptionLang] = useState<"ko" | "en">("ko");
  const [captionText, setCaptionText] = useState("");
  const [captionCopied, setCaptionCopied] = useState(false);
  const captionVar = useRef(0);
  const [prog, setProg] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
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

  const reloadLibrary = () => listDecks().then(setLibrary);

  // 첫 진입: 옛 단일 슬롯을 보관함으로 한 번 이관 → 목록 로드.
  useEffect(() => {
    if (!unlocked) return;
    migrateOldSlot().then(reloadLibrary);
  }, [unlocked]);

  // 자동 저장: 편집 중인 덱(currentId)을 보관함에 디바운스 저장한다.
  useEffect(() => {
    if (!deck || !currentId) return;
    const id = setTimeout(() => {
      void saveDeck(currentId, deck.meta.title || "", deck);
    }, 600);
    return () => clearTimeout(id);
  }, [deck, currentId]);

  // 보관함에서 덱 열기 / 새로 만들기 / 삭제·복제·이름변경.
  const openDeck = async (id: string) => {
    const s = await getDeck(id);
    if (!s) return;
    setDeck({ ...s.deck, bg: s.deck.bg?.startsWith("data:") ? s.deck.bg : SAMPLE_DECK.bg });
    setCurrentId(s.id);
    setSel(0);
    setNotice(null);
    setPhase("studio");
  };
  const startNew = () => {
    setNotice(null);
    setPhase("intro");
  };
  const removeFromLibrary = async (id: string) => {
    await deleteDeck(id);
    if (id === currentId) setCurrentId(null);
    await reloadLibrary();
  };
  const duplicateInLibrary = async (id: string) => {
    await duplicateDeck(id);
    await reloadLibrary();
  };
  const renameInLibrary = async (id: string, name: string) => {
    await renameDeck(id, name);
    await reloadLibrary();
  };
  const goLibrary = () => {
    void reloadLibrary();
    setPhase("library");
  };

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
  const runAI = async (text: string, fresh: boolean, media: MediaAttachment[] = []) => {
    if (!text.trim() && !media.length) return;
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
      const j = await apiFetch<{ title: string; cards: CardRole[]; content: DeckContent; lang?: string; bgPrompt?: string }>("/api/analyze", {
        body: text,
        meta,
        media,
      });
      // AI가 글에서 뽑은 배경 장면 제안 — 배경 패널에 미리 채워, 한 번의 클릭으로
      // '딱 맞는' 이미지가 나오게 한다.
      if (j.bgPrompt) setBgPrompt(j.bgPrompt);
      // 모델이 쓴 킥커를 살린다 — 비어 있을 때만 기본 문구로 채움.
      const content: DeckContent = {
        ...j.content,
        cover: { ...j.content.cover, kicker: j.content.cover.kicker?.trim() || (meta.issue ? `Weekly Insight: ${meta.issue} knot` : "Weekly Insight") },
      };
      setDeck((d) => {
        // 새로 만들기는 깨끗한 베이스(SAMPLE_DECK)에서, 재구성은 현재 덱을 잇는다.
        const base = fresh ? SAMPLE_DECK : (d ?? SAMPLE_DECK);
        const lang = j.lang ?? base.lang;
        // 카드 언어가 바뀌면 그 언어에 맞는 폰트로 시드 (사용자는 '디자인'에서 변경 가능).
        const langChanged = lang !== (base.lang ?? "ko");
        return {
          ...base,
          meta: { ...meta, title: j.title || meta.title },
          content,
          cards: j.cards,
          lang,
          font: langChanged ? defaultFontFor(lang) : (base.font ?? defaultFontFor(lang)),
          bg: fresh ? SAMPLE_DECK.bg : (base.bg ?? SAMPLE_DECK.bg),
        };
      });
      if (fresh) setCurrentId(newDeckId()); // 새 덱 → 보관함에 새 항목으로 저장
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
      // 모바일=공유 시트(사진첩) / 데스크톱·폴백=다운로드. 개별 PNG는 공유로,
      // 폴백 다운로드는 ZIP으로 받는다.
      const how = await deliverFiles(files, blob, resolvedZipName(deck));
      setNotice(anyOverflow ? t("someOverflow") : how === "shared" ? t("savedShare") : t("downloadDone", { n }));
    } catch (e) {
      setNotice(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      setProg("");
    }
  };

  /* 카드 1장만 내보내기 — 전체 ZIP과 같은 캡처 경로로 해당 인덱스만 받아 단일 PNG로 배달. */
  const runExportOne = async (index: number) => {
    if (!deck || busy) return;
    setBusy("export");
    setNotice(null);
    setProg(`${index + 1}/${specs.length}`);
    try {
      let card: { name: string; b64: string };
      try {
        card = await apiFetch("/api/capture-card", { deck, index });
      } catch {
        card = await apiFetch("/api/capture-card", { deck, index });
      }
      const bytes = Uint8Array.from(atob(card.b64), (ch) => ch.charCodeAt(0));
      const file = new File([bytes], card.name, { type: "image/png" });
      const how = await deliverFiles([file], new Blob([bytes], { type: "image/png" }), card.name);
      setNotice(how === "shared" ? t("savedShare") : t("oneDownloaded", { name: card.name }));
    } catch (e) {
      setNotice(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      setProg("");
    }
  };

  /* 영상(릴스/쇼츠) 내보내기 — 카드 PNG들을 그대로 이어붙여 9:16 MP4로 인코딩.
     캡처는 PNG 내보내기와 동일한 경로(카드당 1회 재시도). 인코딩은 브라우저
     안에서 ffmpeg.wasm(싱글스레드)으로 처리하므로 서버/헤더 변경이 없다. */
  const runVideo = async () => {
    if (!deck) return;
    setBusy("video");
    setNotice(null);
    try {
      const n = specs.length;
      const pngB64s: string[] = [];
      for (let i = 0; i < n; i++) {
        setProg(`${t("capturing")} ${i + 1}/${n}`);
        let card: { name: string; b64: string };
        try {
          card = await apiFetch("/api/capture-card", { deck, index: i });
        } catch {
          setProg(t("retrying", { p: `${i + 1}/${n}` }));
          card = await apiFetch("/api/capture-card", { deck, index: i });
        }
        pngB64s.push(card.b64);
      }

      let audio: AudioInput | null = null;
      if (vidMusic === "upload") {
        if (!vidUpload) throw new Error(t("videoNoUpload"));
        audio = { data: new Uint8Array(await vidUpload.arrayBuffer()), ext: (vidUpload.name.split(".").pop() || "mp3").toLowerCase() };
      } else if (vidMusic !== "none") {
        const track = BGM_TRACKS.find((tk) => tk.id === vidMusic);
        const res = track && (await fetch(track.file));
        if (!res || !res.ok) throw new Error(t("videoBgmFail"));
        audio = { data: new Uint8Array(await res.arrayBuffer()), ext: "mp3" };
      }

      const { w, h } = deckSize(deck);
      const durations = slideDurations(deck.content, activeSpecs(deck), vidPace);
      const blob = await encodeSlideshow({
        pngB64s,
        durations,
        w,
        h,
        audio,
        onPhase: (p) => setProg(p === "loading" ? t("videoLoadingCore") : t("encodingVideo")),
        onProgress: (r) => setProg(`${t("encodingVideo")} ${Math.round(r * 100)}%`),
      });

      const fname = resolvedZipName(deck).replace(/\.zip$/i, ".mp4");
      const mp4 = new File([blob], fname, { type: "video/mp4" });
      const how = await deliverFiles([mp4], blob, fname);
      setNotice(how === "shared" ? t("savedShare") : t("videoDone", { mb: (blob.size / 1_048_576).toFixed(1) }));
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

  // Canva로 보내 마감 — 9:16 캔버스를 새 탭에서 열고, 카드를 끌어다 놓도록 안내.
  // (window.open은 클릭 제스처 안에서 동기로 호출해야 팝업 차단을 피한다.)
  const openCanva = () => {
    window.open(CANVA_REELS_URL, "_blank", "noopener,noreferrer");
    setNotice(t("canvaHint"));
  };

  /* AI 배경 생성 (Gemini) — 스타일 프레임은 서버가 강제한다. */
  const runGenBg = async () => {
    if (!deck || !bgPrompt.trim()) return;
    setBusy("bg");
    setNotice(null);
    try {
      const { w, h } = deckSize(deck);
      const j = await apiFetch<{ b64: string; mime: string }>("/api/generate-bg", { prompt: bgPrompt, w, h });
      const bg = await b64ToBg(j.b64, j.mime);
      patch({ bg });
    } catch (e) {
      setNotice(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  /* 인스타그램 캡션·해시태그 생성. regen=true면 variation을 올려 새 각도로 다시 쓴다. */
  const runCaption = async (regen: boolean) => {
    if (!deck) return;
    setBusy("caption");
    setNotice(null);
    setCaptionCopied(false);
    captionVar.current = regen ? captionVar.current + 1 : captionVar.current;
    try {
      const j = await apiFetch<{ caption: string; hashtags: string[] }>("/api/caption", {
        deck: { title: deck.meta.title, content: deck.content, cards: deck.cards },
        lang: captionLang,
        variation: captionVar.current,
      });
      const tags = (j.hashtags || []).map((h) => `#${h.replace(/^#/, "")}`).join(" ");
      setCaptionText([j.caption?.trim(), tags].filter(Boolean).join("\n\n"));
    } catch (e) {
      setNotice(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const copyCaption = async () => {
    if (!captionText) return;
    try {
      await navigator.clipboard.writeText(captionText);
      setCaptionCopied(true);
      setTimeout(() => setCaptionCopied(false), 1800);
    } catch {
      /* clipboard 차단 환경 — 사용자가 직접 선택·복사 */
    }
  };

  if (!checked) return null;
  if (!unlocked) return <LoginGate onUnlock={() => setUnlocked(true)} />;

  if (phase === "library") {
    return (
      <Library
        decks={library}
        onOpen={openDeck}
        onNew={startNew}
        onDelete={removeFromLibrary}
        onDuplicate={duplicateInLibrary}
        onRename={renameInLibrary}
      />
    );
  }

  if (phase === "intro") {
    return (
      <Intro
        canGoBack={library.length > 0}
        onBack={goLibrary}
        onAI={(text, media) => void runAI(text, true, media)}
        onSample={() => {
          setDeck({ ...SAMPLE_DECK });
          setCurrentId(newDeckId());
          setSel(0);
          setPhase("studio");
        }}
        busy={busy === "ai"}
        notice={notice}
      />
    );
  }

  if (!deck) {
    goLibrary();
    return null;
  }

  const { w, h } = deckSize(deck);
  const bodyDim = deck.dims?.summary ?? 0.9;
  const selDim = deck.dims?.[spec.role] ?? spec.dim;
  const accent = deck.accent ?? "#D44B6A";
  // 업로드 음원을 고른 경우, 파일 + 권리 동의가 있어야 영상 생성을 허용한다.
  const videoBlocked = vidMusic === "upload" && (!vidUpload || !vidConsent);
  const vidTotal = slideDurations(deck.content, activeSpecs(deck), vidPace).reduce((a, b) => a + b, 0);

  return (
    <div style={ui.root}>
      <header className="ek-topbar" style={ui.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={ui.iconPill} onClick={goLibrary} title={t("backToLibrary")}>
            ←
          </button>
          <span style={{ ...ui.gradientText, fontSize: 16, fontWeight: 600 }}>Card News Generator</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <LangSwitch />
          <button
            className="ek-export-btn"
            style={{ ...ui.exportSecondary, opacity: busy || videoBlocked ? 0.6 : 1 }}
            disabled={busy !== null || videoBlocked}
            onClick={runVideo}
            title={t("makeReelsHint")}
          >
            <span className="ek-export-full">{busy === "video" ? (prog || "…") : t("makeReels")}</span>
            <span className="ek-export-short">{busy === "video" ? (prog || "…") : t("videoShort")}</span>
          </button>
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
                        ...(active ? { background: "#4E86FF", color: "#fff", border: "1px solid transparent" } : {}),
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

          <Panel title={t("videoExport")}>
            <Row label={t("videoMusic")}>
              <select style={ui.input} value={vidMusic} onChange={(e) => setVidMusic(e.target.value as MusicId)}>
                <option value="none">{t("musicNone")}</option>
                {BGM_TRACKS.map((tk) => (
                  <option key={tk.id} value={tk.id}>{t(`music_${tk.id}` as Parameters<typeof t>[0])}</option>
                ))}
                <option value="upload">{t("musicUpload")}</option>
              </select>
            </Row>
            {vidMusic === "upload" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ ...ui.chip, textAlign: "center", cursor: "pointer" }}>
                  {vidUpload ? `🎵 ${vidUpload.name}` : t("musicPick")}
                  <input
                    type="file"
                    accept="audio/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.size > 25 * 1_048_576) {
                        setNotice(`✗ ${t("musicTooBig")}`);
                        return;
                      }
                      setVidUpload(f);
                    }}
                  />
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, color: "#5F6368", lineHeight: 1.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={vidConsent} onChange={(e) => setVidConsent(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>{t("uploadAudioDisclaimer")}</span>
                </label>
              </div>
            )}
            <Row label={t("videoPace", { x: vidPace.toFixed(2) })}>
              <input
                type="range"
                min={0.7}
                max={1.4}
                step={0.05}
                value={vidPace}
                style={ui.range}
                onChange={(e) => setVidPace(Number(e.target.value))}
              />
            </Row>
            <button
              style={{ ...ui.primaryPill, width: "100%", opacity: busy || videoBlocked ? 0.6 : 1 }}
              disabled={busy !== null || videoBlocked}
              onClick={runVideo}
            >
              {busy === "video" ? (prog || t("encodingVideo")) : t("makeReels")}
            </button>
            <div style={{ fontSize: 11, color: "#80868B", lineHeight: 1.6 }}>
              {t("videoNote", { w, h, n: specs.length, sec: vidTotal.toFixed(0) })}
            </div>

            <div style={{ borderTop: "1px solid rgba(0,0,0,0.07)", margin: "6px 0 2px" }} />
            <button style={{ ...ui.exportSecondary, width: "100%" }} onClick={openCanva}>
              {t("canvaFinish")}
            </button>
            <div style={{ fontSize: 11, color: "#80868B", lineHeight: 1.6 }}>{t("canvaNote")}</div>
          </Panel>

          <Panel title={t("bgPhoto")}>
            <label style={{ ...ui.primaryPill, display: "block", textAlign: "center" }}>
              {t("uploadImage")}
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
            </label>
            <button style={{ ...ui.chip, width: "100%" }} onClick={() => patch({ bg: abstractBg(randomSeed()) })}>
              {t("abstractBg")}
            </button>
            <Row label={t("aiBgLabel")}>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={ui.input}
                  placeholder={t("aiBgPlaceholder")}
                  value={bgPrompt}
                  onChange={(e) => setBgPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && busy === null && void runGenBg()}
                />
                <button
                  style={{ ...ui.chip, flex: "none", opacity: busy || !bgPrompt.trim() ? 0.55 : 1 }}
                  disabled={busy !== null || !bgPrompt.trim()}
                  onClick={() => void runGenBg()}
                >
                  {busy === "bg" ? t("aiBgBusy") : t("aiBgGo")}
                </button>
              </div>
            </Row>
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

          <Panel title={t("caption")}>
            <Row label={t("captionLang")}>
              <div style={{ display: "flex", gap: 6 }}>
                {([["ko", "한국어"], ["en", "English"]] as const).map(([code, label]) => {
                  const active = captionLang === code;
                  return (
                    <button
                      key={code}
                      style={{
                        ...ui.chip,
                        ...(active ? { background: "#4E86FF", color: "#fff", border: "1px solid transparent" } : {}),
                      }}
                      onClick={() => setCaptionLang(code)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Row>
            {!captionText ? (
              <button
                style={{ ...ui.primaryPill, width: "100%", opacity: busy ? 0.6 : 1 }}
                disabled={busy !== null}
                onClick={() => void runCaption(false)}
              >
                {busy === "caption" ? t("captionBusy") : t("captionGen")}
              </button>
            ) : (
              <>
                <textarea
                  style={{ ...ui.textarea, minHeight: 150 }}
                  value={captionText}
                  onChange={(e) => setCaptionText(e.target.value)}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    style={{ ...ui.chip, flex: 1, textAlign: "center", opacity: busy ? 0.6 : 1 }}
                    disabled={busy !== null}
                    onClick={() => void runCaption(true)}
                  >
                    {busy === "caption" ? t("captionBusy") : t("captionRegen")}
                  </button>
                  <button style={{ ...ui.chip, flex: "none" }} onClick={() => void copyCaption()}>
                    {captionCopied ? t("captionCopied") : t("captionCopy")}
                  </button>
                </div>
              </>
            )}
            <div style={{ fontSize: 11, color: "#80868B", lineHeight: 1.6 }}>{t("captionHint")}</div>
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
            <DropZone att={reAtt} style={{ borderRadius: 12 }}>
              <textarea
                style={{ ...ui.textarea, minHeight: 90 }}
                placeholder={t("reAiPlaceholder")}
                value={article}
                onChange={(e) => setArticle(e.target.value)}
              />
            </DropZone>
            <AttachControl att={reAtt} />
            <button
              style={{ ...ui.primaryPill, width: "100%", opacity: busy || (!article.trim() && !reAtt.media.length) ? 0.55 : 1 }}
              disabled={busy !== null || (!article.trim() && !reAtt.media.length)}
              onClick={() => void runAI(article, false, reAtt.media)}
            >
              {busy === "ai" ? t("analyzing") : t("reAiButton")}
            </button>
          </Panel>
        </aside>

        {/* ── 카드: 모바일=좌우 스와이프 캐러셀 / 데스크톱=그리드·갤러리 ── */}
        <main className="ek-main" style={{ flex: 1, minWidth: 0 }}>
          {isMobile ? (
            <CarouselView deck={deck} selIdx={selIdx} onSel={setSel} onDownload={(i) => void runExportOne(i)} />
          ) : gallery ? (
            <GalleryView deck={deck} selIdx={selIdx} onSel={setSel} onClose={() => setGallery(false)} onDownload={(i) => void runExportOne(i)} />
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
                  onDownload={() => void runExportOne(i)}
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
        <div style={{ ...ui.gradientText, fontSize: 24, fontWeight: 600 }}>Card News Generator</div>
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
  // 영상 내보내기 버튼 — PNG 내보내기와 같은 크기의 펠(보조 색).
  exportSecondary: {
    background: "#EDF2FA",
    color: "#2D3142",
    border: "1px solid rgba(0,0,0,0.12)",
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
