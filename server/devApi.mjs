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

function loadEnvKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return null;
  const m = readFileSync(envPath, "utf8").match(/^\s*ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?\s*$/m);
  return m ? m[1].trim() : null;
}

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
            const { body, meta, model } = await readJsonBody(req, 4);
            if (!body?.trim()) return sendJson(res, 400, { error: "본문이 비어 있습니다." });
            if (body.length > 50_000)
              return sendJson(res, 400, { error: `본문이 너무 깁니다 (${body.length.toLocaleString()}자). 50,000자 이하로 줄여 주세요.` });
            const { analyzeArticle } = await import("../content/analyze.mjs");
            const result = await analyzeArticle(body, meta, { model: model || "sonnet" });
            return sendJson(res, 200, result); // { title, cards, content }
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
