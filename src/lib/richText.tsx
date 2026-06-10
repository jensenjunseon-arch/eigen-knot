import { Fragment, type ReactNode } from "react";

// Inline rich text: "\n" → <br/>, "<b>…</b>" → bold emphasis (white, weight 600).
// Accent color is applied at the component level on designated slots only —
// never from <b> — to keep it scarce (≤5×/deck, PRD §2.1, §10).
// Literal "\n" (backslash+n, e.g. from AI JSON or hand-typed) is normalized to a
// real newline so line breaks survive every input path.
export function Rich({ text }: { text: string }): ReactNode {
  return text.replace(/\\n/g, "\n").split("\n").map((line, li) => (
    <Fragment key={li}>
      {li > 0 && <br />}
      {line.split(/(<b>.*?<\/b>)/g).map((part, pi) =>
        part.startsWith("<b>") && part.endsWith("</b>") ? (
          <strong key={pi} style={{ fontWeight: 600 }}>
            {part.slice(3, -4)}
          </strong>
        ) : (
          <Fragment key={pi}>{part}</Fragment>
        ),
      )}
    </Fragment>
  ));
}

// Strip markup → plain text (overflow measurement, alt text).
export function plain(text: string): string {
  return text.replace(/<\/?b>/g, "").replace(/\n/g, " ");
}
