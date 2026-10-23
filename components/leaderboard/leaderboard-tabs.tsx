import Link from "next/link";

const TABS = [
  { id: "season", href: "/leaderboard/season", label: "This season" },
  { id: "seasons", href: "/leaderboard/seasons", label: "Past seasons" },
  { id: "all", href: "/leaderboard", label: "All time" },
] as const;

/**
 * The leaderboard's views. Links, not buttons: each is its own page. "This
 * season" is a plain link: it goes through a redirect to this month's page
 * (app/leaderboard/season/route.ts), which isn't something to prefetch.
 */
export function LeaderboardTabs({ current }: { current: (typeof TABS)[number]["id"] }) {
  return (
    <nav aria-label="Leaderboards" className="mt-6 flex gap-1 overflow-x-auto rounded-full bg-foreground/[0.06] p-1 [scrollbar-width:none] sm:inline-flex">
      {TABS.map((t) => {
        const Tag = t.id === "season" ? "a" : Link;
        return (
        <Tag
          key={t.id}
          href={t.href}
          aria-current={t.id === current ? "page" : undefined}
          className={`flex min-h-9 shrink-0 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-accent ${t.id === current ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
        >
          {t.label}
        </Tag>
        );
      })}
    </nav>
  );
}
