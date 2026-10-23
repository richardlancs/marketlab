"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { myBadgesAction, seasonStatusAction, type MyBadge, type SeasonStatus } from "@/lib/season-actions";
import { JOIN_DAYS, seasonIdOf, seasonLabel } from "@/lib/seasons";

const noSubscribe = () => () => {};

/**
 * Competitions, on the portfolio page: this month's season (join it, or how
 * to see where you stand) and the badges you've earned.
 */
export function SeasonCard() {
  const { mode } = useAccount();
  // This month's season, read in the browser (the page is prerendered, so it can't know today's date then).
  const id = useSyncExternalStore(noSubscribe, () => seasonIdOf(Date.now()), () => null);
  const [status, setStatus] = useState<SeasonStatus | null>(null);
  const [badges, setBadges] = useState<MyBadge[] | null>(null);

  useEffect(() => {
    if (mode === "loading" || !id) return;
    let cancelled = false;
    seasonStatusAction(id).then((s) => !cancelled && setStatus(s), () => {});
    if (mode === "signed-in") myBadgesAction().then((b) => !cancelled && setBadges(b), () => {});
    return () => {
      cancelled = true;
    };
  }, [id, mode]);

  if (!id) return null;
  const season = `${seasonLabel(id, { short: true })} season`;
  return (
    <Card aria-labelledby="competitions">
      <h2 id="competitions" className="text-lg font-semibold tracking-tight">
        Competitions
      </h2>
      <p className="mt-1 text-sm text-muted">Each month, everyone who joins starts again with $100,000. The best portfolio at the month&apos;s last close wins.</p>
      <div className="mt-3 text-sm">
        {status === null ? (
          <p className="text-muted">Loading…</p>
        ) : status.entry ? (
          <p>
            You&apos;re in the {season} as <strong className="font-semibold">{status.entry.displayName}</strong>.{" "}
            <Link href={`/leaderboard/season/${id}`} className="tap text-accent hover:underline">
              See the standings
            </Link>
          </p>
        ) : status.canJoin ? (
          <Link href={`/leaderboard/season/${id}`} className="inline-flex min-h-10 items-center rounded-full bg-accent-fill px-4 font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Join the {season}
          </Link>
        ) : (
          <p className="text-muted">
            Joining the {season} closed after its first {JOIN_DAYS} days; the next one opens on the 1st.{" "}
            <Link href={`/leaderboard/season/${id}`} className="tap text-accent hover:underline">
              Follow this one
            </Link>
          </p>
        )}
      </div>

      {mode === "signed-in" && (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="text-sm font-semibold">Badges</h3>
          {badges === null ? (
            <p className="mt-1 text-sm text-muted">Loading…</p>
          ) : badges.length === 0 ? (
            <p className="mt-1 text-sm text-muted">None yet: pass a lesson, keep a seven-day streak, or finish a season.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {badges.map((b) => (
                <li key={`${b.kind}:${b.scope}`} title={b.detail} className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-xs font-medium">
                  <span aria-hidden>{b.icon}</span>
                  {b.label}
                  {b.scope && <span className="text-muted">· {seasonLabel(b.scope, { short: true })}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {mode === "guest" && (
        <p className="mt-3 text-xs text-muted">
          <Link href="/sign-in" className="tap text-accent hover:underline">
            Sign in
          </Link>{" "}
          to join a season and earn badges.
        </p>
      )}
    </Card>
  );
}
