"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Avatar } from "@/components/account/avatar";
import { useAccount } from "@/components/account/account-provider";
import { primaryButton, secondaryButton } from "@/components/account/settings/styles";
import { Card } from "@/components/ui/card";
import { ChangeBadge } from "@/components/ui/change-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { formatCurrency, formatDate, formatCount, formatPercent, formatShare, formatSignedCurrency } from "@/lib/format";
import { summarizePortfolio } from "@/lib/portfolio";
import { profileOverviewAction, type ProfileOverview } from "@/lib/profile-actions";
import { seasonLabel, seasonReturn } from "@/lib/seasons";

type Loaded = Exclude<ProfileOverview, { kind: "none" }>;

/** "October 2026". */
const monthYear = (time: number) => new Date(time).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Your profile (app/profile): who you are on MarketLab and your key numbers
 * at a glance. Private: only you see it. The portfolio is valued here from
 * the account the rest of the app uses (so it always matches the portfolio
 * page); everything else comes from profileOverviewAction.
 */
export function ProfileView() {
  const { data: session, isPending } = authClient.useSession();
  const { account, quotes, book } = useAccount();
  const owner = isPending ? null : (session?.user.id ?? "guest");
  const [loaded, setLoaded] = useState<{ for: string; overview: ProfileOverview } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    profileOverviewAction()
      .then((overview) => !cancelled && setLoaded({ for: owner, overview }))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [owner]);

  const overview = loaded?.for === owner ? loaded.overview : null;
  if (failed) return <p className="mt-8 text-sm text-loss">Couldn&apos;t load your profile. Reload the page to try again.</p>;
  if (!overview) return <ProfileSkeleton />;
  if (overview.kind === "none") return <EmptyProfile />;

  const name = session?.user.name ?? "Guest";
  const portfolio = account ? summarizePortfolio(account.holdings, Object.values(quotes), account.cash, account.options) : null;
  const { stats } = overview;
  const winRate = stats.trades.closed > 0 ? stats.trades.wins / stats.trades.closed : null;

  return (
    <div className="mt-8 grid gap-6">
      <Card aria-label="About you" className="flex flex-wrap items-center gap-5 sm:gap-6">
        <Avatar name={name} image={session?.user.image} size={96} className="text-3xl" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-semibold tracking-tight">{overview.kind === "guest" ? "Guest" : name}</h2>
          <p className="mt-1 text-sm text-muted">
            {overview.kind === "guest" ? "Using MarketLab without an account, on this browser" : `Member since ${monthYear(stats.memberSince)}`}
            {stats.leaderboard && (
              <>
                {" · "}On the leaderboard as <span className="font-medium text-foreground">{stats.leaderboard.displayName}</span>
              </>
            )}
          </p>
          {overview.badges.length > 0 && (
            <p className="mt-2 text-lg" aria-label={`${overview.badges.length} badges`}>
              {[...new Set(overview.badges.map((b) => b.icon))].join(" ")}
            </p>
          )}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {overview.kind === "user" ? (
            <Link href="/account" className={primaryButton}>
              Edit profile
            </Link>
          ) : (
            <Link href="/sign-up" className={primaryButton}>
              Create an account
            </Link>
          )}
          <Link href="/account/data" className={secondaryButton}>
            Your data
          </Link>
        </div>
      </Card>

      <section aria-labelledby="key-stats">
        <h2 id="key-stats" className="text-lg font-semibold tracking-tight">
          Key stats
        </h2>
        {book.id !== null && <p className="mt-1 text-sm text-muted">Portfolio numbers are for the portfolio you&apos;re trading in: {book.label}.</p>}
        <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Portfolio value" value={portfolio ? formatCurrency(portfolio.totalValue) : null}>
            {portfolio && <ChangeBadge change={portfolio.dayChange} percent={portfolio.dayChangePercent} currency />}
            {portfolio && <span className="text-muted"> today</span>}
          </Stat>
          <Stat label="Gain on what you hold" value={portfolio ? formatSignedCurrency(portfolio.totalGain) : null}>
            {portfolio && portfolio.costBasis > 0 && <span className="text-muted">{formatPercent(portfolio.totalGainPercent)} on cost</span>}
          </Stat>
          <Stat label="Gains locked in by selling" value={formatSignedCurrency(stats.trades.realized)}>
            <span className="text-muted">over {formatCount(stats.trades.closed)} {stats.trades.closed === 1 ? "sale" : "sales"}</span>
          </Stat>
          <Stat label="Trades" value={formatCount(stats.trades.total)}>
            <span className="text-muted">
              {formatCount(stats.trades.symbols)} {stats.trades.symbols === 1 ? "stock" : "stocks"}
            </span>
          </Stat>
          <Stat label="Winning sales" value={winRate === null ? "—" : formatShare(winRate)}>
            <span className="text-muted">{winRate === null ? "No sales yet" : `${stats.trades.wins} of ${stats.trades.closed} at a profit`}</span>
          </Stat>
          <Stat label="Lessons passed" value={`${overview.lessons.passed} of ${overview.lessons.total}`}>
            <Progress value={overview.lessons.passed} max={overview.lessons.total} label="Lessons passed" />
          </Stat>
          <Stat label="Badges" value={formatCount(overview.badges.length)}>
            <span className="text-muted">Earned for lessons, streaks and seasons</span>
          </Stat>
          <Stat label="All-time leaderboard" value={overview.standing ? `#${overview.standing.rank}` : "—"}>
            <span className="text-muted">
              {overview.standing ? `of ${overview.standing.of} · ${formatPercent(overview.standing.returnSinceJoining)} since joining` : stats.leaderboard ? "Ranked at the next update" : "Not on it"}
            </span>
          </Stat>
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <TradingCard stats={stats} />
        <ActivityCard stats={stats} lessons={overview.lessons} />
        <BadgesCard badges={overview.badges} />
        <SeasonsCard seasons={stats.seasons} guest={overview.kind === "guest"} />
      </div>

      <p className="text-sm text-muted">
        Only you can see this page. What other people can see, and everything else we keep, is in the{" "}
        <Link href="/privacy" className="text-accent hover:underline">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}

