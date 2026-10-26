// Draws the app icons and favicons from the header's logo mark
// (components/layout/logo.tsx): run `node scripts/make-icons.mjs` after
// changing the logo. Icons can't follow the chosen theme, so they use the
// light theme's colours, except app/icon.svg, which follows the OS setting.
import { writeFileSync } from "node:fs";
import sharp from "sharp";

// The same shapes as logo.tsx, in the artwork's pixel coordinates.
const VIEWBOX = { x: 82, y: 118, w: 434, h: 422 };
const DARK = ["M84 153L232 248L84 352Z", "M271 362L300 381L489 218V537H409V392L271 499Z"];
const BRAND = ["M232 248L300 293L436 175L463 200L299 342L196 273Z", "M84 404L143 363L154 370V537H84Z", "M176 333L205 318L249 345V515L228 537H176Z"];
const DOT = `<circle cx="475" cy="158" r="39"/>`;

const NAVY = "#0b1220";
const gradient = (id, [start, mid, end]) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="120" y1="140" x2="360" y2="540"><stop offset="0" stop-color="${start}"/><stop offset="0.5" stop-color="${mid}"/><stop offset="1" stop-color="${end}"/></linearGradient>`;
const LIGHT_BRAND = ["#3cc79c", "#0aa478", "#067a55"];

/** The mark scaled to fit a `box`-wide square at (`x`, `y`), centred. */
function mark(x, y, box, { dark = NAVY, brand = "url(#g)" } = {}) {
  const s = box / Math.max(VIEWBOX.w, VIEWBOX.h);
  const dx = x + (box - VIEWBOX.w * s) / 2 - VIEWBOX.x * s;
  const dy = y + (box - VIEWBOX.h * s) / 2 - VIEWBOX.y * s;
  return `<g transform="translate(${dx} ${dy}) scale(${s})"><g fill="${dark}">${DARK.map((d) => `<path d="${d}"/>`).join("")}</g><g fill="${brand}">${BRAND.map((d) => `<path d="${d}"/>`).join("")}${DOT}</g></g>`;
}

/** The mark on a white tile; `inset` is the margin on each side. */
const icon = (size, { radius, inset }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs>${gradient("g", LIGHT_BRAND)}</defs><rect width="${size}" height="${size}" rx="${radius}" fill="#ffffff"/>${mark(inset, inset, size - 2 * inset)}</svg>`;

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

const out = [
  // Rounded, for browsers that show the icon as is.
  ["public/icons/icon-192.png", icon(192, { radius: 42, inset: 26 })],
  ["public/icons/icon-512.png", icon(512, { radius: 112, inset: 70 })],
  // Full-bleed with the mark inside the middle 80%: Android crops these to its own shape.
  ["public/icons/maskable-512.png", icon(512, { radius: 0, inset: 112 })],
  // iOS rounds the corners itself.
  ["app/apple-icon.png", icon(180, { radius: 0, inset: 28 })],
  // Android's small status-bar icon: only the shape counts, in white on transparent.
  ["public/icons/badge-72.png", `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">${mark(6, 6, 60, { dark: "white", brand: "white" })}</svg>`],
];
for (const [file, svg] of out) writeFileSync(file, await png(svg));

// The tab icon for browsers that take SVG: no tile, and light dark parts on a dark browser theme.
const DARK_BRAND = ["#5eddb2", "#22c28f", "#0b9468"];
writeFileSync(
  "app/icon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>.d{fill:${NAVY}}@media (prefers-color-scheme:dark){.d{fill:#f5f5f7}.l{stop-color:${DARK_BRAND[0]}}}</style><defs>${gradient("g", LIGHT_BRAND).replace('<stop offset="0"', '<stop class="l" offset="0"')}</defs>${mark(2, 2, 60).replace(`fill="${NAVY}"`, 'class="d"')}</svg>\n`,
);

// favicon.ico for the rest: 16, 32 and 48px PNGs in an ICO container (header, one directory entry each, then the images).
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((size) => png(icon(size, { radius: size / 5, inset: size / 16 }))));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const entry = 6 + 16 * i;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
});
writeFileSync("app/favicon.ico", Buffer.concat([header, ...images]));

console.log([...out.map(([f]) => f), "app/icon.svg", "app/favicon.ico"].join("\n"));
