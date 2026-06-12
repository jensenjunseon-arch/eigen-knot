// Dev-server API for the studio UI. Mounted as a Vite plugin middleware —
// localhost only. Mirrors the Vercel functions exactly (same endpoints, same
// shapes), so the client has ONE code path for dev and prod:
//   GET  /api/check                   → password probe
//   POST /api/analyze { body, meta }  → { title, cards, content } (Claude)
//   POST /api/capture-card { deck, index } → { name, b64, overflow, total }
//
// Capture drives THIS dev server's own /?capture=1 page with a resident local
// Playwright browser (launched once, reused) — fast per-card iterations.

import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvVar(name) {
  if (process.env[name]) return process.env[name];
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return null;
  const m = readFileSync(envPath, "utf8").match(new RegExp(`^\\s*${name}\\s*=\\s*"?([^"\\n]+)"?\\s*$`, "m"));
  return m ? m[1].trim() : null;
}
const loadEnvKey = () => loadEnvVar("ANTHROPIC_API_KEY");

function readJsonBody(req, limitMb = 64) {
  return new Promise((res, rej) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limitMb * 1024 * 1024) {
        rej(new Error(`body > ${limitMb}MB`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        res(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        rej(e);
      }
    });
    req.on("error", rej);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function authed(req) {
  const pw = process.env.STUDIO_PASSWORD;
  if (!pw) return true;
  return (req.headers["x-studio-password"] || "") === pw;
}

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = import("playwright")
      .then(({ chromium }) => chromium.launch())
      .catch((e) => {
        browserPromise = null;
        throw e;
      });
  }
  return browserPromise;
}

export function devApi() {
  return {
    name: "ek-dev-api",
    configureServer(server) {
      server.httpServer?.on("close", async () => {
        const b = await browserPromise?.catch(() => null);
        await b?.close().catch(() => {});
      });

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost");

        /* ── check (login probe) ─────────────────────────────────── */
        if (url.pathname === "/api/check") {
          if (!process.env.STUDIO_PASSWORD) return sendJson(res, 200, { ok: true, open: true });
          return authed(req) ? sendJson(res, 200, { ok: true }) : sendJson(res, 401, { ok: false });
        }

        /* ── analyze ─────────────────────────────────────────────── */
        if (req.method === "POST" && url.pathname === "/api/analyze") {
          try {
            if (!authed(req)) return sendJson(res, 401, { error: "비밀번호가 필요합니다." });
            const key = loadEnvKey();
            if (!key) {
              return sendJson(res, 400, {
                error: "ANTHROPIC_API_KEY가 없습니다. 프로젝트 루트의 .env에 추가하세요.",
              });
            }
            process.env.ANTHROPIC_API_KEY = key;
            const { body, meta, model, media } = await readJsonBody(req, 8);
            if (!body?.trim() && !media?.length) return sendJson(res, 400, { error: "본문이 비어 있습니다." });
            if (body && body.length > 50_000)
              return sendJson(res, 400, { error: `본문이 너무 깁니다 (${body.length.toLocaleString()}자). 50,000자 이하로 줄여 주세요.` });
            const { analyzeArticle } = await import("../content/analyze.mjs");
            const result = await analyzeArticle(body, meta, { model: model || "sonnet", media: media || [] });
            return sendJson(res, 200, result); // { title, cards, content }
          } catch (e) {
            return sendJson(res, 500, { error: String(e?.message ?? e) });
          }
        }

        /* ── generate background (Gemini) ────────────────────────── */
        if (req.method === "POST" && url.pathname === "/api/generate-bg") {
          try {
            if (!authed(req)) return sendJson(res, 401, { error: "Password required." });
            const key = loadEnvVar("GEMINI_API_KEY");
            if (!key) return sendJson(res, 400, { error: "GEMINI_API_KEY is not set (.env)." });
            const { prompt, w, h } = await readJsonBody(req, 1);
            if (!prompt?.trim()) return sendJson(res, 400, { error: "prompt is required" });
            if (prompt.length > 600) return sendJson(res, 400, { error: "prompt too long" });
            const target = (Number(w) || 1080) / (Number(h) || 1350);
            let bestA = "4:5";
            let bestD = Infinity;
            for (const a of ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]) {
              const [aw, ah] = a.split(":").map(Number);
              const d = Math.abs(aw / ah - target);
              if (d < bestD) {
                bestD = d;
                bestA = a;
              }
            }
            const frame =
              `Generate a single atmospheric photographic background image for an editorial Instagram card. ` +
              `White typography will be overlaid on it, so the image must be dark, muted, slightly underexposed, ` +
              `with soft focus and gentle depth. Cinematic, minimal, calm. ` +
              `Absolutely no text, no letters, no numbers, no watermark, no logo, no border, no frame. ` +
              `Subject and mood: ${prompt.trim()}`;
            const r = await fetch(
              "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
              {
                method: "POST",
                headers: { "content-type": "application/json", "x-goog-api-key": key },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: frame }] }],
                  generationConfig: { imageConfig: { aspectRatio: bestA } },
                }),
              },
            );
            const j = await r.json().catch(() => ({}));
            if (!r.ok) return sendJson(res, 502, { error: j?.error?.message || `Gemini API ${r.status}` });
            const part = j?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
            if (!part) return sendJson(res, 502, { error: "Gemini returned no image." });
            return sendJson(res, 200, { b64: part.inlineData.data, mime: part.inlineData.mimeType || "image/png" });
          } catch (e) {
            return sendJson(res, 500, { error: String(e?.message ?? e) });
          }
        }

        /* ── capture one card ────────────────────────────────────── */
        if (req.method === "POST" && url.pathname === "/api/capture-card") {
          try {
            if (!authed(req)) return sendJson(res, 401, { error: "비밀번호가 필요합니다." });
            const { deck, index } = await readJsonBody(req, 64);
            if (!deck?.meta?.slug || !Number.isInteger(index))
              return sendJson(res, 400, { error: "deck과 index가 필요합니다." });
            if (!deck.bg?.startsWith("data:"))
              return sendJson(res, 400, { error: "배경 이미지를 먼저 업로드하세요." });

            const { captureCardViaUrl } = await import("../capture/serverless.mjs");
            const browser = await getBrowser();
            const host = req.headers.host ?? "localhost:5173";
            const card = await captureCardViaUrl(deck, index, { browser, baseUrl: `http://${host}` });
            return sendJson(res, 200, {
              name: card.name,
              b64: card.buffer.toString("base64"),
              overflow: card.overflow,
              total: card.total,
            });
          } catch (e) {
            return sendJson(res, 500, { error: String(e?.message ?? e) });
          }
        }

        next();
      });
    },
  };
}
