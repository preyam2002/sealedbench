import { writeFileSync } from "node:fs";
// sharp is a transitive dep in the pnpm store; import it by its store path.
import sharp from "../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js";

// SealedBench wax-seal logo. 1024x1024, transparent background.
const R = 392; // wax disc radius
const ox = "#8c2f22";

// scalloped wax edge: ring of bumps just inside the rim
let bumps = "";
const N = 34;
const bd = 384;
const br = 30;
for (let i = 0; i < N; i++) {
  const a = (i / N) * Math.PI * 2;
  const x = (Math.cos(a) * bd).toFixed(2);
  const y = (Math.sin(a) * bd).toFixed(2);
  bumps += `<circle cx="${x}" cy="${y}" r="${br}" fill="${ox}"/>`;
}

// cream register ticks at the cardinal points
let ticks = "";
for (const deg of [0, 90, 180, 270]) {
  ticks += `<line x1="0" y1="-332" x2="0" y2="-360" stroke="#f2e7d0" stroke-width="6" opacity="0.75" transform="rotate(${deg})"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
<radialGradient id="wax" cx="42%" cy="36%" r="72%">
<stop offset="0%" stop-color="#bb422e"/>
<stop offset="55%" stop-color="#8c2f22"/>
<stop offset="100%" stop-color="#591c12"/>
</radialGradient>
<radialGradient id="sheen" cx="39%" cy="31%" r="46%">
<stop offset="0%" stop-color="#ffffff" stop-opacity="0.17"/>
<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
</radialGradient>
<path id="arcTop" d="M -266 0 A 266 266 0 0 1 266 0" fill="none"/>
</defs>
<g transform="translate(512,512)">
${bumps}
<circle r="${R}" fill="url(#wax)"/>
<circle r="${R}" fill="url(#sheen)"/>
<circle r="338" fill="none" stroke="#f2e7d0" stroke-width="7" opacity="0.9"/>
<circle r="316" fill="none" stroke="#f2e7d0" stroke-width="2.5" opacity="0.6"/>
${ticks}
<text font-family="'Courier New', ui-monospace, monospace" font-size="31" letter-spacing="6" fill="#f2e7d0" opacity="0.92">
<textPath xlink:href="#arcTop" href="#arcTop" startOffset="50%" text-anchor="middle">SEALEDBENCH · NOTARIZED ON SUI</textPath>
</text>
<text x="0" y="86" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="700" font-size="290" fill="#f6edd8">SB</text>
<text x="0" y="184" text-anchor="middle" font-family="'Courier New', ui-monospace, monospace" font-size="33" letter-spacing="9" fill="#f2e7d0" opacity="0.82">SEALED</text>
</g>
</svg>`;

writeFileSync("apps/web/public/logo.svg", svg);
await sharp(Buffer.from(svg)).png().toFile("logo.png");
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile("apps/web/public/logo.png");
await sharp(Buffer.from(svg))
  .resize(512, 512)
  .flatten({ background: "#efe9da" })
  .png()
  .toFile("logo-cream.png");
console.log("wrote logo.png (1024, transparent), apps/web/public/logo.png (512), logo-cream.png");
