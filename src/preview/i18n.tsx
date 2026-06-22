// Studio UI localization. English is the BASE language — every key is authored
// in EN first and other locales mirror its shape (compile-checked via `Dict`).
// This covers the studio chrome only; the language of the CARD TEXT is decided
// by the AI from the article itself (see content/analyze.mjs).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CardRole } from "@/types";

export type Locale = "en" | "ko";
export const LOCALES: { id: Locale; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "ko", label: "한국어" },
];

const EN = {
  // intro
  introTitle: "What shall we turn into card news?",
  introSub: "Paste your text —\nAI decides the title, the card lineup,\nand how many cards to make.",
  introPlaceholder: "Paste the text you want to turn into cards…",
  attachFile: "📎 Image/PDF",
  attachHint: "A photo of a page, a screenshot, or a PDF — AI reads it as the article.",
  attachPdfTooBig: "PDF is too large (max 3MB).",
  attachUnsupported: "Only image or PDF files are supported.",
  attachMax: "Up to 3 attachments.",
  dropHint: "Drop the image or PDF here",
  introBusy: "AI is reading your text and designing the deck…",
  aiMakeCards: "Make cards with AI",
  exploreSample: "Explore the sample",
  // topbar
  exporting: "Exporting {p}",
  exportPngs: "Export {n} PNGs",
  exportShort: "Export",
  videoShort: "Video",
  retrying: "{p} retrying",
  // notices
  composed: "✓ {n} cards composed — tap a card to refine.",
  someOverflow: "⚠ Some cards overflow — refine the cards marked ⚠.",
  downloadDone: "✓ {n} PNGs downloaded",
  savedShare: "✓ Pick Save Image/Video in the share sheet to keep it.",
  // card edit panel
  cardEdit: "Edit card — {nn} {role}",
  cardDim: "This card's dim · {v}",
  closingHint: "Leave a line empty to hide it. The large center text is the watermark (see ‘Design’).",
  // design panel
  design: "Design",
  font: "Font",
  typeSize: "Type size · {v}%",
  accentColor: "Accent color",
  accentPlaceholder: "#FB7185 or rgb(251,113,133)",
  brandColor: "Brand color (closing card)",
  watermarkLabel: "Watermark text (empty = hidden)",
  platformSize: "Platform size",
  sizeNote: "Now {w}×{h}px — check the ⚠ overflow badges after a size change.",
  // background panel
  bgPhoto: "Background photo",
  uploadImage: "Upload image (jpg/png)",
  abstractBg: "🎲 Abstract background",
  aiBgLabel: "AI background (Gemini)",
  aiBgPlaceholder: "Describe the scene or mood — e.g. rainy night city window",
  aiBgGo: "Generate background",
  aiBgBusy: "Generating…",
  focal: "Focal point",
  bodyDimAll: "Body dim (all) · {v}",
  // composition panel
  composition: "Cards · {n}",
  compositionNote: "Unchecked cards are skipped on export; file numbers shift up automatically.",
  // filename panel
  filenames: "Filenames",
  deckNameLabel: "Deck name (any language — names the ZIP and every image)",
  deckNamePlaceholder: "e.g. my-card-news",
  issueLabel: "Issue number (used by auto-naming when the name is empty)",
  // re-AI panel
  reAi: "Text → AI re-compose",
  reAiPlaceholder: "Paste text and press the button to rebuild the cards (current edits are overwritten).",
  analyzing: "Analyzing…",
  reAiButton: "Re-compose with AI",
  // caption panel
  caption: "Caption & hashtags",
  captionLang: "Caption language",
  captionGen: "Write caption",
  captionRegen: "↻ Regenerate",
  captionBusy: "Writing…",
  captionCopy: "Copy",
  captionCopied: "✓ Copied",
  captionHint: "AI writes an Instagram caption + hashtags from your cards. Regenerate for a fresh take each time.",
  // video (Reels/Shorts) export
  videoExport: "Video (Reels/Shorts)",
  makeReels: "Export video",
  makeReelsHint: "Stitch the cards into a 9:16 MP4 with music — for Reels / Shorts",
  videoMusic: "Background music",
  musicNone: "No music",
  music_lofi: "Lo-fi",
  music_editorial: "Editorial",
  musicUpload: "Use my own audio…",
  musicPick: "🎵 Choose an audio file",
  musicTooBig: "Audio file is too large (max 25MB).",
  uploadAudioDisclaimer: "I have the rights to this audio. Commercial songs can get a Reel muted or blocked by Content ID. Audio is processed locally in your browser — nothing is uploaded.",
  videoPace: "Pace · {x}× (text-heavy cards stay longer)",
  capturing: "Capturing",
  videoLoadingCore: "Loading encoder…",
  encodingVideo: "Encoding video…",
  videoBgmFail: "Could not load the music track.",
  videoNoUpload: "Pick an audio file (or choose another track).",
  videoDone: "✓ Video ready — {mb}MB MP4 downloaded.",
  videoNote: "{n} cards ≈ {sec}s total, {w}×{h} MP4. Each card's time adapts to its text length; hard cuts (no animation). Encoded in your browser; first run loads the encoder once.",
  canvaFinish: "Finish in Canva ↗",
  canvaNote: "Want animation + Canva's free music/video? Open a 9:16 Canva canvas, then drag in the cards you got from “Export PNGs”. For monetized Reels use Canva's Audio tab (not the Popular Music tab).",
  canvaHint: "✓ Opened a 9:16 Canva canvas — drop in your exported cards, then add free music/video and export there.",
  // library (my card-news)
  backToLibrary: "← My library",
  libraryTitle: "My card-news",
  librarySub: "Your saved card-news live here on this browser. Open one to keep editing, or make a new one.",
  guestMode: "Guest · saved on this browser",
  loginBtn: "Log in",
  logout: "Log out",
  loginTitle: "Log in / Sign up",
  loginSub: "We'll email you a one-tap login link — no password needed.",
  emailPlaceholder: "you@example.com",
  sendLink: "Send login link",
  sending: "Sending…",
  magicSent: "✉️ Sent a login link to {email}. Open the email and tap the link to finish.",
  cancel: "Cancel",
  loginNotReady: "Login isn't configured yet (admin: set the Supabase keys in .env).",
  newCardNews: "New card-news",
  openDeck: "Open",
  rename: "Rename",
  renamePrompt: "New name",
  duplicate: "Duplicate",
  delete: "Delete",
  confirmDelete: "Delete “{name}”? This can’t be undone.",
  emptyLibrary: "No saved card-news yet — make your first one.",
  relNow: "just now",
  relMin: "{n} min ago",
  relHour: "{n} h ago",
  relDay: "{n} d ago",
  // gallery
  galleryClose: "✕ Back to grid",
  galleryHint: "←/→ navigate · Esc to exit · double-click a card to zoom",
  // misc
  overflowBadge: "⚠ overflow",
  addItem: "+ Add item",
  removeItem: "Remove this item",
  // login
  enterPassword: "Enter the password",
  passwordPlaceholder: "Password",
  wrongPassword: "Wrong password.",
  checking: "Checking…",
  enter: "Enter",
  // labels
  roles: {
    cover: "Cover",
    summary: "3-line summary",
    definition: "Definition",
    compare: "★ Two scenes",
    diagnosis: "Diagnosis",
    analysis: "Analysis",
    grid: "Contrast grid",
    claim: "Core claim",
    conclusion: "Conclusion",
    closing: "Closing",
  } as Record<CardRole, string>,
  fields: {
    kicker: "Kicker (Latin or Korean)",
    headline: "Headline",
    lines: "3 summary lines",
    term_ko: "Term",
    term_en: "Term (English)",
    body: "Body",
    left: "Scene one",
    right: "Scene two",
    label: "Label",
    detail: "Detail",
    common: "Shared takeaway",
    punch: "Punchline (accent)",
    sub: "Subline",
    paras: "Paragraphs",
    items: "Items",
    rows: "Rows (label → takeaway)",
    intro: "Intro",
    couplet: "Couplet (2 lines)",
    emphasis: "Emphasis (accent)",
    tagline: "Line 1 (large)",
    subline: "Line 2",
    note: "Below the watermark",
    footer: "Bottom line",
  } as Record<string, string>,
  accents: {
    teaberry: "Teaberry",
    banana: "Pale Banana",
    amethyst: "Amethyst Orchid",
    mandarin: "Mandarin Orange",
    tickled: "Tickled Pink",
    caramel: "Caramel",
  } as Record<string, string>,
  fontNames: {
    "noto-serif": "Noto Serif (serif)",
    "nanum-myeongjo": "Nanum Myeongjo (serif)",
    "gowun-batang": "Gowun Batang (soft serif)",
    "noto-sans": "Noto Sans (sans)",
    "gowun-dodum": "Gowun Dodum (round sans)",
    kanit: "Kanit (Thai sans)",
    prompt: "Prompt (Thai sans)",
    montserrat: "Montserrat (Latin sans)",
    "open-sans": "Open Sans (Latin sans)",
  } as Record<string, string>,
  platforms: {
    "ig-45": "Instagram 4:5",
    "ig-11": "Instagram 1:1",
    story: "Story/Reels 9:16",
    "x-169": "X (Twitter) 16:9",
  } as Record<string, string>,
};

