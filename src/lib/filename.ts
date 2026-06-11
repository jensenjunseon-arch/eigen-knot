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

/** Returns the effective ZIP filename, respecting the custom override if set. */
export function resolvedZipName(deck: Deck): string {
  const custom = deck.meta.customZipName?.trim();
  if (custom) return `${kebab(custom) || "export"}.zip`;
  return zipName(deck.meta.slug, deck.meta.issue);
}

/** Returns the effective card PNG filename, respecting the per-role custom override if set. */
export function resolvedCardFilename(seq: number, deck: Deck, role: CardRole): string {
  const custom = deck.meta.customCardNames?.[role]?.trim();
  if (custom) return `${kebab(custom) || "card"}.png`;
  return cardFilename(seq, deck.meta.slug, deck.meta.issue, ROLE_CARDNAMES[role]);
}
