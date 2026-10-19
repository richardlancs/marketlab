import Link from "next/link";
import { Suspense } from "react";
import { SearchDialog } from "@/components/search/search-dialog";
import { getStocks } from "@/lib/mock-data";
import { NavLinks, NavLinksFallback, type NavItem } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

const pages: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/stocks", label: "Stocks" },
];

// Sections planned for later phases. Shown so the shell feels complete, but
// not links yet, since those routes don't exist.
const upcoming = ["Watchlist", "Portfolio", "Backtest"];

export async function Header() {
  // The search dialog gets the stock list straight from the server as props,
  // so it needs no API route. It's small: five fields for each stock.
  const stocks = (await getStocks()).map(({ symbol, name, price, change, changePercent }) => ({
    symbol,
    name,
    price,
    change,
    changePercent,
  }));

  return (
    // Sticky, translucent bar with a backdrop blur, like Apple's site navigation.
    <header className="sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur-xl backdrop-saturate-150">
      {/*
       * flex-wrap: on phones the nav drops to its own full-width row under the
       * logo (order-last + basis-full). From 768px (md) it sits in the top row.
       */}
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-8 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex h-14 items-center gap-2.5 font-semibold tracking-tight">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-lg bg-linear-to-br from-sky-400 via-blue-500 to-indigo-600 shadow-sm shadow-blue-500/30"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-4">
              <path d="M3 17l6-6 4 4 8-8" />
            </svg>
          </span>
          MarketLab
        </Link>

        <nav
          aria-label="Main"
          // On phones the row scrolls sideways if the links don't fit; the
          // negative margin + padding lets it scroll right to the screen edge.
          className="order-last -mx-4 flex basis-[calc(100%+2rem)] items-center gap-1 overflow-x-auto px-4 pb-2 text-sm [scrollbar-width:none] sm:-mx-6 sm:basis-[calc(100%+3rem)] sm:px-6 md:order-none md:m-0 md:basis-auto md:p-0"
        >
          {/*
           * usePathname needs Suspense here: stock pages for symbols not built
           * ahead of time don't know their URL during pre-rendering. Without
           * this boundary, the build fails (see the usePathname docs).
           */}
          <Suspense fallback={<NavLinksFallback items={pages} />}>
            <NavLinks items={pages} />
          </Suspense>
          {upcoming.map((label) => (
            // `relative` keeps the absolutely positioned sr-only text inside the
            // scrolling nav; otherwise it hangs off the edge and widens the page on phones.
            <span key={label} title="Coming soon" className="relative shrink-0 cursor-default rounded-full px-3 py-1.5 text-muted/50">
              {label}
              {/* The greyed-out look is visual only, so say it in words for screen readers. */}
              <span className="sr-only"> (coming soon)</span>
            </span>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <SearchDialog stocks={stocks} />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
