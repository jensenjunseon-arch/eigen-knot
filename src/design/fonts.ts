// Self-hosted fonts (PRD §11.1) — bundled by Vite, NO CDN dependency at capture
// time, so headless Chromium can never fall back to a tofu (□□□) render. Only
// the weights actually used: Noto Serif KR 400/500/600/700 (Korean + Latin),
// Cormorant Garamond italic 500/600.
import "@fontsource/noto-serif-kr/korean-400.css";
import "@fontsource/noto-serif-kr/korean-500.css";
import "@fontsource/noto-serif-kr/korean-600.css";
import "@fontsource/noto-serif-kr/korean-700.css";
import "@fontsource/noto-serif-kr/latin-400.css";
import "@fontsource/noto-serif-kr/latin-500.css";
import "@fontsource/noto-serif-kr/latin-600.css";
import "@fontsource/noto-serif-kr/latin-700.css";
import "@fontsource/cormorant-garamond/latin-500-italic.css";
import "@fontsource/cormorant-garamond/latin-600-italic.css";

// A representative Korean string + the display face, used by the capture page to
// assert real fonts are loaded (document.fonts.check) before screenshotting.
export const FONT_PROBES = [
  "600 36px 'Noto Serif KR'",
  "400 36px 'Noto Serif KR'",
  "italic 600 30px 'Cormorant Garamond'",
] as const;
export const FONT_PROBE_TEXT = "본질을 꿰뚫는 시선";
