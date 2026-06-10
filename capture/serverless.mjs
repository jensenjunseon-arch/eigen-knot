// Browser-agnostic capture core. Given an already-launched browser and the base
// URL of a DEPLOYED build of this app, it screenshots the deck's active cards by
// navigating to the app's own capture page (?capture=1&i=N) and injecting the
// deck. Fonts load from that same deployment, so headless rendering matches the
// studio. Viewport follows the deck's canvas size (platform presets).
//
// Used by the Vercel function (api/capture.js, @sparticuz/chromium browser) AND
// by the local pipeline verifier — same code path.

import { ROLE_CARDNAMES, deckRoles, deckCanvas, cardFilename } from "../scripts/shared.mjs";

/** Capture ONE card (by index into the deck's active roles). Used by the
 *  per-card API route — each invocation stays well under serverless duration
 *  and response-size limits, and the browser is reused across warm calls. */
export async function captureCardViaUrl(deck, index, { browser, baseUrl, scale = 1 }) {
  const base = baseUrl.replace(/\/$/, "");
  const { w, h } = deckCanvas(deck);
  const roles = deckRoles(deck);
  const i = Math.min(Math.max(index, 0), roles.length - 1);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await ctx.addInitScript((d) => {
    window.__EK_DECK__ = d;
  }, deck);
  try {
    const page = await ctx.newPage();
    await page.goto(`${base}/?capture=1&i=${i}`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => window.__EK_READY__ === true, undefined, { timeout: 25000 });
    const overflow = await page.evaluate(() => window.__EK_OVERFLOW__ === true);
    const buffer = await page.locator(".ek-card").screenshot({ type: "png" });
    return {
      name: cardFilename(i + 1, deck.meta.slug, deck.meta.issue, ROLE_CARDNAMES[roles[i]]),
      buffer,
      overflow,
      total: roles.length,
    };
  } finally {
    await ctx.close();
  }
}

export async function captureDeckViaUrl(deck, { browser, baseUrl, scale = 1 }) {
  const base = baseUrl.replace(/\/$/, "");
  const { w, h } = deckCanvas(deck);
  const roles = deckRoles(deck);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await ctx.addInitScript((d) => {
    window.__EK_DECK__ = d;
  }, deck);

  const page = await ctx.newPage();
  const files = [];
  let overflowAny = false;
  try {
    for (let i = 0; i < roles.length; i++) {
      await page.goto(`${base}/?capture=1&i=${i}`, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(() => window.__EK_READY__ === true, undefined, { timeout: 25000 });
      const overflow = await page.evaluate(() => window.__EK_OVERFLOW__ === true);
      if (overflow) overflowAny = true;
      const buffer = await page.locator(".ek-card").screenshot({ type: "png" });
      files.push({
        name: cardFilename(i + 1, deck.meta.slug, deck.meta.issue, ROLE_CARDNAMES[roles[i]]),
        buffer,
        overflow,
      });
    }
  } finally {
    await ctx.close();
  }
  return { files, overflowAny };
}
