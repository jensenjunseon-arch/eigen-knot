// Self-hosted fonts (PRD §11.1) — bundled by Vite, NO CDN dependency at capture
// time, so headless Chromium can never fall back to a tofu (□□□) render.
// Korean body faces (user-selectable) + Cormorant Garamond italic for the
// English kicker/watermark. Only the weights actually used.

// 명조 (serif)
import "@fontsource/noto-serif-kr/korean-400.css";
import "@fontsource/noto-serif-kr/korean-500.css";
import "@fontsource/noto-serif-kr/korean-600.css";
import "@fontsource/noto-serif-kr/korean-700.css";
import "@fontsource/noto-serif-kr/latin-400.css";
import "@fontsource/noto-serif-kr/latin-500.css";
import "@fontsource/noto-serif-kr/latin-600.css";
import "@fontsource/noto-serif-kr/latin-700.css";
import "@fontsource/nanum-myeongjo/400.css";
import "@fontsource/nanum-myeongjo/700.css";
import "@fontsource/gowun-batang/400.css";
import "@fontsource/gowun-batang/700.css";
// 고딕 (sans)
import "@fontsource/noto-sans-kr/korean-400.css";
import "@fontsource/noto-sans-kr/korean-500.css";
import "@fontsource/noto-sans-kr/korean-700.css";
import "@fontsource/noto-sans-kr/latin-400.css";
import "@fontsource/noto-sans-kr/latin-500.css";
import "@fontsource/noto-sans-kr/latin-700.css";
import "@fontsource/gowun-dodum/400.css";
// 영문 디스플레이 (킥커/워터마크)
import "@fontsource/cormorant-garamond/latin-500-italic.css";
import "@fontsource/cormorant-garamond/latin-600-italic.css";
// SEA card-news faces (self-hosted, subsets only — small woff2 files).
// Thai sans (incl. Latin + Vietnamese subsets):
import "@fontsource/kanit/thai-400.css";
import "@fontsource/kanit/thai-500.css";
import "@fontsource/kanit/thai-600.css";
import "@fontsource/kanit/thai-700.css";
import "@fontsource/kanit/latin-400.css";
import "@fontsource/kanit/latin-500.css";
import "@fontsource/kanit/latin-600.css";
import "@fontsource/kanit/latin-700.css";
import "@fontsource/prompt/thai-400.css";
import "@fontsource/prompt/thai-500.css";
import "@fontsource/prompt/thai-600.css";
import "@fontsource/prompt/thai-700.css";
import "@fontsource/prompt/latin-400.css";
import "@fontsource/prompt/latin-500.css";
import "@fontsource/prompt/latin-600.css";
import "@fontsource/prompt/latin-700.css";
// Latin sans with full Vietnamese diacritics (also covers id/ms/tl/en):
import "@fontsource/montserrat/latin-400.css";
import "@fontsource/montserrat/latin-500.css";
import "@fontsource/montserrat/latin-600.css";
import "@fontsource/montserrat/latin-700.css";
import "@fontsource/montserrat/vietnamese-400.css";
import "@fontsource/montserrat/vietnamese-500.css";
import "@fontsource/montserrat/vietnamese-600.css";
import "@fontsource/montserrat/vietnamese-700.css";
import "@fontsource/open-sans/latin-400.css";
import "@fontsource/open-sans/latin-500.css";
import "@fontsource/open-sans/latin-600.css";
import "@fontsource/open-sans/latin-700.css";
import "@fontsource/open-sans/vietnamese-400.css";
import "@fontsource/open-sans/vietnamese-500.css";
import "@fontsource/open-sans/vietnamese-600.css";
import "@fontsource/open-sans/vietnamese-700.css";

export interface FontChoice {
  id: string;
  label: string;
  family: string;
  /** The family name document.fonts.check() should probe. */
  probeFamily: string;
  /** Probe text in the script this face is meant for (defaults to Korean). */
  probeText?: string;
}

const THAI_PROBE = "เห็นแก่นแท้ของปรากฏการณ์";
const VIET_PROBE = "Thấy bản chất đằng sau hiện tượng";

export const FONT_CHOICES: FontChoice[] = [
  { id: "noto-serif", label: "노토 세리프 (명조)", family: "'Noto Serif KR', 'Nanum Myeongjo', serif", probeFamily: "Noto Serif KR" },
  { id: "nanum-myeongjo", label: "나눔명조", family: "'Nanum Myeongjo', 'Noto Serif KR', serif", probeFamily: "Nanum Myeongjo" },
  { id: "gowun-batang", label: "고운바탕 (부드러운 명조)", family: "'Gowun Batang', 'Noto Serif KR', serif", probeFamily: "Gowun Batang" },
  { id: "noto-sans", label: "노토 산스 (고딕)", family: "'Noto Sans KR', sans-serif", probeFamily: "Noto Sans KR" },
  { id: "gowun-dodum", label: "고운돋움 (둥근 고딕)", family: "'Gowun Dodum', 'Noto Sans KR', sans-serif", probeFamily: "Gowun Dodum" },
  { id: "kanit", label: "Kanit (Thai sans)", family: "'Kanit', 'Noto Sans KR', sans-serif", probeFamily: "Kanit", probeText: THAI_PROBE },
  { id: "prompt", label: "Prompt (Thai sans)", family: "'Prompt', 'Noto Sans KR', sans-serif", probeFamily: "Prompt", probeText: THAI_PROBE },
  { id: "montserrat", label: "Montserrat (Latin sans)", family: "'Montserrat', 'Noto Sans KR', sans-serif", probeFamily: "Montserrat", probeText: VIET_PROBE },
  { id: "open-sans", label: "Open Sans (Latin sans)", family: "'Open Sans', 'Noto Sans KR', sans-serif", probeFamily: "Open Sans", probeText: VIET_PROBE },
];

export const DEFAULT_FONT_ID = "noto-serif";

export function fontById(id?: string): FontChoice {
  return FONT_CHOICES.find((f) => f.id === id) ?? FONT_CHOICES[0];
}

/** Sensible default face for a card language (BCP-47). The user can always
 *  switch in the Design panel; this only seeds a fresh AI compose. */
export function defaultFontFor(lang?: string): string {
  const l = (lang ?? "ko").toLowerCase();
  if (l.startsWith("ko")) return "noto-serif";
  if (l.startsWith("th")) return "kanit";
  // vi/id/ms/tl/en and other Latin-script languages — sans is the regional norm.
  return "montserrat";
}

// Probes asserted before capture (document.fonts.load + check) so a screenshot
// can never happen on a fallback render. Probe text matches the face's script.
export function fontProbes(fontId?: string): string[] {
  const f = fontById(fontId);
  return [`600 36px '${f.probeFamily}'`, `400 36px '${f.probeFamily}'`, "italic 600 30px 'Cormorant Garamond'"];
}
export function fontProbeText(fontId?: string): string {
  return fontById(fontId).probeText ?? "본질을 꿰뚫는 시선";
}
