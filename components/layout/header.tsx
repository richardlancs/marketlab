import Link from "next/link";
import { Suspense } from "react";
import { AlertsBadge } from "@/components/alerts/alerts-badge";
import { AccountMenu } from "@/components/auth/account-menu";
import { SearchDialog } from "@/components/search/search-dialog";
import { Logo } from "./logo";
import { NavLinks, NavLinksFallback, type NavItem } from "./nav-links";
import { ThemeMenu } from "./theme-menu";

const pages: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/stocks", label: "Stocks" },
  { href: "/screener", label: "Screener" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/backtest", label: "Backtest" },
  { href: "/options", label: "Options" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/learn", label: "Learn" },
];


export function Header() {
  return (
    // Sticky, translucent bar with a backdrop blur, like Apple's site navigation.
    // On phones it's one row (logo and icons); the pages are in the tab bar
    // along the bottom (tab-bar.tsx). The safe-area padding keeps it clear of
    // the notch in the installed app and in landscape.
    <header className="sticky top-0 z-50 border-b border-border bg-background/70 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
      {/*
       * flex-wrap: from 768px (md) to 1280px (xl) the links drop to their own
       * full-width row under the logo (order-last + basis-full); from xl they
       * sit in the top row.
       */}
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 xl:gap-x-4 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] sm:px-6 lg:px-8">
        <Link href="/" aria-label="MarketLab home" className="flex h-14 items-center">
          <Logo />
        </Link>

        <nav
          aria-label="Main"
          // Below xl the links get their own row, which scrolls sideways if they
          // don't fit; the negative margin + padding lets it reach the screen edge.
          className="order-last -mx-4 hidden basis-[calc(100%+2rem)] items-center gap-1 overflow-x-auto px-4 pb-2 text-sm [scrollbar-width:none] sm:-mx-6 sm:basis-[calc(100%+3rem)] sm:px-6 lg:-mx-8 lg:basis-[calc(100%+4rem)] lg:px-8 md:flex xl:order-none xl:m-0 xl:basis-auto xl:p-0"
        >
          {/*
           * usePathname needs Suspense here: stock pages for symbols not built
           * ahead of time don't know their URL during pre-rendering. Without
           * this boundary, the build fails (see the usePathname docs).
           */}
          <Suspense fallback={<NavLinksFallback items={pages} />}>
            <NavLinks items={pages} />
          </Suspense>
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <SearchDialog />
          <AlertsBadge />
          <ThemeMenu />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
