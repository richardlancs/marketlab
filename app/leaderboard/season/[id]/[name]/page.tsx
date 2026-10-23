import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { BADGES } from "@/lib/badges";
import { formatCurrency, formatPercent } from "@/lib/format";
import { seasonIdOf, seasonLabel } from "@/lib/seasons";
import { findEntry } from "./entry";

export async function generateMetadata(props: PageProps<"/leaderboard/season/[id]/[name]">): Promise<Metadata> {
  const { id, name } = await props.params;
  const found = await findEntry(id, name);
  if (!found) return { title: "Player not found — MarketLab" };
  const { row, board } = found;
  const title = `${row.displayName}: #${row.rank} of ${board.entrants} in the ${seasonLabel(id)} season`;
  return { title: `${title} — MarketLab`, description: `${formatPercent(row.return)} on a $100,000 start. A MarketLab competition with simulated prices.`, openGraph: { title } };
}

/**
 * One player's season, to share: their place, return and badges. The image is
 * opengraph-image.tsx. The player is looked up when the page is asked for
 * (behind Suspense), not from a cached board: people open it right after
 * joining. The title comes from the cached board, which is fine for a title.
 */
export default function SeasonEntryPage(props: PageProps<"/leaderboard/season/[id]/[name]">) {
  return (
    <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-8 sm:px-6 lg:py-12">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-foreground/[0.04]" aria-hidden />}>
        <Entry params={props.params} />
      </Suspense>
    </main>
  );
}

async function Entry({ params }: { params: PageProps<"/leaderboard/season/[id]/[name]">["params"] }) {
  const { id, name } = await params;
  await connection();
  const found = await findEntry(id, name, { fresh: true });
  if (!found) notFound();
  const { row, board } = found;
  const label = seasonLabel(id);

  return (
    <>
      <Link href={`/leaderboard/season/${id}`} className="tap inline-block text-sm text-accent hover:underline">
        ← {label} season
      </Link>
      <Card aria-labelledby="entry" className="mt-4 text-center">
        <p className="text-sm text-muted">{board.status === "closed" ? "Finished" : "Currently"}</p>
        <p className="mt-1 text-6xl font-semibold tracking-tight tabular-nums">#{row.rank}</p>
        <p className="text-sm text-muted">of {board.entrants}</p>
        <h1 id="entry" className="mt-4 text-2xl font-semibold tracking-tight">
          {row.displayName}
        </h1>
        <p className={`mt-1 text-xl font-semibold tabular-nums ${row.return >= 0 ? "text-gain" : "text-loss"}`}>{formatPercent(row.return)}</p>
        <p className="text-sm text-muted">{formatCurrency(row.value)} from a $100,000 start</p>
        {row.badges.length > 0 && (
          <ul className="mt-4 flex flex-wrap justify-center gap-2">
            {row.badges.map((b) => (
              <li key={b.kind} className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-xs font-medium">
                <span aria-hidden>{BADGES[b.kind].icon}</span>
                {BADGES[b.kind].label}
                {b.count > 1 && <span className="text-muted">×{b.count}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-xs text-muted">{label} season on MarketLab. Simulated prices; not investment advice.</p>
      </Card>
      <p className="mt-4 text-center text-sm">
        <Link href={`/leaderboard/season/${seasonIdOf(board.asOf)}`} className="tap font-medium text-accent hover:underline">
          Play this month&apos;s season →
        </Link>
      </p>
    </>
  );
}
