// Output filename rules (PRD §4.2, §11.4). Anything that may be served over a
// URL must be ASCII kebab-case — no spaces, no Korean, no special chars (a space
// becomes %20 and some import APIs choke on it).

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
