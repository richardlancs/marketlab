// Downloads each catalog company's logo into public/logos/, from the domains in
// lib/market/logos.ts, and writes lib/market/logo-files.ts listing them. Run it
// by hand when the catalog changes (it needs network access):
//
//   node scripts/fetch-logos.mjs
//
// For each company, the first source that has one:
// 1. A square PNG or JPEG icon of at least 96px: the site's own apple-touch-icon or
//    <link rel="icon">, or Google's favicon service at up to 256px.
// 2. Its mark from Simple Icons (CC0 icon data), filled with the brand colour.
// 3. An icon of at least 48px from those same sources.
// Anything else gets no file, and the site shows a lettered badge instead.
// Icons over 128px are shrunk to 128px (with macOS sips; elsewhere they stay full size).
// The marks remain their owners' trademarks; they're shown only to identify
// each company's stock.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = new URL("../public/logos/", import.meta.url);
const MANIFEST = new URL("../lib/market/logo-files.ts", import.meta.url);
const SIMPLE_ICONS = "https://cdn.jsdelivr.net/npm/simple-icons@16.34.0";
/** Catalog symbols whose mark is in Simple Icons, by its slug. */
const GLYPHS = {
  ABBV: "abbvie", ACN: "accenture", AMD: "amd", BA: "boeing", CSCO: "cisco", DE: "johndeere", F: "ford", GE: "generalelectric",
  INTC: "intel", MCD: "mcdonalds", META: "meta", NVDA: "nvidia", PLTR: "palantir", QCOM: "qualcomm", SPOT: "spotify",
  T: "atandt", UPS: "ups", V: "visa", VZ: "verizon", INTU: "intuit", KO: "cocacola",
};
/** Where the site's own icon isn't the recognisable logo, so the mark is used even if a large icon exists. */
const PREFER_GLYPH = new Set(["INTU", "KO"]);

const domains = Object.fromEntries(
  [...readFileSync(new URL("../lib/market/logos.ts", import.meta.url), "utf8").matchAll(/^ {2}"?([A-Z.-]+)"?: "([^"]+)"/gm)].map((m) => [m[1], m[2]]),
);

/** A PNG's or JPEG's format and size, or null for anything else. */
function imageInfo(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && [0x89, 0x50, 0x4e, 0x47].every((b, i) => bytes[i] === b)) {
    return { ext: "png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    // Walk the JPEG's segments to its frame header (SOF0-SOF3), which holds the size.
    for (let i = 2; i + 9 < bytes.length; ) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xc3) return { ext: "jpg", width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
      i += 2 + view.getUint16(i + 2);
    }
  }
  return null;
}

async function get(url) {
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0 (MarketLab logo fetcher)" } });
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** The largest square PNG or JPEG icon the site or Google's favicon service has. */
async function largestIcon(domain) {
  const urls = new Set([`https://${domain}/apple-touch-icon.png`, `https://www.${domain}/apple-touch-icon.png`]);
  const html = (await get(`https://www.${domain}/`)) ?? (await get(`https://${domain}/`));
  if (html) {
    for (const tag of new TextDecoder().decode(html).match(/<link[^>]+>/gi) ?? []) {
      if (!/rel=["'][^"']*icon[^"']*["']/i.test(tag)) continue;
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
      if (href) urls.add(new URL(href.replace(/&amp;/g, "&"), `https://www.${domain}/`).href);
    }
  }
  urls.add(`https://www.google.com/s2/favicons?domain=${domain}&sz=256`);
  let best = null;
  for (const url of urls) {
    const bytes = await get(url);
    const info = bytes && imageInfo(bytes);
    if (info && info.width === info.height && (!best || info.width > best.width)) best = { bytes, ...info };
  }
  return best;
}

const colours = Object.fromEntries(JSON.parse(new TextDecoder().decode(await get(`${SIMPLE_ICONS}/data/simple-icons.json`))).map((i) => [i.slug, i.hex]));

async function glyph(slug) {
  const svg = await get(`${SIMPLE_ICONS}/icons/${slug}.svg`);
  if (!svg || !colours[slug]) return null;
  return new TextDecoder().decode(svg).replace("<svg ", `<svg fill="#${colours[slug]}" `);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const files = {};
const badges = [];
await Promise.all(
  Object.entries(domains).map(async ([symbol, domain]) => {
    const png = await largestIcon(domain);
    const svg = GLYPHS[symbol] && (!png || png.width < 96 || PREFER_GLYPH.has(symbol)) ? await glyph(GLYPHS[symbol]) : null;
    const icon = () => {
      const file = new URL(`${symbol}.${png.ext}`, OUT);
      writeFileSync(file, png.bytes);
      // Served as-is (not through the image optimizer), so keep them small: 128px is sharp at 2x for a 48px tile.
      if (png.width > 128 && process.platform === "darwin") execFileSync("sips", ["-Z", "128", file.pathname], { stdio: "ignore" });
      files[symbol] = { src: `/logos/${symbol}.${png.ext}`, kind: "icon" };
    };
    if (png && png.width >= 96 && !(svg && PREFER_GLYPH.has(symbol))) icon();
    else if (svg) {
      writeFileSync(new URL(`${symbol}.svg`, OUT), svg);
      files[symbol] = { src: `/logos/${symbol}.svg`, kind: "mark" };
    } else if (png && png.width >= 48) icon();
    else badges.push(symbol);
  }),
);

const entries = Object.keys(files).sort().map((s) => `  ${/^[A-Z]+$/.test(s) ? s : JSON.stringify(s)}: { src: "${files[s].src}", kind: "${files[s].kind}" },`);
writeFileSync(
  MANIFEST,
  `// Written by scripts/fetch-logos.mjs: don't edit by hand.\n\n` +
    `/** "icon": the company's own app or site icon. "mark": its logo alone, in the brand colour. */\n` +
    `export const LOGO_FILES: Readonly<Record<string, { src: string; kind: "icon" | "mark" }>> = {\n${entries.join("\n")}\n};\n`,
);
console.log(`${Object.keys(files).length} logos written; lettered badges for ${badges.length}: ${badges.sort().join(", ")}`);
