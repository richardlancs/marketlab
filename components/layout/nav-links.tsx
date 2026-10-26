"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
}

const linkClass =
  "shrink-0 rounded-full px-3 py-1.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent xl:px-2";

/** "/" matches only itself; any other link also matches the pages under it (/stocks → /stocks/AAPL). */
function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The header's page links, with the current page highlighted. This is the only
 * part of the header that needs the URL, and reading it needs a Client
 * Component (usePathname), so it's split out and the rest stays on the server.
 */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return items.map((item) => {
    const active = isActive(item.href, pathname);
    return (
      <Link
        key={item.href}
        href={item.href}
        // Tells screen readers which link is the current page.
        aria-current={active ? "page" : undefined}
        className={`${linkClass} ${active ? "bg-foreground/5" : "text-muted hover:text-foreground"}`}
      >
        {item.label}
      </Link>
    );
  });
}

/**
 * Shown while the pathname isn't known yet: the same links, none highlighted.
 * It's what gets pre-rendered for stock pages built on request, so it must
 * look like NavLinks to avoid a jump when the real one takes over.
 */
export function NavLinksFallback({ items }: { items: NavItem[] }) {
  return items.map((item) => (
    <Link key={item.href} href={item.href} className={`${linkClass} text-muted hover:text-foreground`}>
      {item.label}
    </Link>
  ));
}
