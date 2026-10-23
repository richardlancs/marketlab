import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LeaderboardTabs } from "@/components/leaderboard/leaderboard-tabs";
import { RaceChart } from "@/components/leaderboard/race-chart";
import { SeasonPanel } from "@/components/leaderboard/season-panel";
import { Card } from "@/components/ui/card";
import { BADGES } from "@/lib/badges";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { getSeasonBoard, type BoardRow } from "@/lib/season-data";
import { isSeasonId, JOIN_DAYS, joinDeadline, seasonIdOf, seasonLabel, STARTING_CASH } from "@/lib/seasons";

/** This month's season is built ahead of time; other months on their first visit (proxy.ts 404s ids that aren't months). */
export async function generateStaticParams() {
  return [{ id: seasonIdOf(Date.now()) }];
}

export async function generateMetadata(props: PageProps<"/leaderboard/season/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  return { title: isSeasonId(id) ? `${seasonLabel(id)} season — MarketLab` : "Season not found — MarketLab" };
}

/**
 * One season: your part in it, the race so far, and the standings. The board
 * is cached for a few minutes (lib/season-data.ts) and refreshed when someone
 * joins or the daily job records a close.
 */
export default function SeasonPage(props: PageProps<"/leaderboard/season/[id]">) {
  // The page doesn't await `params` itself: everything that needs the season is behind Suspense, like the stock page.
  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Suspense fallback={<div className="h-[36rem] animate-pulse rounded-2xl bg-foreground/[0.04]" aria-hidden />}>
        <Season params={props.params} />
      </Suspense>
    </main>
  );
}

async function Season({ params }: { params: PageProps<"/leaderboard/season/[id]">["params"] }) {
  const { id } = await params;
  if (!isSeasonId(id)) notFound();
  const board = await getSeasonBoard(id);
  const label = seasonLabel(id);
  const current = id === seasonIdOf(board.asOf);

  const status =
    board.status === "closed"
      ? `Final standings · ${board.entrants} ${board.entrants === 1 ? "player" : "players"}`
      : `${board.status === "open" ? `Joining open until ${formatDate(joinDeadline(id) - 1)}` : "Joining closed"} · ${board.entrants} ${board.entrants === 1 ? "player" : "players"} · ${board.daysLeft} ${board.daysLeft === 1 ? "day" : "days"} left`;

  return (
    <>
      <div className="animate-fade-up">
        <p className="text-sm font-medium text-accent">Competition</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{label} season</h1>
        <p className="mt-2 text-muted">{status}</p>
        <LeaderboardTabs current={current ? "season" : "seasons"} />
      </div>

      <div style={{ animationDelay: "60ms" }} className="mt-6 flex animate-fade-up flex-col gap-4 lg:gap-6">
        <Card aria-label="Your entry">
          <SeasonPanel seasonId={id} entrants={board.entrants} ranks={Object.fromEntries(board.rows.map((r) => [r.nameKey, r.rank]))} />
        </Card>

        <Card aria-labelledby="race">
          <h2 id="race" className="text-lg font-semibold tracking-tight">
            The race
          </h2>
          <p className="mt-1 text-sm text-muted">The top ten&apos;s return at each close, and yours.</p>
          <div className="mt-4">
            <RaceChart seasonId={id} top={board.race} />
          </div>
        </Card>

        <Card aria-labelledby="standings" className="py-2">
          <h2 id="standings" className="pt-3 text-lg font-semibold tracking-tight">
            Standings
          </h2>
          {board.rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">{board.status === "open" ? "Nobody has joined yet. Be the first." : board.status === "closed" ? "Nobody played this season." : "Nobody joined this season. The next one opens on the 1st."}</p>
          ) : (
            <ol className="mt-2 divide-y divide-border">
              {board.rows.map((row) => (
                <Standing key={row.nameKey} row={row} seasonId={id} />
              ))}
            </ol>
          )}
        </Card>

        <details className="rounded-2xl border border-border bg-surface px-4 text-sm sm:px-5">
          <summary className="cursor-pointer py-3 font-medium">How seasons work</summary>
          <ul className="list-disc space-y-1.5 pb-4 pl-5 text-muted">
            <li>Each calendar month is a season. Joining gives you a separate portfolio with {formatCurrency(STARTING_CASH)} in cash; your practice portfolio isn&apos;t touched.</li>
            <li>You can join during the first {JOIN_DAYS} days. Everyone starts with the same money, so the highest value wins; a tie goes to whoever joined first.</li>
            <li>The same market and trading rules apply as everywhere on MarketLab: simulated prices, trades at the close, dividends and splits paid.</li>
            <li>No resets during a season, and one entry each. Values are recorded at every close; the standings are final at the month&apos;s last close.</li>
            <li>Only display names are shown. Prices are simulated; nothing here is investment advice.</li>
          </ul>
        </details>
      </div>
    </>
  );
}

function Standing({ row, seasonId }: { row: BoardRow; seasonId: string }) {
  const tone = row.return > 0.00005 ? "text-gain" : row.return < -0.00005 ? "text-loss" : "";
  return (
    <li>
      <Link
        href={`/leaderboard/season/${seasonId}/${encodeURIComponent(row.nameKey)}`}
        className="grid min-h-14 grid-cols-[2.5rem_1fr_auto] items-center gap-2 rounded-xl px-1 py-2 transition-colors hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-accent sm:grid-cols-[3rem_1fr_auto_8rem]"
      >
        <span className={`text-center font-semibold tabular-nums ${row.rank <= 3 ? "text-foreground" : "text-muted"}`}>{row.rank}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{row.displayName}</span>
          {row.badges.length > 0 && (
            <span className="mt-0.5 flex gap-1 text-xs">
              {row.badges.slice(0, 4).map((b) => (
                <span key={b.kind} title={`${BADGES[b.kind].label}${b.count > 1 ? ` ×${b.count}` : ""}`}>
                  <span aria-hidden>{BADGES[b.kind].icon}</span>
                  <span className="sr-only">
                    {BADGES[b.kind].label}
                    {b.count > 1 ? ` ×${b.count}` : ""}
                  </span>
                </span>
              ))}
            </span>
          )}
        </span>
        <span className={`text-right font-semibold tabular-nums ${tone}`}>{formatPercent(row.return)}</span>
        <span className="hidden text-right text-sm text-muted tabular-nums sm:block">{formatCurrency(row.value)}</span>
      </Link>
    </li>
  );
}
