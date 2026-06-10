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

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
