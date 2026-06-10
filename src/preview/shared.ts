// Shared between the capture page and the studio: overflow detection.
// Vertical: content bottom past this Y collides with the watermark / leaves the
// safe area. Horizontal: any element wider than its container (e.g. a nowrap
// line that no longer fits) silently clips at the canvas edge — flag it too.
export const OVERFLOW_LIMIT = 1180;

export function bodyBottom(root: HTMLElement | null): number {
  const body = root?.querySelector<HTMLElement>("[data-ekbody]");
  return body ? body.offsetTop + body.scrollHeight : 0;
}

export function hasHOverflow(root: HTMLElement | null): boolean {
  const body = root?.querySelector<HTMLElement>("[data-ekbody]");
  if (!body) return false;
  if (body.scrollWidth > body.clientWidth + 1) return true;
  // nowrap spans can overflow their parent without growing scrollWidth when an
  // ancestor clips — compare every descendant's right edge to the body's.
  const limit = body.getBoundingClientRect().right + 1;
  return [...body.querySelectorAll<HTMLElement>("*")].some(
    (el) => el.getBoundingClientRect().right > limit,
  );
}

export function cardOverflow(root: HTMLElement | null): { v: boolean; h: boolean } {
  return { v: bodyBottom(root) > OVERFLOW_LIMIT, h: hasHOverflow(root) };
}
