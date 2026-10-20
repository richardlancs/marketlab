"use client";

import Image from "next/image";
import { LOGO_FILES } from "@/lib/market/logo-files";

/**
 * A company's logo in a rounded tile, next to its ticker. Every logo sits on
 * the same light tile in every theme, the way app icons do, so full-colour
 * marks stay legible and a row of them looks even. A company without a logo
 * (see scripts/fetch-logos.mjs) gets its ticker's first letter on a tile
 * tinted with the theme's accent.
 *
 * Decorative: the ticker is always written beside it, so it has no alt text.
 * A Client Component, so it can be passed into client charts' props from
 * server components (next/image rendered there triggers a React key warning).
 */
export function StockLogo({ symbol, size = 32, hideOnPhone = false, className = "" }: { symbol: string; size?: number; hideOnPhone?: boolean; className?: string }) {
  const logo = LOGO_FILES[symbol];
  const tile = `${hideOnPhone ? "hidden sm:inline-grid" : "inline-grid"} shrink-0 place-items-center overflow-hidden ring-1 ring-black/[0.06] ${className}`;
  const style = { width: size, height: size, borderRadius: Math.round(size * 0.28) };

  if (!logo) {
    return (
      <span
        aria-hidden
        className={`${tile} bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface))] font-semibold text-accent ring-accent/15`}
        style={{ ...style, fontSize: Math.round(size * 0.44) }}
      >
        {symbol.charAt(0)}
      </span>
    );
  }
  // A mark (the logo alone) gets breathing room; an app icon is already composed for its square.
  const inset = logo.kind === "mark" ? Math.round(size * 0.2) : 0;
  return (
    <span aria-hidden className={`${tile} bg-white`} style={style}>
      {/* unoptimized: the files are already small, and the image optimizer isn't routed on this Vercel Services setup. */}
      <Image src={logo.src} alt="" unoptimized width={size - inset * 2} height={size - inset * 2} className="object-contain" style={{ width: size - inset * 2, height: size - inset * 2 }} />
    </span>
  );
}
