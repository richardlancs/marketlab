"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, type ReactNode } from "react";

interface Tab {
  href: string;
  label: string;
  icon: ReactNode;
}

const icon = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
    {paths}
  </svg>
);

const tabs: Tab[] = [
  { href: "/", label: "Dashboard", icon: icon(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>) },
  { href: "/stocks", label: "Stocks", icon: icon(<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>) },
  { href: "/portfolio", label: "Portfolio", icon: icon(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>) },
  { href: "/learn", label: "Learn", icon: icon(<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5" /></>) },
];

/** The pages behind "More", with what each is for. */
const more: (Tab & { detail: string })[] = [
  { href: "/screener", label: "Screener", detail: "Filter stocks by momentum, risk and value", icon: icon(<path d="M3 5h18l-7 8v6l-4 2v-8z" />) },
  { href: "/watchlist", label: "Watchlist", detail: "Stocks you follow, and your alerts", icon: icon(<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />) },
  { href: "/backtest", label: "Backtest", detail: "Test a strategy on past prices", icon: icon(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 3" /></>) },
  { href: "/options", label: "Options", detail: "Learn how options are priced, with a simulated chain", icon: icon(<><path d="M4 20h16" /><path d="M4 16l5-5 3 3 8-8" /><path d="M14 6h6v6" /></>) },
  { href: "/leaderboard", label: "Leaderboard", detail: "How portfolios compare", icon: icon(<><path d="M8 21h8M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>) },
];

/** "/" matches only itself; any other link also matches the pages under it (/stocks → /stocks/AAPL). */
function isActive(href: string, pathname: string | null) {
  if (pathname === null) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

const tabClass = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent";

/**
 * Phones' navigation (below 768px; the header's links take over from there):
 * four tabs and "More", along the bottom of the screen, within thumb reach.
 * "More" opens a sheet with the other pages. It sits above the iPhone's home
 * bar (the safe area), which matters most in the installed app.
 */
export function TabBar({ pathname }: { pathname: string | null }) {
  const sheet = useRef<HTMLDivElement>(null);
  const sheetId = useId();
  const moreActive = more.some((m) => isActive(m.href, pathname));
  const close = () => sheet.current?.hidePopover();

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden">
      <div className="flex px-[env(safe-area-inset-left)]">
        {tabs.map((tab) => {
          const active = isActive(tab.href, pathname);
          return (
            <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={`${tabClass} ${active ? "text-accent" : "text-muted hover:text-foreground"}`}>
              {tab.icon}
              {tab.label}
            </Link>
          );
        })}
        <button type="button" popoverTarget={sheetId} aria-haspopup="dialog" className={`${tabClass} ${moreActive ? "text-accent" : "text-muted hover:text-foreground"}`}>
          {icon(<><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>)}
          More
        </button>
      </div>

      <div
        ref={sheet}
        id={sheetId}
        popover="auto"
        role="dialog"
        aria-label="More pages"
        // A popover is centered by default; this makes it a sheet along the bottom, above the tab bar.
        className="fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-none animate-slide-up rounded-t-3xl border border-b-0 border-border bg-surface p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-foreground shadow-2xl shadow-black/30 backdrop:bg-black/30"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-foreground/15" aria-hidden />
        <ul>
          {more.map((page) => {
            const active = isActive(page.href, pathname);
            return (
              <li key={page.href}>
                <Link
                  href={page.href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 items-center gap-4 rounded-2xl px-3 py-2 transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent ${active ? "bg-foreground/5" : ""}`}
                >
                  <span className={active ? "text-accent" : "text-muted"}>{page.icon}</span>
                  <span>
                    <span className="block font-medium">{page.label}</span>
                    <span className="block text-sm text-muted">{page.detail}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={close} className="mt-1 min-h-12 w-full rounded-2xl text-sm font-medium text-accent hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent">
          Close
        </button>
      </div>
    </nav>
  );
}

/** Reads the URL, which needs a Suspense boundary around it (see header.tsx). */
export function TabBarWithPath() {
  return <TabBar pathname={usePathname()} />;
}
