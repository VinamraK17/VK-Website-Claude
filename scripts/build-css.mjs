/**
 * Produces public/app.css — a single render-blocking stylesheet — from:
 *   1. @font-face rules for the self-hosted fonts (must come first)
 *   2. the compiled Tailwind utilities
 *   3. shared.css, last, so its overrides still win
 *
 * One file instead of three means one round trip. On an origin behind a home
 * NAS and a tunnel, latency dominates: the old shared.css was 3.6 KiB and cost
 * 450 ms on mobile purely to open the connection.
 *
 * Fonts come from npm (@fontsource) rather than fonts.googleapis.com. That CDN
 * cost 750 ms on mobile for 1.8 KiB of CSS, and then gated three woff2 fetches
 * of ~665 ms each on a third origin.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';

// Weights actually used in the markup: font-light 300, normal 400, medium 500,
// semibold 600, bold 700. The old Google Fonts request omitted Inter 700, so
// every one of the 137 font-bold elements — including the hero h1, the LCP
// element — was being synthesised by the browser rather than rendered.
const FONTS = [
  { pkg: '@fontsource/inter',          family: 'Inter',          weights: [300, 400, 500, 600, 700] },
  { pkg: '@fontsource/space-grotesk',  family: 'Space Grotesk',  weights: [300, 500, 600, 700] }, // 400 unused
  { pkg: '@fontsource/jetbrains-mono', family: 'JetBrains Mono', weights: [400, 500, 700] },
];

// Rebuild the directory each time, or a weight removed from FONTS lingers on disk
// and gets committed and deployed while nothing references it.
rmSync('public/fonts', { recursive: true, force: true });
mkdirSync('public/fonts', { recursive: true });

let fontCss = '/* Self-hosted fonts — see scripts/build-css.mjs */\n';
let copied = 0;
for (const { pkg, family, weights } of FONTS) {
  const slug = pkg.split('/')[1];
  for (const w of weights) {
    const file = `${slug}-latin-${w}-normal.woff2`;
    copyFileSync(path.join('node_modules', pkg, 'files', file), path.join('public/fonts', file));
    copied++;
    fontCss += `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};`
             + `font-display:swap;src:url('/fonts/${file}') format('woff2');}\n`;
  }
}

const tailwind = readFileSync('public/tailwind.css', 'utf8');
const shared   = readFileSync('public/shared.css', 'utf8');
writeFileSync('public/app.css', `${fontCss}\n${tailwind}\n\n${shared}\n`);

const size = readFileSync('public/app.css').length;
console.log(`app.css: ${size} bytes (fonts ${fontCss.length} + tailwind ${tailwind.length} + shared ${shared.length}), ${copied} woff2 copied`);
