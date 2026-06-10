// CLI orchestrator: article + photo + meta → 10 PNGs + ZIP.
//
//   node scripts/generate.mjs --issue 14 --slug delayed-adulthood \
//     --title "…" --img photo.jpg --body article.md [--model sonnet|opus]
//
//   # skip the AI step and render a hand-authored / edited content JSON:
//   node scripts/generate.mjs --no-ai --deck content.json --img photo.jpg \
//     --issue 14 --slug delayed-adulthood --title "…" [--focal "center 35%"]

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { fileToDataUrl } from "./shared.mjs";
import { captureDeck } from "../capture/capture.mjs";
import { analyzeArticle } from "../content/analyze.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { values } = parseArgs({
  options: {
    issue: { type: "string" },
    slug: { type: "string" },
    title: { type: "string" },
    img: { type: "string" },
    body: { type: "string" },
    deck: { type: "string" },
    model: { type: "string", default: "sonnet" },
    out: { type: "string" },
    scale: { type: "string", default: "1" },
    focal: { type: "string" },
    dim: { type: "string" },
    "no-ai": { type: "boolean", default: false },
    build: { type: "boolean", default: false },
  },
});

function need(name) {
  if (!values[name]) {
    console.error(`error: --${name} 가 필요합니다.`);
    process.exit(1);
  }
  return values[name];
}

const issue = Number(need("issue"));
const slug = need("slug");
const meta = { issue, slug, title: values.title ?? "" };
const img = resolve(need("img"));

let content;
if (values.deck) {
  content = JSON.parse(readFileSync(resolve(values.deck), "utf8"));
} else if (!values["no-ai"]) {
  const bodyText = readFileSync(resolve(need("body")), "utf8");
  console.log(`· Claude로 본문 분석 중 (${values.model})…`);
  content = await analyzeArticle(bodyText, meta, { model: values.model });
} else {
  console.error("error: --no-ai 모드에는 --deck <content.json> 이 필요합니다.");
  process.exit(1);
}

// Brand-fixed kicker — deterministic, not left to the model (PRD §8).
content.cover = { ...content.cover, kicker: `Weekly Insight: ${issue} knot` };

// --dim applies one uniform value to all BODY cards (cover/closing keep their
// bright defaults). Matches the "본문 0.90 통일" preference (PRD Appendix B).
const bodyRoles = ["summary", "definition", "compare", "diagnosis", "analysis", "grid", "claim", "conclusion"];
const dims = values.dim ? Object.fromEntries(bodyRoles.map((r) => [r, Number(values.dim)])) : undefined;

const deck = { meta, content, bg: fileToDataUrl(img), focal: values.focal ?? "center", dims };

const outDir = resolve(values.out ?? join(ROOT, "output", `issue-${String(issue).padStart(3, "0")}`));
mkdirSync(outDir, { recursive: true });
// Persist the resolved deck for re-capture / history (PRD §11.10). Bg is large,
// so store a pointer rather than the dataURL.
writeFileSync(join(outDir, "deck.json"), JSON.stringify({ ...deck, bg: `inlined:${basename(img)}` }, null, 2));

console.log(`· 카드 10장 캡처 → ${outDir}`);
const res = await captureDeck(deck, { outDir, scale: Number(values.scale) || 1, forceBuild: values.build });

console.log(`\n✅ ${res.files.length}장 + zip → ${res.outDir}`);
if (res.overflowAny) {
  console.log("⚠ 일부 카드가 안전영역을 넘쳤습니다 — 문구를 줄이거나 dim/폰트를 조정한 뒤 다시 실행하세요.");
}
process.exit(0);
