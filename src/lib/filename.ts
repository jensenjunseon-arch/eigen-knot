// Output filename rules (PRD §4.2, §11.4). Anything that may be served over a
// URL must be ASCII kebab-case — no spaces, no Korean, no special chars (a space
// becomes %20 and some import APIs choke on it).

import type { Deck, CardRole } from "@/types";
import { CARD_ORDER } from "@/types";

export function kebab(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// {NN}-eigen-knot-weekly-issue-insight-{slug}-knot-{NNN}-{cardname}.png
export function cardFilename(seq: number, slug: string, issue: number, cardname: string): string {
  const nn = String(seq).padStart(2, "0");
  const nnn = String(issue).padStart(3, "0");
  return `${nn}-eigen-knot-weekly-issue-insight-${kebab(slug)}-knot-${nnn}-${kebab(cardname)}.png`;
}

// eigen-knot-weekly-issue-insight-{slug}-knot-{NNN}.zip
export function zipName(slug: string, issue: number): string {
  const nnn = String(issue).padStart(3, "0");
  return `eigen-knot-weekly-issue-insight-${kebab(slug)}-knot-${nnn}.zip`;
}

const ROLE_CARDNAMES = Object.fromEntries(CARD_ORDER.map((s) => [s.role, s.cardname])) as Record<CardRole, string>;

/** The user's deck name as a filename base, or null if unset. Custom names are
 *  download-only (never URL-served), so Korean/spaces are fine — strip only the
 *  characters OSes forbid in filenames. */
export function customBase(deck: Deck): string | null {
  const custom = deck.meta.customZipName?.trim();
  if (!custom) return null;
  return custom.replace(/[/\\:*?"<>|]+/g, "-").replace(/^[-.\s]+|[-.\s]+$/g, "") || "cards";
}

/** Effective ZIP filename: {deck-name}.zip, or the legacy auto-name. */
export function resolvedZipName(deck: Deck): string {
  const base = customBase(deck);
  return base ? `${base}.zip` : zipName(deck.meta.slug, deck.meta.issue);
}

/** Effective card PNG filename: {NN}-{deck-name}-{cardname}.png, or the legacy auto-name. */
export function resolvedCardFilename(seq: number, deck: Deck, role: CardRole): string {
  const base = customBase(deck);
  if (base) return `${String(seq).padStart(2, "0")}-${base}-${ROLE_CARDNAMES[role]}.png`;
  return cardFilename(seq, deck.meta.slug, deck.meta.issue, ROLE_CARDNAMES[role]);
}
