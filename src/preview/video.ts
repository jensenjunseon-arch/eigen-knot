// Client-side video encoder: stitch the deck's captured card PNGs into a 9:16
// (or whatever deck.size is) MP4 slideshow with optional BGM — entirely in the
// browser via single-thread ffmpeg.wasm. No server, no COOP/COEP headers.
//
// Why single-thread @ffmpeg/core: it needs NO SharedArrayBuffer, so we don't
// have to cross-origin-isolate the site (which would break the Gemini dataURL
// backgrounds / cross-origin fonts). The job is tiny (≤10 stills, <~30s), so the
// software encoder cost is a few seconds — fine on desktop and a foregrounded phone.
//
// The core (~31MB) is self-hosted at /ffmpeg/ from @ffmpeg/core via the
// copy-ffmpeg-core predev/prebuild script. @ffmpeg/ffmpeg is dynamically
// imported on first use only, so it never inflates the initial bundle.

import type { FFmpeg } from "@ffmpeg/ffmpeg";

export interface AudioInput {
  /** Raw bytes of the chosen track (bundled CC0 or user upload). */
  data: Uint8Array;
  /** File extension ffmpeg sniffs the format from, e.g. "mp3", "m4a", "wav". */
  ext: string;
}

export interface EncodeOptions {
  /** Base64 PNGs (no dataURL prefix), one per card, in order. */
  pngB64s: string[];
  /** Seconds each card is held (hard cut). One entry per image — text-heavy
   *  cards get a longer dwell. Length must match pngB64s. */
  durations: number[];
  /** Canvas size — from deckSize(deck); ffmpeg does no scaling. */
  w: number;
  h: number;
  /** BGM track, or null for a silent video. */
  audio: AudioInput | null;
  /** 0..1 encode progress (ffmpeg's own ratio). */
  onProgress?: (ratio: number) => void;
  /** Coarse phase for the UI: loading the core vs encoding. */
  onPhase?: (phase: "loading" | "encoding") => void;
}

const CORE_URL = "/ffmpeg/ffmpeg-core.js";
const WASM_URL = "/ffmpeg/ffmpeg-core.wasm";

let ffmpegRef: FFmpeg | null = null;

// Load (once) and cache the ffmpeg.wasm instance. Lazy dynamic import keeps the
// ~big worker + core out of the initial bundle until the user actually exports.
// The core .js/.wasm are pulled through toBlobURL → blob: URLs, so Vite's module
// transform never intercepts them (a plain coreURL gets a "?import" suffix and
// fails to load as a module).
async function loadFfmpeg(): Promise<FFmpeg> {
  if (ffmpegRef) return ffmpegRef;
  if (typeof window === "undefined") throw new Error("ffmpeg.wasm runs in the browser only.");
  const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL(CORE_URL, "text/javascript"),
    toBlobURL(WASM_URL, "application/wasm"),
  ]);
  const ff = new FFmpeg();
  await ff.load({ coreURL, wasmURL });
  ffmpegRef = ff;
  return ff;
}

const b64ToBytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const pad3 = (n: number): string => String(n).padStart(3, "0");

// concat-demuxer list. Each `file` precedes its own `duration`; the LAST image is
// repeated once WITHOUT a duration so the final card holds its full time (the
// demuxer uses each duration only to advance to the NEXT entry).
function concatList(durations: number[]): string {
  const lines: string[] = [];
  for (let i = 0; i < durations.length; i++) {
    lines.push(`file img${pad3(i)}.png`, `duration ${durations[i].toFixed(3)}`);
  }
  lines.push(`file img${pad3(durations.length - 1)}.png`);
  return lines.join("\n") + "\n";
}

// Encode the slideshow → MP4 Blob. Hard cuts only (no pan/zoom): -vsync cfr
// duplicates frames rather than interpolating. -pix_fmt yuv420p is MANDATORY or
// the file plays black on iOS/QuickTime. -t bounds the looped BGM deterministically.
export async function encodeSlideshow(opts: EncodeOptions): Promise<Blob> {
  const { pngB64s, durations, audio, onProgress, onPhase } = opts;
  if (!pngB64s.length) throw new Error("No images to encode.");
  if (durations.length !== pngB64s.length) throw new Error("durations must match the number of images.");

  onPhase?.("loading");
  const ff = await loadFfmpeg();

  const total = +durations.reduce((a, b) => a + b, 0).toFixed(3);
  const written: string[] = [];
  const onProg = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  ff.on("progress", onProg);

  try {
    for (let i = 0; i < pngB64s.length; i++) {
      const name = `img${pad3(i)}.png`;
      await ff.writeFile(name, b64ToBytes(pngB64s[i]));
      written.push(name);
    }
    await ff.writeFile("list.txt", new TextEncoder().encode(concatList(durations)));
    written.push("list.txt");

    const args = ["-f", "concat", "-safe", "0", "-i", "list.txt"];
    if (audio) {
      const aname = `bgm.${audio.ext || "mp3"}`;
      await ff.writeFile(aname, audio.data);
      written.push(aname);
      // Fade the music out so the end never cuts abruptly: a generous tail
      // (≈25% of the clip, clamped 3–5s) that reaches full silence right at the
      // end. afadeout `st` is the start of the fade; it hits 0 at st+d = total.
      const fadeDur = Math.max(3, Math.min(5, +(total * 0.25).toFixed(3)));
      const fadeStart = Math.max(0, +(total - fadeDur).toFixed(3));
      args.push(
        "-stream_loop", "-1", "-i", aname,
        "-map", "0:v", "-map", "1:a",
        "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
        "-af", `afade=t=out:st=${fadeStart}:d=${fadeDur}`,
      );
    }
    args.push(
      "-vsync", "cfr", "-r", "30",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-pix_fmt", "yuv420p", "-profile:v", "high", "-level:v", "4.0",
      "-t", String(total), "-movflags", "+faststart", "out.mp4",
    );

    onPhase?.("encoding");
    await ff.exec(args);

    const out = await ff.readFile("out.mp4");
    const bytes = out instanceof Uint8Array ? out : new TextEncoder().encode(out as string);
    // Copy into a fresh buffer so freeing MEMFS below can't invalidate the Blob.
    return new Blob([bytes.slice()], { type: "video/mp4" });
  } finally {
    ff.off("progress", onProg);
    // Free MEMFS so repeated exports don't grow the wasm heap (iOS OOM guard).
    for (const f of [...written, "out.mp4"]) {
      try {
        await ff.deleteFile(f);
      } catch {
        /* not all files exist on the error path */
      }
    }
  }
}