type Dict = typeof EN;

const KO: Dict = {
  introTitle: "무엇을 카드뉴스로 만들까요?",
  introSub: "글을 붙여넣으면\nAI가 제목, 카드 구성, 장수까지\n알아서 정합니다.",
  introPlaceholder: "카드뉴스로 만들고 싶은 글을 여기에 붙여넣으세요…",
  attachFile: "📎 이미지/PDF",
  attachHint: "책 페이지 사진, 스크린샷, PDF — AI가 읽고 카드로 만듭니다.",
  attachPdfTooBig: "PDF가 너무 큽니다 (최대 3MB).",
  attachUnsupported: "이미지 또는 PDF 파일만 지원합니다.",
  attachMax: "첨부는 최대 3개까지입니다.",
  dropHint: "여기에 이미지나 PDF를 놓으세요",
  introBusy: "AI가 글을 읽고 카드 구성을 설계하는 중…",
  aiMakeCards: "AI로 카드 만들기",
  exploreSample: "샘플로 둘러보기",
  exporting: "내보내는 중 {p}",
  exportPngs: "PNG {n}장 내보내기",
  exportShort: "내보내기",
  videoShort: "영상",
  retrying: "{p} 재시도",
  composed: "✓ {n}장 구성 완료 — 카드를 눌러 다듬어 주세요.",
  someOverflow: "⚠ 일부 카드가 넘쳤습니다 — ⚠ 표시 카드를 다듬어 주세요.",
  downloadDone: "✓ PNG {n}장 다운로드 완료",
  savedShare: "✓ 공유 시트에서 ‘이미지/영상 저장’을 누르면 사진첩에 저장돼요.",
  cardEdit: "카드 편집 — {nn} {role}",
  cardDim: "이 카드 dim · {v}",
  closingHint: "빈 칸으로 두면 그 줄은 카드에서 숨겨집니다. 가운데 큰 글씨는 ‘디자인’의 워터마크 문구입니다.",
  design: "디자인",
  font: "폰트",
  typeSize: "글자 크기 · {v}%",
  accentColor: "강조색",
  accentPlaceholder: "#FB7185 또는 rgb(251,113,133)",
  brandColor: "브랜드색 (끝맺음 카드)",
  watermarkLabel: "워터마크 문구 (비우면 숨김)",
  platformSize: "플랫폼 사이즈",
  sizeNote: "현재 {w}×{h}px — 사이즈를 바꾸면 ⚠ 넘침 표시를 확인하세요.",
  bgPhoto: "배경 사진",
  uploadImage: "이미지 업로드 (jpg/png)",
  abstractBg: "🎲 추상 배경",
  aiBgLabel: "AI 배경 생성 (Gemini)",
  aiBgPlaceholder: "장면이나 분위기를 묘사 — 예: 비 오는 밤 도시의 창가",
  aiBgGo: "배경 생성",
  aiBgBusy: "생성 중…",
  focal: "초점 (focal)",
  bodyDimAll: "본문 dim 일괄 · {v}",
  composition: "카드 구성 · {n}장",
  compositionNote: "해제한 카드는 내보내기에서 빠지고, 파일 번호는 자동으로 당겨집니다.",
  filenames: "파일명",
  deckNameLabel: "카드뉴스 이름 (한글 가능 — ZIP과 모든 이미지 파일명에 적용)",
  deckNamePlaceholder: "예: my-card-news",
  issueLabel: "호 번호 (이름을 비웠을 때의 자동 파일명에 사용)",
  reAi: "글 → AI 다시 구성",
  reAiPlaceholder: "본문을 붙여넣고 누르면 카드 내용과 구성을 새로 만듭니다 (현재 편집 내용은 덮어씌워짐).",
  analyzing: "분석 중…",
  reAiButton: "AI로 다시 구성",
  caption: "캡션 · 해시태그",
  captionLang: "캡션 언어",
  captionGen: "캡션 생성",
  captionRegen: "↻ 다시 생성",
  captionBusy: "작성 중…",
  captionCopy: "복사",
  captionCopied: "✓ 복사됨",
  captionHint: "카드 내용으로 인스타그램 캡션과 해시태그를 만들어 줍니다. 다시 생성하면 매번 새 버전이 나옵니다.",
  videoExport: "영상 (릴스/쇼츠)",
  makeReels: "영상 내보내기",
  makeReelsHint: "카드를 9:16 MP4로 이어붙이고 음악을 입힙니다 — 릴스/쇼츠용",
  videoMusic: "배경 음악",
  musicNone: "없음",
  music_lofi: "로파이",
  music_editorial: "에디토리얼",
  musicUpload: "내 음원 사용…",
  musicPick: "🎵 오디오 파일 선택",
  musicTooBig: "오디오 파일이 너무 큽니다 (최대 25MB).",
  uploadAudioDisclaimer: "이 음원에 대한 권리가 제게 있습니다. 상업 음원은 Content ID로 릴스가 음소거·차단될 수 있습니다. 오디오는 브라우저 안에서만 처리되며 업로드되지 않습니다.",
  videoPace: "속도 · {x}배 (글 많은 카드는 더 오래)",
  capturing: "캡처 중",
  videoLoadingCore: "인코더 로딩…",
  encodingVideo: "영상 인코딩…",
  videoBgmFail: "음악 트랙을 불러오지 못했습니다.",
  videoNoUpload: "오디오 파일을 선택하세요 (또는 다른 트랙을 고르세요).",
  videoDone: "✓ 영상 완성 — {mb}MB MP4 다운로드됨.",
  videoNote: "카드 {n}장 ≈ 총 {sec}초, {w}×{h} MP4. 각 카드 시간은 글 길이에 맞춰 자동 조절, 하드컷(애니메이션 없음). 브라우저에서 인코딩하며 처음 한 번 인코더를 불러옵니다.",
  canvaFinish: "Canva에서 마감하기 ↗",
  canvaNote: "애니메이션 + Canva 무료 음악·영상으로 고급 마감하고 싶다면: 9:16 Canva 화면을 열고, ‘PNG 내보내기’로 받은 카드를 끌어다 놓으세요. 수익용 릴스는 Canva ‘Audio’ 탭 음악만 (‘Popular Music’ 탭은 비상업 전용).",
  canvaHint: "✓ 9:16 Canva 화면을 열었어요 — 내보낸 카드를 끌어다 놓고 무료 음악·영상으로 마감해 내보내세요.",
  // 보관함 (내 카드뉴스)
  backToLibrary: "← 내 보관함",
  libraryTitle: "내 카드뉴스",
  librarySub: "만든 카드뉴스가 이 브라우저에 저장됩니다. 열어서 이어 편집하거나 새로 만드세요.",
  guestMode: "게스트 · 이 브라우저에 저장",
  loginBtn: "로그인",
  logout: "로그아웃",
  loginTitle: "로그인 / 회원가입",
  loginSub: "이메일로 한 번에 로그인되는 링크를 보내드려요. 비밀번호가 필요 없습니다.",
  emailPlaceholder: "you@example.com",
  sendLink: "로그인 링크 받기",
  sending: "보내는 중…",
  magicSent: "✉️ {email}로 로그인 링크를 보냈어요. 메일을 열어 링크를 누르면 완료됩니다.",
  cancel: "취소",
  loginNotReady: "로그인이 아직 설정되지 않았어요 (관리자: .env에 Supabase 키 필요).",
  newCardNews: "새로 만들기",
  openDeck: "열기",
  rename: "이름 변경",
  renamePrompt: "새 이름",
  duplicate: "복제",
  delete: "삭제",
  confirmDelete: "‘{name}’을(를) 삭제할까요? 되돌릴 수 없습니다.",
  emptyLibrary: "아직 저장된 카드뉴스가 없어요 — 첫 카드뉴스를 만들어 보세요.",
  relNow: "방금",
  relMin: "{n}분 전",
  relHour: "{n}시간 전",
  relDay: "{n}일 전",
  galleryClose: "✕ 그리드로",
  galleryHint: "←/→ 이동 · Esc 닫기 · 카드를 더블클릭하면 확대",
  overflowBadge: "⚠ 넘침",
  addItem: "+ 항목 추가",
  removeItem: "이 항목 삭제",
  enterPassword: "비밀번호를 입력하세요",
  passwordPlaceholder: "비밀번호",
  wrongPassword: "비밀번호가 올바르지 않습니다.",
  checking: "확인 중…",
  enter: "들어가기",
  roles: {
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
  },
  fields: {
    kicker: "킥커 (영문·한글)",
    headline: "헤드라인",
    lines: "요약 3줄",
    term_ko: "개념",
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
    tagline: "첫 줄 (큰 글씨)",
    subline: "둘째 줄",
    note: "워터마크 아래 줄",
    footer: "맨 아래 줄 (영문)",
  },
  accents: {
    teaberry: "티베리",
    banana: "페일 바나나",
    amethyst: "아메시스트",
    mandarin: "만다린",
    tickled: "티클드 핑크",
    caramel: "카라멜",
  },
  fontNames: {
    "noto-serif": "노토 세리프 (명조)",
    "nanum-myeongjo": "나눔명조",
    "gowun-batang": "고운바탕 (부드러운 명조)",
    "noto-sans": "노토 산스 (고딕)",
    "gowun-dodum": "고운돋움 (둥근 고딕)",
    kanit: "Kanit (태국어 산스)",
    prompt: "Prompt (태국어 산스)",
    montserrat: "Montserrat (라틴 산스)",
    "open-sans": "Open Sans (라틴 산스)",
  },
  platforms: {
    "ig-45": "Instagram 4:5",
    "ig-11": "Instagram 1:1",
    story: "스토리/릴스 9:16",
    "x-169": "X (트위터) 16:9",
  },
};

