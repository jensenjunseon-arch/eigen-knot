import type { Deck, DeckContent } from "@/types";
import contentJson from "./issue-14.json";
// ?raw → SVG 원문 문자열. URL-encoded dataURL로 인라인하면 dev 미리보기·스튜디오·
// 캡처 어디서든 같은 형태(data:)라 /api/capture 검증도 그대로 통과한다.
// (base64 SVG는 headless Chromium 배경에서 디코드 실패 — url-encode가 정답.)
import bgRaw from "./issue-14-bg.svg?raw";

export const SAMPLE_BG = `data:image/svg+xml,${encodeURIComponent(bgRaw)}`;

export const SAMPLE_DECK: Deck = {
  meta: { issue: 14, slug: "delayed-adulthood", title: "당신의 20대는 어쩌다 3년짜리가 되었을까" },
  content: contentJson as DeckContent,
  bg: SAMPLE_BG,
  focal: "center 35%",
};
