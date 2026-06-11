// Browser-agnostic capture core. Renders the deck by injecting it into the
// built React app, then screenshots the card element.
//
// Two navigation modes:
//   baseUrl provided  → HTTP navigation (Vite dev server; local dev only)
//   baseUrl absent    → route interception (serve dist/ from Lambda disk; Vercel)
//
// The route-interception path eliminates the loopback HTTP dependency.
// Fonts, JS, and CSS load from the Lambda filesystem without any network I/O,
// avoiding the loopback request + Korean font download that previously caused
// Chrome to crash in --single-process / memory-constrained environments.

import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { ROLE_CARDNAMES, deckRoles, deckCanvas, resolvedCardFilename } from "../scripts/shared.mjs";

// dist/ location: module-relative first (survives whatever cwd the serverless
// runtime uses), then cwd as fallback. includeFiles in vercel.json ships the
// folder into the function bundle preserving the project-root-relative path.
function resolveDistDir() {
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), "..", "dist"),
    join(process.cwd(), "dist"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function getMime(name) {
  return MIME[extname(name).toLowerCase()] ?? "application/octet-stream";
}

/** Capture ONE card by index into the deck's active roles.
 *  When baseUrl is omitted (Vercel serverless), all HTTP requests from Chromium
 *  are intercepted and served from dist/ on the Lambda filesystem — no outbound
 *  network calls, no loopback latency, no font-download races. */
export async function captureCardViaUrl(deck, index, { browser, baseUrl, scale = 1 }) {
  const { w, h } = deckCanvas(deck);
  const roles = deckRoles(deck);
  const i = Math.min(Math.max(index, 0), roles.length - 1);

  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await ctx.addInitScript((d) => {
    window.__EK_DECK__ = d;
  }, deck);

  if (!baseUrl) {
    const distDir = resolveDistDir();
    await ctx.route("**/*", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const resolved = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
      try {
        const body = readFileSync(join(distDir, resolved));
        await route.fulfill({ body, contentType: getMime(resolved) });
      } catch {
        await route.abort();
      }
    });
  }

  let primaryErr;
  try {
    const page = await ctx.newPage();
    const captureUrl = baseUrl
      ? `${baseUrl.replace(/\/$/, "")}/?capture=1&i=${i}`
      : `http://localhost/?capture=1&i=${i}`;
    await page.goto(captureUrl, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => window.__EK_READY__ === true, undefined, { timeout: 25000 });
    const overflow = await page.evaluate(() => window.__EK_OVERFLOW__ === true);
    const buffer = await page.locator(".ek-card").screenshot({ type: "png" });
    return {
      name: resolvedCardFilename(i + 1, deck, roles[i]),
      buffer,
      overflow,
      total: roles.length,
    };
  } catch (e) {
    primaryErr = e;
    throw e;
  } finally {
    try {
      await ctx.close();
    } catch (closeErr) {
      if (!primaryErr) throw closeErr;
    }
  }
}

export async function captureDeckViaUrl(deck, { browser, baseUrl, scale = 1 }) {
  const { w, h } = deckCanvas(deck);
  const roles = deckRoles(deck);

  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await ctx.addInitScript((d) => {
    window.__EK_DECK__ = d;
  }, deck);

  if (!baseUrl) {
    const distDir = resolveDistDir();
    await ctx.route("**/*", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const resolved = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
      try {
        const body = readFileSync(join(distDir, resolved));
        await route.fulfill({ body, contentType: getMime(resolved) });
      } catch {
        await route.abort();
      }
    });
  }

  const base = baseUrl ? baseUrl.replace(/\/$/, "") : "http://localhost";
  const page = await ctx.newPage();
  const files = [];
  let overflowAny = false;
  let primaryErr;
  try {
    for (let i = 0; i < roles.length; i++) {
      await page.goto(`${base}/?capture=1&i=${i}`, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(() => window.__EK_READY__ === true, undefined, { timeout: 25000 });
      const overflow = await page.evaluate(() => window.__EK_OVERFLOW__ === true);
      if (overflow) overflowAny = true;
      const buffer = await page.locator(".ek-card").screenshot({ type: "png" });
      files.push({
        name: resolvedCardFilename(i + 1, deck, roles[i]),
        buffer,
        overflow,
      });
    }
  } catch (e) {
    primaryErr = e;
    throw e;
  } finally {
    try {
      await ctx.close();
    } catch (closeErr) {
      if (!primaryErr) throw closeErr;
    }
  }
  return { files, overflowAny };
}
