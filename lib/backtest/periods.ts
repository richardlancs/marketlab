/**
 * The return heatmap's cell colours. The returns themselves come from the
 * analytics service with every result (./extras.ts).
 */

/**
 * A cell color for a signed value: green for gains, red for losses, mixed
 * with the card color by how big the value is (up to `maxAbs`, where the
 * color is strongest). Zero is the plain card color. Every cell also shows
 * its number with a sign, so the color is never the only way to read it.
 */
export function divergingColor(value: number, maxAbs: number): string {
  const strength = maxAbs > 0 ? Math.min(1, Math.abs(value) / maxAbs) : 0;
  const percent = Math.round(strength * 55); // capped so the number on top stays readable
  if (percent === 0) return "var(--surface)";
  return `color-mix(in oklab, var(${value > 0 ? "--gain" : "--loss"}) ${percent}%, var(--surface))`;
}
