// Shared between the capture page and the studio: overflow detection.
// Content bottom past this Y collides with the watermark / leaves the safe area.
export const OVERFLOW_LIMIT = 1180;

export function bodyBottom(root: HTMLElement | null): number {
  const body = root?.querySelector<HTMLElement>("[data-ekbody]");
  return body ? body.offsetTop + body.scrollHeight : 0;
}
