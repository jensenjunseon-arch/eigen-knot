// Shared between the capture page and the studio: overflow detection.
// Vertical: content bottom past the watermark zone (~170px above the bottom at
// the 1350 reference, scaled). Horizontal: any element wider than the body —
// a nowrap line that no longer fits silently clips at the canvas edge.

export function overflowLimit(h: number): number {
  return h - Math.round(170 * (h / 1350));
}

export function bodyBottom(root: HTMLElement | null): number {
  const body = root?.querySelector<HTMLElement>("[data-ekbody]");
  return body ? body.offsetTop + body.scrollHeight : 0;
}

export function hasHOverflow(root: HTMLElement | null): boolean {
  const body = root?.querySelector<HTMLElement>("[data-ekbody]");
  if (!body) return false;
  if (body.scrollWidth > body.clientWidth + 1) return true;
  const limit = body.getBoundingClientRect().right + 1;
  return [...body.querySelectorAll<HTMLElement>("*")].some(
    (el) => el.getBoundingClientRect().right > limit,
  );
}

export function cardOverflow(root: HTMLElement | null, h = 1350): { v: boolean; h: boolean } {
  return { v: bodyBottom(root) > overflowLimit(h), h: hasHOverflow(root) };
}