/** One key number, with a line of context under it. */
function Stat({ label, value, children }: { label: string; value: string | null; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-linear-to-b from-surface-raised to-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value ?? <Skeleton className="h-8 w-28" />}</dd>
      {children && <dd className="mt-1 text-sm tabular-nums">{children}</dd>}
    </div>
  );
}

function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <span className="mt-2 block h-2 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span className="block h-full rounded-full bg-accent-fill" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </span>
  );
}

/** Label–value rows inside a card. */
function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="mt-3 space-y-2 text-sm tabular-nums">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 border-t border-border pt-2 first:border-0 first:pt-0">
          <dt className="text-muted">{label}</dt>
          <dd className="text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TradingCard({ stats }: { stats: Loaded["stats"] }) {
  const t = stats.trades;
  const trade = (x: NonNullable<typeof t.best>) => (
    <>
      <span className={x.gain >= 0 ? "text-gain" : "text-loss"}>{formatSignedCurrency(x.gain)}</span> <span className="text-muted">on {x.symbol}</span>
    </>
  );
  return (
    <Card aria-labelledby="trading-heading">
      <h2 id="trading-heading" className="text-lg font-semibold tracking-tight">
        Trading
      </h2>
      {t.total === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No trades yet.{" "}
          <Link href="/stocks" className="text-accent hover:underline">
            Find a stock to buy
          </Link>
        </p>
      ) : (
        <Rows
          rows={[
            ["Buys and sells", `${formatCount(t.buys)} bought · ${formatCount(t.sells)} sold`],
            ["First trade", t.first ? formatDate(t.first) : "—"],
            ["Latest trade", t.last ? formatDate(t.last) : "—"],
            ["Best sale", t.best ? trade(t.best) : "—"],
            ["Worst sale", t.worst ? trade(t.worst) : "—"],
            ["Trades with a reason noted", `${formatCount(t.journaled)} of ${formatCount(t.total)}`],
          ]}
        />
      )}
      <p className="mt-4 text-sm">
        <Link href="/portfolio#review" className="text-accent hover:underline">
          Review your trades
        </Link>
      </p>
    </Card>
  );
}

