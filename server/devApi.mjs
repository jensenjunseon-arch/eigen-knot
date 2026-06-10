// Dev-server API for the studio UI (M4). Mounted as a Vite plugin middleware —
// localhost only. Two endpoints:
//   POST /api/analyze  { body, meta }        → DeckContent JSON (Claude, M3)
//   POST /api/capture  { deck }              → runs the Playwright pipeline,
//                                              returns { zipUrl, files, overflowAny }
//   GET  /api/zip?issue=issue-014&file=….zip → serves the finished archive
//
// The capture runs in a CHILD process (node capture/capture.mjs) so a Playwright
// crash can never take down the dev server, and the capture page always uses the
// freshly built bundle.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, createReadStream, statSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader (just ANTHROPIC_API_KEY) — no dotenv dependency.
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
  const body = JSON.stringify(obj);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

// Mirror api/_auth.js so dev behaves like prod when STUDIO_PASSWORD is set.
function authed(req) {
  const pw = process.env.STUDIO_PASSWORD;
  if (!pw) return true;
  return (req.headers["x-studio-password"] || "") === pw;
}

export function devApi() {
  return {
    name: "ek-dev-api",
    configureServer(server) {
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
                error:
                  "ANTHROPIC_API_KEY가 없습니다. 프로젝트 루트의 .env에 ANTHROPIC_API_KEY=sk-ant-... 를 추가하세요.",
              });
            }
            process.env.ANTHROPIC_API_KEY = key;
            const { body, meta, model } = await readJsonBody(req, 4);
            if (!body?.trim()) return sendJson(res, 400, { error: "본문이 비어 있습니다." });
            const { analyzeArticle } = await import("../content/analyze.mjs");
            const content = await analyzeArticle(body, meta, { model: model || "sonnet" });
            return sendJson(res, 200, { content });
          } catch (e) {
            return sendJson(res, 500, { error: String(e?.message ?? e) });
          }
        }

        /* ── capture ─────────────────────────────────────────────── */
        if (req.method === "POST" && url.pathname === "/api/capture") {
          try {
            if (!authed(req)) return sendJson(res, 401, { error: "비밀번호가 필요합니다." });
            const { deck } = await readJsonBody(req, 64);
            if (!deck?.meta?.issue || !deck?.meta?.slug)
              return sendJson(res, 400, { error: "deck.meta.issue / slug가 필요합니다." });
            if (!deck.bg?.startsWith("data:"))
              return sendJson(res, 400, { error: "배경 이미지를 먼저 업로드하세요." });

            const issueDir = `issue-${String(deck.meta.issue).padStart(3, "0")}`;
            const outDir = join(ROOT, "output", issueDir);
            mkdirSync(outDir, { recursive: true });
            // Clear stale outputs — re-exports with fewer cards or a different
            // numbering must not leave orphan files from the previous run.
            for (const f of readdirSync(outDir)) {
              if (f.endsWith(".png") || f.endsWith(".zip")) rmSync(join(outDir, f), { force: true });
            }
            const tmpDeck = join(outDir, ".studio-deck.json");
            writeFileSync(tmpDeck, JSON.stringify(deck));

            const log = [];
            const code = await new Promise((done) => {
              const child = spawn(process.execPath, [join(ROOT, "capture/capture.mjs"), tmpDeck, outDir], {
                cwd: ROOT,
                stdio: ["ignore", "pipe", "pipe"],
              });
              child.stdout.on("data", (d) => log.push(d.toString()));
              child.stderr.on("data", (d) => log.push(d.toString()));
              child.on("close", done);
            });
            const text = log.join("");
            if (code !== 0) return sendJson(res, 500, { error: "capture 실패", log: text });

            const zipFile = (text.match(/✓ (eigen-knot-[a-z0-9-]+\.zip)/) || [])[1] ?? null;
            const zipPath = zipFile ? join(outDir, zipFile) : null;
            const zipB64 = zipPath && existsSync(zipPath) ? readFileSync(zipPath).toString("base64") : null;
            return sendJson(res, 200, {
              ok: true,
              overflowAny: text.includes("⚠"),
              files: [...text.matchAll(/✓ (\S+\.png)/g)].map((m) => m[1]),
              zipB64,
              zipName: zipFile,
              log: text,
            });
          } catch (e) {
            return sendJson(res, 500, { error: String(e?.message ?? e) });
          }
        }

        /* ── zip download ────────────────────────────────────────── */
        if (req.method === "GET" && url.pathname === "/api/zip") {
          const issue = url.searchParams.get("issue") ?? "";
          const file = url.searchParams.get("file") ?? "";
          // Strict allow-list — these land in a Content-Disposition filename.
          if (!/^issue-\d{3}$/.test(issue) || !/^[a-z0-9.-]+\.zip$/.test(file)) {
            return sendJson(res, 400, { error: "bad params" });
          }
          const p = join(ROOT, "output", issue, file);
          if (!existsSync(p)) return sendJson(res, 404, { error: "not found" });
          res.writeHead(200, {
            "content-type": "application/zip",
            "content-length": statSync(p).size,
            "content-disposition": `attachment; filename="${file}"`,
          });
          return createReadStream(p).pipe(res);
        }

        next();
      });
    },
  };
}
