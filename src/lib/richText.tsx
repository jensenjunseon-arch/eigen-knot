import { Fragment, type ReactNode } from "react";

// Inline rich text: "\n" → <br/>, "<b>…</b>" → bold emphasis (white, weight 600).
// Wine is applied at the component level on designated slots only — never from
// <b> — to keep the accent scarce (≤5×/deck, PRD §2.1, §10).
export function Rich({ text }: { text: string }): ReactNode {
  return text.split("\n").map((line, li) => (
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
