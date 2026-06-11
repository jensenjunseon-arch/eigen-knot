// Plain-ESM helpers shared by the Node scripts (capture / analyze / generate).
// MIRRORS src/types.ts (CARD_ORDER cardnames) and src/lib/filename.ts — keep the
// two in sync. Duplicated here so the scripts need no TS build step.

import { readFileSync } from "node:fs";
import { extname } from "node:path";

// Role → filename slug, in canonical order — must match CARD_ORDER in
// src/types.ts. A deck may select an ordered subset via deck.cards.
export const ROLE_CARDNAMES = {
  cover: "cover",
  summary: "summary",
  definition: "definition",
  compare: "two-stories",
  diagnosis: "diagnosis",
  analysis: "analysis",
  grid: "grid",
  claim: "claim",
  conclusion: "conclusion",
  closing: "closing",
};
export const ALL_ROLES = Object.keys(ROLE_CARDNAMES);

/** The deck's active roles in canonical order. */
export function deckRoles(deck) {
  if (!Array.isArray(deck.cards) || deck.cards.length === 0) return ALL_ROLES;
  const wanted = new Set(deck.cards);
  return ALL_ROLES.filter((r) => wanted.has(r));
}

/** The deck's canvas size (default Instagram 4:5). */
export function deckCanvas(deck) {
  const w = deck.size?.w;
  const h = deck.size?.h;
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { w, h } : { w: 1080, h: 1350 };
}

export function kebab(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The "-knot-NNN" segment is dropped when no issue number is set.
function knotSeg(issue) {
  return issue ? `-knot-${String(issue).padStart(3, "0")}` : "";
}

export function cardFilename(seq, slug, issue, cardname) {
  const nn = String(seq).padStart(2, "0");
  return `${nn}-eigen-knot-weekly-issue-insight-${kebab(slug)}${knotSeg(issue)}-${kebab(cardname)}.png`;
}

export function zipName(slug, issue) {
  return `eigen-knot-weekly-issue-insight-${kebab(slug)}${knotSeg(issue)}.zip`;
}

/** The user's deck name as a filename base, or null if unset. Custom names are
 *  download-only (never URL-served), so Korean/spaces are fine — strip only the
 *  characters OSes forbid in filenames. */
export function customBase(deck) {
  const custom = deck.meta?.customZipName?.trim();
  if (!custom) return null;
  return custom.replace(/[/\\:*?"<>|]+/g, "-").replace(/^[-.\s]+|[-.\s]+$/g, "") || "cards";
}

/** Effective ZIP filename: {deck-name}.zip, or the legacy auto-name. */
export function resolvedZipName(deck) {
  const base = customBase(deck);
  return base ? `${base}.zip` : zipName(deck.meta.slug, deck.meta.issue);
}

/** Effective card PNG filename: {NN}-{deck-name}-{cardname}.png, or the legacy auto-name. */
export function resolvedCardFilename(seq, deck, role) {
  const base = customBase(deck);
  if (base) return `${String(seq).padStart(2, "0")}-${base}-${ROLE_CARDNAMES[role]}.png`;
  return cardFilename(seq, deck.meta.slug, deck.meta.issue, ROLE_CARDNAMES[role]);
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