const DICTS: Record<Locale, Dict> = { en: EN, ko: KO };

const LANG_KEY = "ek-lang";

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "ko") return saved;
  } catch {
    /* private mode */
  }
  return navigator.language?.toLowerCase().startsWith("ko") ? "ko" : "en";
}

type Vars = Record<string, string | number>;
function fmt(s: string, vars?: Vars): string {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

interface I18n {
  lang: Locale;
  setLang: (l: Locale) => void;
  /** Translate a flat key with optional {var} interpolation. */
  t: (key: keyof Omit<Dict, "roles" | "fields" | "accents" | "fontNames" | "platforms">, vars?: Vars) => string;
  /** Direct access to the label maps (roles, fields, …). */
  d: Dict;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Locale>(initialLocale);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = (l: Locale) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* private mode */
    }
  };
  const d = DICTS[lang];
  const t: I18n["t"] = (key, vars) => fmt(d[key] as string, vars);
  return <I18nContext.Provider value={{ lang, setLang, t, d }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

/** Compact EN | 한국어 toggle. */
export function LangSwitch({ style }: { style?: React.CSSProperties }) {
  const { lang, setLang } = useI18n();
  return (
    <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 999, background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.08)", ...style }}>
      {LOCALES.map((l) => (
        <button
          key={l.id}
          onClick={() => setLang(l.id)}
          style={{
            border: "none",
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
            background: lang === l.id ? "#4E86FF" : "transparent",
            color: lang === l.id ? "#fff" : "#5F6368",
          }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
