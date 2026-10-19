import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

// Sections planned for later phases. Shown so the shell feels complete, but
// not links yet, since those routes don't exist.
const upcoming = ["Markets", "Watchlist", "Portfolio", "Backtest"];

export function Header() {
  return (
    // Sticky, translucent bar with a backdrop blur, like Apple's site navigation.
    <header className="sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-8 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
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

        <nav aria-label="Main" className="hidden items-center gap-1 text-sm md:flex">
          <Link href="/" aria-current="page" className="rounded-full bg-foreground/5 px-3 py-1.5 font-medium">
            Dashboard
          </Link>
          {upcoming.map((label) => (
            <span
              key={label}
              title="Coming soon"
              aria-disabled
              className="cursor-default rounded-full px-3 py-1.5 text-muted/60"
            >
              {label}
            </span>
          ))}
        </nav>

        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
