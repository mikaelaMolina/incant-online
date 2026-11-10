// Incant Online logo (run: node scripts/make-logo.mjs public/brand): an original mark (a speech bubble holding the Spire, a spark rising from it) and a
// hand-built chunky wordmark (letters as monoline paths: ink outline under a yellow stroke).
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const INK = '#1d1a16', SUN = '#ffc93c', PAPER = '#fffaf0', BERRY = '#ff5d73';

// --- Wordmark: centreline paths on a 100-unit cap height --------------------------------------
const L = {
  I: { w: 0, d: 'M0 0V100' },
  N: { w: 62, d: 'M0 100V0L62 100V0' },
  C: { w: 84, d: 'M84 20A46 50 0 1 0 84 80' },
  A: { w: 72, d: 'M0 100L36 0L72 100M15 62H57' },
  T: { w: 68, d: 'M0 0H68M34 0V100' },
  O: { w: 92, d: 'M46 0A46 50 0 1 0 46 100A46 50 0 1 0 46 0Z' },
  L: { w: 54, d: 'M0 0V100H54' },
  E: { w: 56, d: 'M56 0H0V100H56M0 50H44' },
};
const GAP = 46;
function word(text, x0, y0, scale) {
  let x = 0;
  const parts = [];
  for (const ch of text) {
    const g = L[ch];
    parts.push(`<path transform="translate(${(x0 + x * scale).toFixed(1)} ${y0}) scale(${scale})" d="${g.d}"/>`);
    x += g.w + GAP;
  }
  return { svg: parts.join(''), width: (x - GAP) * scale };
}
function chunky(text, x0, y0, scale, fill = SUN) {
  const w = word(text, x0, y0, scale);
  const sw = 24 * scale, ow = sw + 12 * scale, sh = 9 * scale;
  const base = `fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  return {
    width: w.width,
    svg:
      `<g ${base} stroke="${INK}" stroke-width="${ow}" transform="translate(0 ${sh})">${w.svg}</g>` + // drop shadow
      `<g ${base} stroke="${INK}" stroke-width="${ow}">${w.svg}</g>` + // outline
      `<g ${base} stroke="${fill}" stroke-width="${sw}">${w.svg}</g>`, // fill
  };
}

// --- Mark: 128 × 128 ----------------------------------------------------------------------------
function mark(x = 0, y = 0, s = 1, bubbleFill = SUN) {
  const bubble = 'M30 12H98A20 20 0 0 1 118 32V82A20 20 0 0 1 98 102H58L34 122V102H30A20 20 0 0 1 10 82V32A20 20 0 0 1 30 12Z';
  return `<g transform="translate(${x} ${y}) scale(${s})" stroke-linejoin="round" stroke-linecap="round">
  <path d="${bubble}" fill="${INK}" transform="translate(0 7)"/>
  <path d="${bubble}" fill="${bubbleFill}" stroke="${INK}" stroke-width="7"/>
  <!-- the Spire: a tall wizard tower -->
  <path d="M52 56H76V93H52Z" fill="${PAPER}" stroke="${INK}" stroke-width="6"/>
  <path d="M58.5 93V83A5.5 5.5 0 0 1 69.5 83V93Z" fill="${INK}"/>
  <rect x="61" y="63" width="6" height="9" rx="3" fill="${SUN}" stroke="${INK}" stroke-width="3"/>
  <path d="M64 14L85 58H43Z" fill="${BERRY}" stroke="${INK}" stroke-width="6"/>
  <path d="M41 93H87" stroke="${INK}" stroke-width="7"/>
  <!-- the spark of a spoken word, breaking out of the bubble -->
  <path d="M64 -6L68 3.5L77.5 7.5L68 11.5L64 21L60 11.5L50.5 7.5L60 3.5Z" fill="${PAPER}" stroke="${INK}" stroke-width="4"/>
</g>`;
}

const svgDoc = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-labelledby="t"><title id="t">${title}</title>${body}</svg>\n`;

// Mark alone (favicon / app icon).
writeFileSync(`${out}/mark.svg`, svgDoc(128, 144, mark(0, 10, 1), 'Incant Online'));
// For yellow backgrounds: a paper bubble.
writeFileSync(`${out}/mark-paper.svg`, svgDoc(128, 144, mark(0, 10, 1, PAPER), 'Incant Online'));

// Full logo: mark + INCANT, ONLINE beneath on an ink pill.
const top = chunky('INCANT', 180, 26, 0.92);
const small = word('ONLINE', 0, 0, 0.32);
const pillX = 180 - 16, pillY = 146, pillH = 60, pillW = small.width + 64;
const onlineWord = word('ONLINE', pillX + 32, pillY + 14, 0.32);
const online = { svg: `<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="${PAPER}" stroke-width="${34 * 0.32}">${onlineWord.svg}</g>` };
const logoW = Math.ceil(180 + top.width + 30);
const body =
  mark(8, 40, 1.12) +
  top.svg +
  `<rect x="${pillX}" y="${pillY + 6}" width="${pillW}" height="${pillH}" rx="16" fill="${INK}"/>` +
  `<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="16" fill="${BERRY}" stroke="${INK}" stroke-width="6"/>` +
  online.svg;
writeFileSync(`${out}/logo.svg`, svgDoc(logoW, 220, body, 'Incant Online'));
console.log('logo', logoW, 'x 220');
