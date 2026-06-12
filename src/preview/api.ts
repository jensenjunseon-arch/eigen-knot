// Client ↔ studio API. Same relative /api/* endpoints work in `npm run dev`
// (vite middleware) and on Vercel (serverless functions).

const PW_KEY = "ek-pw";
export const getPw = (): string => sessionStorage.getItem(PW_KEY) ?? "";
export const savePw = (pw: string): void => sessionStorage.setItem(PW_KEY, pw);

export async function apiFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-studio-password": getPw() },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((j.error as string) || res.statusText);
  return j as T;
}

export async function checkPassword(pw: string): Promise<{ ok: boolean; open?: boolean }> {
  try {
    const res = await fetch("/api/check", { headers: { "x-studio-password": pw } });
    if (res.status === 200) return (await res.json()) as { ok: boolean; open?: boolean };
  } catch {
    /* no API (e.g. static-only) → treat as open so the UI still loads */
    return { ok: true, open: true };
  }
  return { ok: false };
}

// Background image → dataURL. SVG goes in URL-encoded (base64 SVG fails to decode
// as a headless background); raster is downscaled to ≤maxPx and JPEG-encoded so
// the capture POST stays under Vercel's ~4.5MB body limit.
export function imageToBg(file: File, maxPx = 1440, quality = 0.82): Promise<string> {
  if (file.type === "image/svg+xml") {
    return file.text().then((t) => `data:image/svg+xml,${encodeURIComponent(t)}`);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) return reject(new Error("canvas 2d 컨텍스트 실패"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없습니다."));
    };
    img.src = url;
  });
}

/* ── 첨부 원고 (이미지/PDF) → Claude 멀티모달 입력 ─────────────────────────
   이미지는 ≤1568px JPEG로 줄여(비전 입력 최적 크기 + Vercel 4.5MB 본문 한도),
   PDF는 원본 그대로 base64 (3MB 상한). */
export interface MediaAttachment {
  media_type: string;
  data: string; // base64, dataURL 접두사 없이
  name: string;
}

const PDF_MAX_BYTES = 3 * 1024 * 1024;

export async function fileToMedia(
  file: File,
  msg: { pdfTooBig: string; unsupported: string },
): Promise<MediaAttachment> {
  if (file.type === "application/pdf") {
    if (file.size > PDF_MAX_BYTES) throw new Error(msg.pdfTooBig);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return { media_type: "application/pdf", data: btoa(bin), name: file.name };
  }
  if (file.type.startsWith("image/") && file.type !== "image/svg+xml") {
    const dataUrl = await imageToBg(file, 1568, 0.85);
    return { media_type: "image/jpeg", data: dataUrl.split(",")[1], name: file.name };
  }
  throw new Error(msg.unsupported);
}

// Generated image (base64) → downscaled JPEG dataURL, same pipeline as uploads
// so the capture POST stays small.
export function b64ToBg(b64: string, mime: string, maxPx = 1440, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas 2d context failed"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("generated image failed to decode"));
    img.src = `data:${mime};base64,${b64}`;
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
