import type { Deck, DeckContent } from "@/types";
import contentJson from "./issue-14.json";
import bg from "./issue-14-bg.svg"; // Vite resolves to a served URL string

// The sample deck drives the dev preview. In capture, window.__EK_DECK__ (with
// an inlined dataURL bg) overrides this.
export const SAMPLE_DECK: Deck = {
  meta: { issue: 14, slug: "delayed-adulthood", title: "당신의 20대는 어쩌다 3년짜리가 되었을까" },
  content: contentJson as DeckContent,
  bg,
  focal: "center 35%",
};
