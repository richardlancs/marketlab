import { useId } from "react";

/*
 * The MarketLab mark, traced from the logo artwork (its coordinates are the
 * artwork's pixels, hence the viewBox offset). The dark parts are the text
 * colour and the green parts the brand gradient, so the mark follows every
 * theme and undertone. scripts/make-icons.mjs draws the app icons from the
 * same shapes: keep the two in sync.
 */
export const MARK_VIEWBOX = "82 118 434 422";
export const MARK_DARK = ["M84 153L232 248L84 352Z", "M271 362L300 381L489 218V537H409V392L271 499Z"];
export const MARK_BRAND = [
  "M232 248L300 293L436 175L463 200L299 342L196 273Z",
  "M84 404L143 363L154 370V537H84Z",
  "M176 333L205 318L249 345V515L228 537H176Z",
];
export const MARK_DOT = { cx: 475, cy: 158, r: 39 };

export function LogoMark({ className }: { className?: string }) {
  // Each mark on the page needs its own gradient id.
  const gradient = useId();
  return (
    <svg viewBox={MARK_VIEWBOX} aria-hidden className={className}>
      <defs>
        <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="120" y1="140" x2="360" y2="540">
          <stop offset="0" style={{ stopColor: "var(--brand-start)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--brand-mid)" }} />
          <stop offset="1" style={{ stopColor: "var(--brand-end)" }} />
        </linearGradient>
      </defs>
      <g className="fill-foreground">
        {MARK_DARK.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g fill={`url(#${gradient})`}>
        {MARK_BRAND.map((d) => (
          <path key={d} d={d} />
        ))}
        <circle {...MARK_DOT} />
      </g>
    </svg>
  );
}

/** The mark and the wordmark: "Market" in the text colour, "Lab" in the brand colour. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LogoMark className="h-7 w-auto" />
      <span className="text-lg font-extrabold tracking-tight">
        Market
        <span className="bg-linear-to-b from-brand-mid to-brand-end bg-clip-text text-transparent">Lab</span>
      </span>
    </span>
  );
}
