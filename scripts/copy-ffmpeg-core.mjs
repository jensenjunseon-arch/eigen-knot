// Self-host the ffmpeg.wasm single-thread core. The ~31MB wasm is not bundled by
// Vite; we copy it into public/ffmpeg/ so it ships from our own origin (no CDN
// runtime dependency, no CSP connect-src tweak). Wired as predev/prebuild so it
// is always in sync with the pinned @ffmpeg/core version.
//
// Single-thread core only (ffmpeg-core.js + ffmpeg-core.wasm) — no worker file,
// so no SharedArrayBuffer / COOP-COEP requirement.
//
// We copy the ESM core (dist/esm), not UMD: @ffmpeg/ffmpeg 0.12 always spawns its
// classWorker as a `type:"module"` worker, where importScripts() (the UMD path)
// throws and it falls back to `import(coreURL)` — which needs an ES module whose
// default export is createFFmpegCore.

import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "node_modules", "@ffmpeg", "core", "dist", "esm");
const DEST = join(ROOT, "public", "ffmpeg");
const FILES = ["ffmpeg-core.js", "ffmpeg-core.wasm"];

if (!existsSync(SRC)) {
  console.error(`[copy-ffmpeg-core] source not found: ${SRC}\nRun \`npm i @ffmpeg/core\` first.`);
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });
for (const f of FILES) {
  copyFileSync(join(SRC, f), join(DEST, f));
}
console.log(`[copy-ffmpeg-core] copied ${FILES.join(", ")} → public/ffmpeg/`);
