import { authed } from "./_auth.js";
import archiver from "archiver";
import { launchBrowser } from "../capture/browser.mjs";
import { captureDeckViaUrl } from "../capture/serverless.mjs";

// POST { deck } → { zipB64, zipName, files, overflowAny }.
// Launches headless Chromium, drives THIS deployment's capture page for all 10
// cards, zips the PNGs in memory, returns base64 (no static file hosting needed).
// Client downscales the photo before sending, so the body stays under Vercel's
// ~4.5MB request limit.

function zipToBuffer(files) {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks = [];
    archive.on("data", (c) => chunks.push(c));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    for (const f of files) archive.append(f.buffer, { name: f.name });
    archive.finalize();
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!authed(req)) return res.status(401).json({ error: "비밀번호가 필요합니다." });

  const { deck } = req.body || {};
  if (!deck || !deck.meta || !deck.meta.issue || !deck.meta.slug)
    return res.status(400).json({ error: "deck.meta.issue / slug가 필요합니다." });
  if (!deck.bg || !String(deck.bg).startsWith("data:"))
    return res.status(400).json({ error: "배경 이미지를 먼저 업로드하세요." });

  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const baseUrl = `${proto}://${host}`;

  let browser;
  try {
    browser = await launchBrowser();
    const { files, overflowAny } = await captureDeckViaUrl(deck, { browser, baseUrl });
    const zip = await zipToBuffer(files);
    res.status(200).json({
      zipB64: zip.toString("base64"),
      zipName: `eigen-knot-weekly-issue-insight-${deck.meta.slug}-knot-${String(deck.meta.issue).padStart(3, "0")}.zip`,
      files: files.map((f) => f.name),
      overflowAny,
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  } finally {
    if (browser) await browser.close();
  }
}
