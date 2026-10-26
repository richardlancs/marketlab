import Link from "next/link";

export interface LinkTab {
  href: string;
  label: string;
  /** A plain link, not prefetched: for one that redirects (prefetching a redirect isn't worth it, and breaks over plain http). */
  plain?: boolean;
}

/**
 * Tabs that are separate pages (the leaderboards, the screener's views):
 * links in the same pill row as <Tabs>, with the current page marked.
 */
export function LinkTabs({ tabs, current, label, className = "mt-6" }: { tabs: LinkTab[]; current: string; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={`flex gap-1 overflow-x-auto rounded-full bg-foreground/[0.06] p-1 [scrollbar-width:none] sm:inline-flex ${className}`}>
      {tabs.map((t) => {
        const Tag = t.plain ? "a" : Link;
        return (
          <Tag
            key={t.href}
            href={t.href}
            aria-current={t.href === current ? "page" : undefined}
            className="flex min-h-9 shrink-0 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent aria-[current=page]:bg-surface aria-[current=page]:text-foreground aria-[current=page]:shadow-sm"
          >
            {t.label}
          </Tag>
        );
      })}
    </nav>
  );
}
