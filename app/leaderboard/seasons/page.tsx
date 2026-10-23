import type { Metadata } from "next";
import Link from "next/link";
import { LeaderboardTabs } from "@/components/leaderboard/leaderboard-tabs";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { getSeasonList } from "@/lib/season-data";
import { seasonLabel } from "@/lib/seasons";

export const metadata: Metadata = { title: "Seasons — MarketLab" };

/** Every season so far, newest first, with its winner. */
export default async function SeasonsPage() {
  const list = await getSeasonList();
  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Seasons</h1>
        <p className="mt-2 text-muted">Monthly competitions: everyone who joins starts with $100,000, and the best portfolio at the month&apos;s last close wins.</p>
        <LeaderboardTabs current="seasons" />
      </div>
      <Card aria-label="Seasons" className="mt-6 animate-fade-up py-2">
        {list.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No seasons have been played yet. Each one opens on the 1st of the month.</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((s) => (
              <li key={s.id}>
                <Link href={`/leaderboard/season/${s.id}`} className="flex min-h-14 items-center justify-between gap-3 rounded-xl px-1 py-2 hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-accent">
                  <span>
                    <span className="block font-medium">{seasonLabel(s.id)}</span>
                    <span className="block text-xs text-muted">
                      {s.entrants} {s.entrants === 1 ? "player" : "players"} · {s.closedAt ? "finished" : "running"}
                    </span>
                  </span>
                  {s.winner && (
                    <span className="text-right text-sm">
                      <span className="block font-medium">
                        <span aria-hidden>🏆 </span>
                        {s.winner.displayName}
                      </span>
                      <span className="block text-xs text-muted">{s.winner.finalValue !== null ? formatCurrency(s.winner.finalValue) : ""}</span>
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
