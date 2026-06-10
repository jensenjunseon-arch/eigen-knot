// Browser-agnostic capture core. Given an already-launched browser and the base
// URL of a DEPLOYED build of this app, it screenshots all 10 cards by navigating
// to the app's own capture page (?capture=1&i=N) and injecting the deck. Fonts
// load from that same deployment, so headless rendering matches the studio.
//
// Used by the Vercel function (api/capture.js, @sparticuz/chromium browser) AND
// by the local verifier (full playwright + vite preview) — same code path.

import { CARD_NAMES, CARD_COUNT, cardFilename } from "../scripts/shared.mjs";

export async function captureDeckViaUrl(deck, { browser, baseUrl, scale = 1 }) {
  const base = baseUrl.replace(/\/$/, "");
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: scale });
  // Inject the deck (bg already a dataURL) for every page in the context.
  await ctx.addInitScript((d) => {
    window.__EK_DECK__ = d;
  }, deck);

  const page = await ctx.newPage();
  const files = [];
  let overflowAny = false;
  try {
    for (let i = 0; i < CARD_COUNT; i++) {
      await page.goto(`${base}/?capture=1&i=${i}`, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(() => window.__EK_READY__ === true, undefined, { timeout: 25000 });
      const overflow = await page.evaluate(() => window.__EK_OVERFLOW__ === true);
      if (overflow) overflowAny = true;
      const buffer = await page.locator(".ek-card").screenshot({ type: "png" });
      files.push({
        name: cardFilename(i + 1, deck.meta.slug, deck.meta.issue, CARD_NAMES[i]),
        buffer,
        overflow,
      });
    }
  } finally {
    await ctx.close();
  }
  return { files, overflowAny };
}
