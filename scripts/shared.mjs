// Plain-ESM helpers shared by the Node scripts (capture / analyze / generate).
// MIRRORS src/types.ts (CARD_ORDER cardnames) and src/lib/filename.ts — keep the
// two in sync. Duplicated here so the scripts need no TS build step.

import { readFileSync } from "node:fs";
import { extname } from "node:path";

// Ordered card filename slugs — must match CARD_ORDER in src/types.ts.
export const CARD_NAMES = [
  "cover",
  "summary",
  "definition",
  "two-stories",
  "diagnosis",
  "analysis",
  "grid",
  "claim",
  "conclusion",
  "closing",
];
export const CARD_COUNT = CARD_NAMES.length;

export function kebab(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function cardFilename(seq, slug, issue, cardname) {
  const nn = String(seq).padStart(2, "0");
  const nnn = String(issue).padStart(3, "0");
  return `${nn}-eigen-knot-weekly-issue-insight-${kebab(slug)}-knot-${nnn}-${kebab(cardname)}.png`;
}

export function zipName(slug, issue) {
  const nnn = String(issue).padStart(3, "0");
  return `eigen-knot-weekly-issue-insight-${kebab(slug)}-knot-${nnn}.zip`;
}

const MIME = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// Inline an image file as a dataURL (PRD §11.3 — removes fetch/CORS flakiness;
// the background never re-fetches mid-capture). SVG goes in as URL-encoded UTF-8
// (base64 SVG fails to decode as a background in headless Chromium); raster goes
// in as base64.
export function fileToDataUrl(p) {
  const ext = extname(p).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  if (ext === ".svg") {
    return `data:image/svg+xml,${encodeURIComponent(readFileSync(p, "utf8"))}`;
  }
  return `data:${mime};base64,${readFileSync(p).toString("base64")}`;
}
