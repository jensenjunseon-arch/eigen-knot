// Free, instant, code-generated abstract backgrounds — no API, no cost.
// Dark editorial gradients tuned for white typography + the deck's dim rhythm.
// Output is a URL-encoded SVG dataURL (tiny — safe for localStorage, and the
// proven-reliable bg format for headless capture). NOTE: never put "--" inside
// an SVG comment (invalid XML → silently black card); we use no comments at all.

interface Palette {
  top: string;
  bottom: string;
  glowA: string;
  glowB: string;
}

// Card rendering puts a 0.6~0.9 black dim layer over the background, so these
// run brighter than the final look — they read deep-dark only after the dim.
const PALETTES: Palette[] = [
  { top: "#2A4467", bottom: "#16263C", glowA: "#5B8BC4", glowB: "#3D6498" }, // midnight navy
  { top: "#46303D", bottom: "#2A1B24", glowA: "#A55470", glowB: "#713A4F" }, // charcoal wine
  { top: "#2C4A3C", bottom: "#1A2C23", glowA: "#5D9B7E", glowB: "#3F6C57" }, // deep forest
  { top: "#383263", bottom: "#211D40", glowA: "#7B73C9", glowB: "#544D96" }, // indigo violet
  { top: "#4C3823", bottom: "#2C2014", glowA: "#C08049", glowB: "#8A5A33" }, // ember brown
  { top: "#363C47", bottom: "#20242C", glowA: "#7A8BA6", glowB: "#525F75" }, // graphite slate
];

// Deterministic PRNG so the same seed always reproduces the same background
// (decks persist the dataURL itself, but determinism helps debugging).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate an abstract dark background as an SVG dataURL. */
export function abstractBg(seed: number, w = 1080, h = 1350): string {
  const rnd = mulberry32(seed);
  const p = PALETTES[Math.floor(rnd() * PALETTES.length)];

  // 2~3 soft glows, kept off-center and away from the text safe-area top-left.
  const glows = Array.from({ length: 2 + Math.floor(rnd() * 2) }, (_, i) => {
    const cx = Math.round(w * (0.15 + rnd() * 0.7));
    const cy = Math.round(h * (0.35 + rnd() * 0.55));
    const r = Math.round(Math.min(w, h) * (0.28 + rnd() * 0.3));
    const color = i % 2 === 0 ? p.glowA : p.glowB;
    const op = (0.5 + rnd() * 0.3).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#g${i})"/><radialGradient id="g${i}"><stop offset="0%" stop-color="${color}" stop-opacity="${op}"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
  }).join("");

  const grainSeed = Math.floor(rnd() * 1000);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="base" x1="0" y1="0" x2="0.25" y2="1"><stop offset="0%" stop-color="${p.top}"/><stop offset="100%" stop-color="${p.bottom}"/></linearGradient>` +
    `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${grainSeed}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.05"/></feComponentTransfer><feComposite operator="over" in2="SourceGraphic"/></filter></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#base)"/>` +
    glows +
    `<rect width="${w}" height="${h}" fill="url(#vig)"/><radialGradient id="vig" cx="0.5" cy="0.45" r="0.9"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.45"/></radialGradient>` +
    `<rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.5"/>` +
    `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** A fresh random seed (browser-side use). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}
