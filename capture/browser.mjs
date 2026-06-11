// Launch a Chromium that works in both worlds:
//   • Vercel / Lambda (Linux) → playwright-core + @sparticuz/chromium
//   • Local (mac/linux dev)   → full playwright with its bundled browser
// The local `playwright` specifier is concatenated so Vercel's bundler (nft)
// can't trace it and won't pack the heavy package into the serverless function.

export async function launchBrowser() {
  const onServerless =
    process.platform === "linux" && (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (onServerless) {
    const sparticuz = (await import("@sparticuz/chromium")).default;
    // Cards are pure DOM/CSS/images — no WebGL. Graphics mode ON makes
    // sparticuz extract SwiftShader and initialize an in-process ANGLE/Vulkan
    // GL stack at first page creation; when that init fails on the Lambda
    // image, --single-process takes the WHOLE browser down ("Target page,
    // context or browser has been closed" at newPage). Disable it.
    sparticuz.setGraphicsMode = false;
    const { chromium } = await import("playwright-core");
    return chromium.launch({
      args: sparticuz.args,
      executablePath: await sparticuz.executablePath(),
      headless: !!sparticuz.headless,
    });
  }

  const local = "play" + "wright";
  const { chromium } = await import(local);
  return chromium.launch();
}
