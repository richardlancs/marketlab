// Draws the app icons from the header's logo (a rising line on the brand
// gradient): run `node scripts/make-icons.mjs` after changing the logo.
import sharp from "sharp";

const line = (size, inset, stroke) => {
  // The logo's path, in a 24-unit box, scaled into the square less `inset` on each side.
  const s = (size - 2 * inset) / 24;
  const p = (x, y) => `${inset + x * s} ${inset + y * s}`;
  return `<path d="M${p(3, 17)}L${p(9, 11)}L${p(13, 15)}L${p(21, 7)}" fill="none" stroke="${stroke}" stroke-width="${2.5 * s}" stroke-linecap="round" stroke-linejoin="round"/>`;
};
const gradient = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="0.5" stop-color="#3b82f6"/><stop offset="1" stop-color="#4f46e5"/></linearGradient></defs>`;

const icon = (size, { radius, inset }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${gradient}<rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>${line(size, inset, "white")}</svg>`;

const out = [
  // Rounded like the header logo, for browsers that show the icon as is.
  ["public/icons/icon-192.png", icon(192, { radius: 42, inset: 30 })],
  ["public/icons/icon-512.png", icon(512, { radius: 112, inset: 80 })],
  // Full-bleed with the line inside the middle 80%: Android crops these to its own shape.
  ["public/icons/maskable-512.png", icon(512, { radius: 0, inset: 120 })],
  // iOS rounds the corners itself.
  ["app/apple-icon.png", icon(180, { radius: 0, inset: 32 })],
  // Android's small status-bar icon: only the shape counts, in white on transparent.
  ["public/icons/badge-72.png", `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">${line(72, 6, "white")}</svg>`],
];
for (const [file, svg] of out) await sharp(Buffer.from(svg)).png().toFile(file);
console.log(out.map(([f]) => f).join("\n"));
