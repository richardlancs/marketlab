// @vitest-environment node
/**
 * Every theme's text colours against the backgrounds they're used on, read
 * straight from app/globals.css: WCAG AA needs 4.5:1 for text. A change to a
 * colour token that would make text hard to read fails here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

/** The custom properties set by the rule with exactly this selector (all such rules, in order). */
function tokens(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const escaped = selector.replace(/[[\]"().*+?^$|\\]/g, "\\$&");
  for (const m of css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g"))) {
    for (const d of m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

const light = tokens(':root,\n[data-theme="light"]');
// <html> always matches :root, so every theme starts from the light tokens.
const pastel = { ...light, ...tokens('[data-theme="pastel"]') };
const themes: Record<string, Record<string, string>> = {
  light,
  dark: { ...light, ...tokens('[data-theme="dark"]') },
  "pastel sand": pastel,
  ...Object.fromEntries(["sage", "mist", "rose", "lavender"].map((u) => [`pastel ${u}`, { ...pastel, ...tokens(`[data-theme="pastel"][data-undertone="${u}"]`) }])),
};

type Rgb = [number, number, number];
function rgb(value: string, theme: Record<string, string>): Rgb {
  const v = value.startsWith("var(--") ? theme[value.slice(6, -1)] : value;
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (!hex) throw new Error(`Not a plain colour: ${value} = ${v}`);
  return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb;
}
/** `color` at `alpha` over `under`, as Tailwind's bg-x/NN draws it. */
const over = (color: Rgb, alpha: number, under: Rgb): Rgb => color.map((c, i) => c * alpha + under[i] * (1 - alpha)) as Rgb;
function luminance([r, g, b]: Rgb) {
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(Object.entries(themes))("the %s theme", (_, t) => {
  const c = (name: string) => rgb(t[name] ?? `var(--${name})`, t);
  const backgrounds: Record<string, Rgb> = {
    page: c("background"),
    card: c("surface"),
    "raised card": c("surface-raised"),
    // Pills, segmented controls and table hovers: bg-foreground/5 or /[0.06] on a card or the page.
    "a grey fill on a card": over(c("foreground"), 0.06, c("surface")),
    "a grey fill on the page": over(c("foreground"), 0.06, c("background")),
    // The page at the centre of each background wash (body::before), where it's strongest. The washes sit far enough apart not to overlap there.
    ...Object.fromEntries(["wash-1", "wash-2", "wash-3"].map((w) => [`the page under ${w}`, over(c(w), parseFloat(t["wash-strength"]) / 100, c("background"))])),
  };

  it.each(["foreground", "muted", "accent", "gain", "loss"])("%s text is readable on every background", (text) => {
    for (const [where, bg] of Object.entries(backgrounds)) {
      expect(contrast(c(text), bg), `${text} on ${where}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("gains, losses and links are readable on their own tint (badges, selected items)", () => {
    for (const name of ["gain", "loss", "accent"]) {
      expect(contrast(c(name), over(c(name), 0.15, c("surface"))), `${name} on its tint`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("white text is readable on filled buttons and badges", () => {
    expect(contrast([255, 255, 255], c("accent-fill"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast([255, 255, 255], c("loss-fill"))).toBeGreaterThanOrEqual(4.5);
  });
});
