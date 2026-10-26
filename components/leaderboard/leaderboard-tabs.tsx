import { LinkTabs } from "@/components/ui/link-tabs";

const TABS = {
  // A plain link: it goes through a redirect to this month's page (app/leaderboard/season/route.ts), which isn't something to prefetch.
  season: { href: "/leaderboard/season", label: "This season", plain: true },
  seasons: { href: "/leaderboard/seasons", label: "Past seasons" },
  all: { href: "/leaderboard", label: "All time" },
};

/** The leaderboard's views, each its own page. */
export function LeaderboardTabs({ current }: { current: keyof typeof TABS }) {
  return <LinkTabs label="Leaderboards" tabs={Object.values(TABS)} current={TABS[current].href} />;
}