function ActivityCard({ stats, lessons }: { stats: Loaded["stats"]; lessons: Loaded["lessons"] }) {
  return (
    <Card aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="text-lg font-semibold tracking-tight">
        Learning and research
      </h2>
      <Rows
        rows={[
          ["Lessons passed", `${lessons.passed} of ${lessons.total}`],
          ["Stocks on your watchlist", formatCount(stats.watching)],
          ["Alerts waiting", formatCount(stats.alerts.active)],
          ["Alerts that went off", formatCount(stats.alerts.triggered)],
          ["Saved backtests and screens", formatCount(stats.savedRuns)],
        ]}
      />
      <p className="mt-4 text-sm">
        <Link href="/learn" className="text-accent hover:underline">
          {lessons.passed < lessons.total ? "Continue learning" : "Revisit the lessons"}
        </Link>
      </p>
    </Card>
  );
}

function BadgesCard({ badges }: { badges: Loaded["badges"] }) {
  return (
    <Card aria-labelledby="badges-heading">
      <h2 id="badges-heading" className="text-lg font-semibold tracking-tight">
        Badges
      </h2>
      {badges.length === 0 ? (
        <p className="mt-3 text-sm text-muted">None yet: pass a lesson, keep up a seven-day streak, or finish a season.</p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {badges.map((b) => (
            <li key={`${b.kind}:${b.scope}`} className="flex items-start gap-3 rounded-xl bg-foreground/[0.04] p-3">
              <span aria-hidden className="text-2xl leading-none">
                {b.icon}
              </span>
              <span className="text-sm">
                <span className="font-medium">{b.label}</span>
                {b.scope && <span className="text-muted"> · {seasonLabel(b.scope, { short: true })}</span>}
                <span className="block text-muted">
                  {b.detail}. {formatDate(b.earnedAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SeasonsCard({ seasons, guest }: { seasons: Loaded["stats"]["seasons"]; guest: boolean }) {
  return (
    <Card aria-labelledby="seasons-heading">
      <h2 id="seasons-heading" className="text-lg font-semibold tracking-tight">
        Competitions
      </h2>
      {seasons.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          {guest ? "Monthly competitions are for accounts. " : "You haven't entered a monthly competition yet. "}
          {/* Not prefetched: /leaderboard/season redirects to the current month, and prefetching a redirect breaks over plain http. */}
          <Link href="/leaderboard/season" prefetch={false} className="text-accent hover:underline">
            See this month&apos;s
          </Link>
        </p>
      ) : (
        <Rows
          rows={seasons.map((s): [string, ReactNode] => [
            seasonLabel(s.seasonId),
            s.finalRank !== null && s.finalValue !== null ? (
              <>
                #{s.finalRank} of {s.entrants}{" "}
                <span className={s.finalValue >= s.startValue ? "text-gain" : "text-loss"}>{formatPercent(seasonReturn(s.finalValue, s.startValue))}</span>
              </>
            ) : (
              <span className="text-muted">In progress · {s.entrants} entered</span>
            ),
          ])}
        />
      )}
    </Card>
  );
}

function EmptyProfile() {
  return (
    <Card className="mt-8 max-w-2xl">
      <h2 className="text-lg font-semibold">Nothing here yet</h2>
      <p className="mt-2 text-sm text-muted">
        Your profile fills in as you use MarketLab: trades, lessons, badges and competitions. Make a trade or pass a lesson to start, or create an account to keep it
        everywhere.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/sign-up" className={primaryButton}>
          Create an account
        </Link>
        <Link href="/sign-in" className={secondaryButton}>
          Sign in
        </Link>
      </div>
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mt-8 grid gap-6" aria-busy>
      <span className="sr-only">Loading your profile…</span>
      <Skeleton className="h-36" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
