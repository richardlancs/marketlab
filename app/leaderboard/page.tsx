import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { getStandings } from "@/lib/leaderboard-data";

export const metadata: Metadata = { title: "Leaderboard — MarketLab" };

/**
 * Simulated portfolios of users who chose to join, ranked by their return
 * since joining. Only display names are shown. The standings are cached for a
 * few minutes; joining or leaving refreshes them at once.
 */
export default async function LeaderboardPage() {
  const rows = await getStandings();

  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Leaderboard</h1>
        <p className="mt-2 text-muted">
          Simulated portfolios, ranked by their return since joining, so a $10,000 start and a $100,000 one compete fairly. Members choose a display name;
          nothing else about them is shown. Prices are simulated.
        </p>
      </div>

      <div style={{ animationDelay: "60ms" }} className="mt-8 animate-fade-up">
        <Card aria-label="Standings" className="overflow-x-auto py-2">
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">Nobody has joined yet. Be the first, from your portfolio page.</p>
          ) : (
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">Members ranked by return since joining</caption>
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">
                    #
                  </th>
                  <th scope="col" className="py-2 text-left font-medium">
                    Member
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right font-medium">
                    Return since joining
                  </th>
                  <th scope="col" className="hidden py-2 pl-4 text-right font-medium sm:table-cell">
                    Portfolio value
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right font-medium">
                    Days
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.displayName}>
                    <td className="py-2.5 pr-3 text-muted">{row.rank}</td>
                    <th scope="row" className="py-2.5 text-left font-medium">
                      {row.displayName}
                    </th>
                    <td className={`py-2.5 pl-4 text-right font-semibold ${row.returnSinceJoining > 0.00005 ? "text-gain" : row.returnSinceJoining < -0.00005 ? "text-loss" : ""}`}>
                      {formatPercent(row.returnSinceJoining)}
                    </td>
                    <td className="hidden py-2.5 pl-4 text-right sm:table-cell">{formatCurrency(row.value)}</td>
                    <td className="py-2.5 pl-4 text-right text-muted">{row.daysOnBoard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <p className="mt-3 text-xs text-muted">
          Updated every few minutes. Join or leave from your{" "}
          <Link href="/portfolio" className="text-accent hover:underline">
            portfolio
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
