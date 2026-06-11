// M2 — capture each card to a 1080×1350 PNG via Playwright (PRD §5.3, §11.2).
// Native viewport + element screenshot = no scaling bug, no background dropout.
// The deck (with an inlined-dataURL bg) is injected once via addInitScript; each
// card waits for window.__EK_READY__ (fonts really loaded + bg decoded) before
// the shot.

import { build, preview } from "vite";
import { chromium } from "playwright";
import archiver from "archiver";
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve, basename } from "node:path";
import { resolvedZipName } from "../scripts/shared.mjs";
import { captureDeckViaUrl } from "./serverless.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function captureDeck(deck, { outDir, scale = 1, port = 5180, zip = true, forceBuild = false } = {}) {
  const out = resolve(outDir ?? join(ROOT, "output"));
  mkdirSync(out, { recursive: true });

  if (forceBuild || !existsSync(join(ROOT, "dist", "index.html"))) {
    console.log("· vite build (app bundle)…");
    await build({ root: ROOT, logLevel: "error" });
  }

  console.log("· starting preview server…");
  const server = await preview({ root: ROOT, preview: { port, strictPort: false } });
  const baseUrl = server.resolvedUrls.local[0].replace(/\/$/, "");

  const browser = await chromium.launch();
  const { files, overflowAny } = await captureDeckViaUrl(deck, { browser, baseUrl, scale });

  const written = [];
  for (const f of files) {
    const path = join(out, f.name);
    writeFileSync(path, f.buffer);
    written.push({ file: f.name, path, overflow: f.overflow });
    if (f.overflow) console.warn(`  ⚠ ${f.name} — overflows safe area (trim copy / lower 폰트 크기)`);
    console.log(`  ✓ ${f.name}`);
  }

  await browser.close();
  await new Promise((r) => {
    if (server.httpServer?.listening) server.httpServer.close(() => r());
    else r();
  });

  let zipPath = null;
  if (zip) {
    zipPath = join(out, resolvedZipName(deck));
    await zipFiles(
      written.map((w) => w.path),
      zipPath,
    );
    console.log(`  ✓ ${basename(zipPath)}`);
  }

  return { outDir: out, files: written, zipPath, overflowAny };
}

function zipFiles(paths, zipPath) {
  return new Promise((res, rej) => {
    const stream = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    stream.on("close", () => res());
    archive.on("error", rej);
    archive.pipe(stream);
    for (const p of paths) archive.file(p, { name: basename(p) });
    archive.finalize();
  });
}

// Direct entry: `node capture/capture.mjs <complete-deck.json> [outDir]` (deck
// already has meta + content + inlined bg). Used by the studio's /api/capture;
// normal CLI use is via scripts/generate.mjs.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const deckPath = process.argv[2];
  if (!deckPath) {
    console.error("usage: node capture/capture.mjs <deck.json> [outDir]");
    process.exit(1);
  }
  const { readFileSync } = await import("node:fs");
  const deck = JSON.parse(readFileSync(resolve(deckPath), "utf8"));
  const res = await captureDeck(deck, { outDir: process.argv[3], forceBuild: true });
  console.log(`\nDone → ${res.outDir}`);
  process.exit(0);
}
