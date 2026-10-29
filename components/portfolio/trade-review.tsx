"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/components/account/account-provider";
import { RandomVersions, SharpeRangeView } from "@/components/analytics/luck-views";
import { ComparisonChart } from "@/components/charts/comparison-chart";
import { Card } from "@/components/ui/card";
import { Explain } from "@/components/ui/explain";
import { ServiceError } from "@/components/ui/service-data";
import { formatCurrency, formatDate, formatPercent, formatShare, formatSignedCurrency } from "@/lib/format";
import { accountLuckAction, reviewAction } from "@/lib/review-actions";
import { REASON_NAMES } from "@/lib/trading";
import { accountLuckVerdict, dispositionVerdict, type AccountLuck, type ReviewResult, type RoundTrip, type TradeReview as Review } from "@/lib/review/types";

type State<T> = { status: "idle" | "loading" } | { status: "error"; message: string } | { status: "done"; result: T };
const DASH = "—";
const share = (v: number | null) => (v === null ? DASH : formatShare(v));
const signed = (v: number | null) => (v === null ? DASH : formatPercent(v));
const tone = (v: number | null) => (v === null || v === 0 ? "" : v > 0 ? "text-gain" : "text-loss");
/** Round trips shown before "Show all". */
const FIRST = 12;
/** Round trips each reason needs before reasons are compared. */
const PER_REASON = 3;

/**
 * The portfolio's Review tab: the visitor's own trades reviewed by the
 * analytics service (lib/review): round trips (FIFO), what happened after
 * each sale, the disposition effect, how the account compares with doing
 * nothing, results by the reasons given, and "Was it luck?" on request.
 *
 * All the portfolio's tabs are rendered at once (hidden until chosen), so the
 * review loads only once this tab is on screen, and again after a new trade
 * or a changed note.
 */
export function TradeReview() {
  const { account } = useAccount();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ request: string; state: State<ReviewResult> } | null>(null);
  // What to ask for: the trades and their notes (a new trade or note asks again), and the retry count.
  const request = account ? `${attempt}#${account.trades.map((t) => `${t.id}:${t.reason ?? ""}:${t.note ?? ""}`).join("|")}` : null;
  const requested = useRef<string | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || request === null || requested.current === request) return;
    requested.current = request;
    reviewAction()
      .then((outcome) => setResult({ request, state: outcome.ok ? { status: "done", result: outcome.result } : { status: "error", message: outcome.message } }))
      .catch(() => setResult({ request, state: { status: "error", message: "Couldn't reach the server. Check your connection and try again." } }));
  }, [visible, request]);

  // While a new review loads, the last good one stays on screen.
  const state: State<ReviewResult> = result && (result.request === request || result.state.status === "done") ? result.state : { status: "loading" };

  return (
    <div ref={ref} className="flex flex-col gap-4 lg:gap-6">
      <Card aria-labelledby="review-heading">
        <h2 id="review-heading" className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
          Review your trading <Explain term="dispositionEffect" />
        </h2>
        <p className="text-sm text-muted">What your trades did, the habits behind them, and whether trading helped at all.</p>
        {(state.status === "idle" || state.status === "loading") && <div aria-busy className="mt-4 h-48 animate-pulse rounded-lg bg-foreground/[0.06]" />}
        {state.status === "error" && <ServiceError message={state.message} onRetry={() => setAttempt((n) => n + 1)} />}
        {state.status === "done" && state.result.status === "no-trades" && (
          <p className="mt-3 text-sm text-muted">
            No trades yet. Buy or sell from any{" "}
            <Link href="/stocks" className="text-accent hover:underline">
              stock&apos;s page
            </Link>
            , and this shows how your trades worked out.
          </p>
        )}
        {state.status === "done" && state.result.status === "ok" && <Summary r={state.result} />}
      </Card>
      {state.status === "done" && state.result.status === "ok" && (
        <>
          {state.result.compared && <Compared c={state.result.compared} />}
          <AfterSales r={state.result} />
          {state.result.stops && <Stops stops={state.result.stops} />}
          <Habits r={state.result} />
          <AccountLuckCard />
          <RoundTrips r={state.result} />
        </>
      )}
    </div>
  );
}

function Tile({ label, value, note, className = "" }: { label: string; value: string; note?: string; className?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${className}`}>{value}</dd>
      {note && <dd className="text-xs text-muted">{note}</dd>}
    </div>
  );
}

function Summary({ r }: { r: Review }) {
  const s = r.summary;
  const differs = s.realised !== null && s.averageCostRealised !== null && Math.abs(s.realised - s.averageCostRealised) >= 0.01;
  if (s.roundTrips === 0) {
    return <p className="mt-3 text-sm text-muted">Nothing sold yet, so there are no completed trades to review. Your open positions are listed below.</p>;
  }
  return (
    <>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-5">
        <Tile label="Completed trades" value={String(s.roundTrips)} note={`${s.wins} won, ${s.losses} lost`} />
        <Tile label="Hit rate" value={share(s.hitRate)} note="share that made money" />
        <Tile label="Average win" value={signed(s.averageWinReturn)} note={s.averageWin !== null ? formatSignedCurrency(s.averageWin) : undefined} className="text-gain" />
        <Tile label="Average loss" value={signed(s.averageLossReturn)} note={s.averageLoss !== null ? formatSignedCurrency(s.averageLoss) : undefined} className="text-loss" />
        <Tile label="Median hold" value={s.medianDays === null ? DASH : `${Math.round(s.medianDays)} days`} note="trading days" />
      </dl>
      <p className="mt-4 text-sm">
        Gains locked in: <span className={`font-medium tabular-nums ${tone(s.realised)}`}>{s.realised === null ? DASH : formatSignedCurrency(s.realised)}</span>
        {s.profitFactor !== null && (
          <>
            {" "}
            · every $1 lost came with <span className="font-medium tabular-nums">{formatCurrency(s.profitFactor)}</span> won
          </>
        )}
        .
      </p>
      <p className="mt-1 text-xs text-muted">
        Each sale is matched with the oldest shares still held (first in, first out), so one sale can close parts of several purchases.
        {differs && ` Your activity list measures gains against the average cost instead (${formatSignedCurrency(s.averageCostRealised ?? 0)} in all), so the totals differ a little.`}{" "}
        Dividends aren&apos;t included.
      </p>
    </>
  );
}

function Compared({ c }: { c: NonNullable<Review["compared"]> }) {
  const index = (values: (number | null)[]) => values.map((v) => v ?? 0);
  const { actual, kept, benchmark } = c.returns;
  const helped = actual !== null && kept !== null ? actual - kept : null;
  return (
    <Card aria-labelledby="compared-heading">
      <h2 id="compared-heading" className="text-lg font-semibold tracking-tight">
        Compared with doing nothing
      </h2>
      <p className="mt-1 text-sm">
        Since {formatDate(c.start)}, a week after your first trade, your account returned <span className={`font-medium tabular-nums ${tone(actual)}`}>{signed(actual)}</span>. Keeping that week&apos;s holdings
        untouched would have returned <span className={`font-medium tabular-nums ${tone(kept)}`}>{signed(kept)}</span>, and the S&amp;P 500{" "}
        <span className={`font-medium tabular-nums ${tone(benchmark)}`}>{signed(benchmark)}</span>.
        {helped !== null && Math.abs(helped) >= 0.001 && <> Your trading since then {helped > 0 ? "added" : "cost"} {formatShare(Math.abs(helped))}.</>}
      </p>
      <div className="mt-4">
        <ComparisonChart
          label="Your account, your first week's holdings kept, and the S&P 500, from the same start"
          times={c.times}
          series={[
            { label: "Your account", color: "var(--series-1)", values: index(c.actual) },
            { label: "First week kept", color: "var(--series-3)", values: index(c.kept) },
            { label: "S&P 500", color: "var(--series-2)", dashed: true, values: index(c.benchmark) },
          ]}
        />
      </div>
      <p className="mt-2 text-xs text-muted">&ldquo;First week kept&rdquo;: the holdings and cash you had then, never traded again, dividends included.</p>
    </Card>
  );
}

function AfterSales({ r }: { r: Review }) {
  const [active, setActive] = useState<number | null>(null);
  const month = r.afterSales.summary["21"];
  const dots = r.afterSales.sales.filter((s) => s.after21 !== null);
  if (r.afterSales.sales.length === 0) return null;
  const values = dots.map((s) => s.after21 as number);
  const reach = Math.max(0.05, ...values.map(Math.abs)) * 1.1;
  const at = (v: number) => `${((v + reach) / (2 * reach)) * 100}%`;
  const shown = active !== null ? dots[active] : null;
  return (
    <Card aria-labelledby="after-heading">
      <h2 id="after-heading" className="text-lg font-semibold tracking-tight">
        After you sold
      </h2>
      {month.sales === 0 ? (
        <p className="mt-1 text-sm text-muted">Your sales are too recent: this needs a month of prices after a sale.</p>
      ) : (
        <>
          <p className="mt-1 text-sm">
            Over the month after each of your {month.sales} {month.sales === 1 ? "sale" : "sales"}, the stock moved{" "}
            <span className={`font-medium tabular-nums ${tone(month.average)}`}>{signed(month.average)}</span> on average, and rose after {share(month.rose)} of them.
            {month.averageVsMarket !== null &&
              (month.averageVsMarket > 0.005
                ? ` That's ${formatShare(month.averageVsMarket)} better than the S&P 500 over the same days: you tended to sell before further gains.`
                : month.averageVsMarket < -0.005
                  ? ` That's ${formatShare(-month.averageVsMarket)} worse than the S&P 500 over the same days: your sales tended to dodge a weak patch.`
                  : " That's about what the S&P 500 did over the same days.")}
          </p>
          <figure className="mt-5">
            <figcaption className="sr-only">Each sale&apos;s stock return over the next month</figcaption>
            <div className="relative h-12" onPointerLeave={() => setActive(null)}>
              <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
              <div className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: at(0) }} />
              {dots.map((s, i) => (
                <button
                  key={`${s.symbol}-${s.time}`}
                  type="button"
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  aria-label={`${s.symbol}, sold ${formatDate(s.time)}: ${signed(s.after21)} over the next month`}
                  className="absolute top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-accent"
                  style={{ left: at(s.after21 as number) }}
                >
                  <span className={`size-2.5 rounded-full ring-2 ring-surface ${(s.after21 as number) >= 0 ? "bg-gain" : "bg-loss"} ${active === i ? "scale-150" : ""}`} />
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
              <span>{formatPercent(-reach)}</span>
              <span>Next month after the sale</span>
              <span>{formatPercent(reach)}</span>
            </div>
            <p className="mt-1 min-h-4 text-xs text-muted">
              {shown ? (
                <>
                  <span className="font-medium text-foreground">{shown.symbol}</span> sold {formatDate(shown.time)} at {formatCurrency(shown.price)}: {signed(shown.after21)} over the next month
                  {shown.market21 !== null && ` (S&P 500 ${signed(shown.market21)})`}
                </>
              ) : (
                "One dot per sale. Right of the line: the stock kept rising after you sold."
              )}
            </p>
          </figure>
        </>
      )}
    </Card>
  );
}

function Habits({ r }: { r: Review }) {
  const d = r.disposition;
  const verdict = dispositionVerdict(d);
  const reasons = r.byReason.filter((g) => g.roundTrips >= PER_REASON);
  const compare = reasons.length >= 2;
  return (
    <Card aria-labelledby="habits-heading">
      <h2 id="habits-heading" className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
        Your habits <Explain term="dispositionEffect" />
      </h2>
      {verdict ? (
        <>
          <p className="mt-1 text-sm">{verdict}</p>
          <dl className="mt-4 space-y-2 text-xs sm:max-w-md">
            {[
              { label: "Gains taken", value: d.pgr ?? 0, color: "bg-gain/70" },
              { label: "Losses taken", value: d.plr ?? 0, color: "bg-loss/70" },
            ].map((row) => (
              <div key={row.label} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3">
                <dt className="text-muted">{row.label}</dt>
                <dd className="h-2 rounded-full bg-foreground/[0.06]">
                  <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.value * 100}%` }} />
                </dd>
                <dd className="text-right font-medium tabular-nums">{formatShare(row.value)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted">
            Across {d.sellDays} selling days: {d.realisedGains} gains and {d.realisedLosses} losses sold, {d.paperGains} gains and {d.paperLosses} losses kept. Each stock counts once a day, against the cost of the shares you held.
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">
          Whether you sell winners faster than losers shows after {d.minimumDays} days with a sale; you have {d.sellDays} so far.
        </p>
      )}

      <h3 className="mt-6 text-sm font-semibold">By your reasons</h3>
      {compare ? (
        <table className="mt-2 w-full text-sm tabular-nums">
          <caption className="sr-only">Completed trades grouped by the reason given when buying</caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="pb-1.5 text-left font-medium">Reason for buying</th>
              <th scope="col" className="pb-1.5 pl-3 text-right font-medium">Trades</th>
              <th scope="col" className="pb-1.5 pl-3 text-right font-medium">Hit rate</th>
              <th scope="col" className="pb-1.5 pl-3 text-right font-medium">Average</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {reasons.map((g) => (
              <tr key={g.reason}>
                <th scope="row" className="py-1.5 text-left font-medium">{REASON_NAMES[g.reason]}</th>
                <td className="py-1.5 pl-3 text-right">{g.roundTrips}</td>
                <td className="py-1.5 pl-3 text-right">{share(g.hitRate)}</td>
                <td className={`py-1.5 pl-3 text-right ${tone(g.averageReturn)}`}>{signed(g.averageReturn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-1 text-sm text-muted">
          Add a reason when you buy (&ldquo;Why?&rdquo; on any stock&apos;s trade card, or &ldquo;Add why&rdquo; in Activity). Once two reasons have {PER_REASON} completed trades each, this compares them.
        </p>
      )}
      {compare && <p className="mt-2 text-xs text-muted">A handful of trades per reason is a small sample: treat differences as questions, not answers.</p>}
    </Card>
  );
}

function AccountLuckCard() {
  const [state, setState] = useState<State<AccountLuck>>({ status: "idle" });
  async function check() {
    setState({ status: "loading" });
    try {
      const outcome = await accountLuckAction();
      setState(outcome.ok ? { status: "done", result: outcome.result } : { status: "error", message: outcome.message });
    } catch {
      setState({ status: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }
  const result = state.status === "done" ? state.result : null;
  return (
    <Card aria-labelledby="account-luck-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="account-luck-heading" className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
            Was it luck? <Explain term="luck" />
          </h2>
          <p className="text-sm text-muted">Your trades against 1,000 random traders with your habits.</p>
        </div>
        {state.status !== "done" && (
          <button
            type="button"
            onClick={check}
            disabled={state.status === "loading"}
            className="h-9 rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {state.status === "loading" ? "Checking…" : "Was it luck?"}
          </button>
        )}
      </div>
      {state.status === "loading" && <div aria-busy className="mt-4 h-40 animate-pulse rounded-lg bg-foreground/[0.06]" />}
      {state.status === "error" && (
        <p role="alert" className="mt-3 text-sm text-loss">
          {state.message}
        </p>
      )}
      {result && (
        <div className="mt-4 space-y-8">
          {result.timing && (
            <RandomVersions
              c={result.timing}
              verdict={accountLuckVerdict(result.timing)}
              lineName="your trades"
              thisLabel="Your trades"
              measure="Return on money traded"
              method={`Timing: each of your ${result.trips} trades keeps its stock and how long you held it, at random dates since your first trade. Valued simply (money in × the stock's return while held, dividends included), so the line can differ a little from your account's gains.`}
            />
          )}
          {result.picking && (
            <RandomVersions
              c={result.picking}
              verdict={accountLuckVerdict(result.picking)}
              lineName="your trades"
              thisLabel="Your trades"
              measure="Return on money traded"
              method="Picking: each trade keeps its dates and money, in a random catalog stock that had prices on both days."
            />
          )}
          {result.sharpeRange && <SharpeRangeView r={result.sharpeRange} benchmarkName="S&P 500" subject="Your account's" thisLabel="Your account" what="the account" />}
          {result.notes.map((note) => (
            <p key={note} className="text-sm text-muted">
              {note}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

/** What stocks did after a stop-loss or trailing stop sold them: did the stop save money, or sell before a rebound? */
function Stops({ stops }: { stops: NonNullable<Review["stops"]> }) {
  const month = stops.summary["21"];
  const all = stops.sales.length;
  return (
    <Card aria-labelledby="stops-heading">
      <h2 id="stops-heading" className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
        Your stops <Explain term="trailingStop" />
      </h2>
      <p className="mt-1 text-sm">
        {all} {all === 1 ? "sale was" : "sales were"} filled by a stop-loss or trailing stop.{" "}
        {month.sales === 0
          ? "They're too recent to judge: this needs a month of prices after each."
          : month.average === null
            ? ""
            : month.average > 0.005
              ? `Over the next month the stock rose ${formatShare(month.average)} on average (after ${share(month.rose)} of them): your stops tended to sell before a rebound. Wider stops, or fewer, might have kept you in.`
              : month.average < -0.005
                ? `Over the next month the stock fell a further ${formatShare(-month.average)} on average: your stops tended to get you out before more losses.`
                : "Over the next month the stock moved little on average: your stops neither saved nor cost much."}
      </p>
    </Card>
  );
}

function RoundTrips({ r }: { r: Review }) {
  const [all, setAll] = useState(false);
  const trips = all ? r.roundTrips : r.roundTrips.slice(0, FIRST);
  if (r.roundTrips.length === 0 && r.open.length === 0) return null;
  return (
    <Card aria-labelledby="trips-heading" className="overflow-x-auto">
      <h2 id="trips-heading" className="text-lg font-semibold tracking-tight">
        Trade by trade
      </h2>
      {r.roundTrips.length > 0 && (
        <table className="mt-3 w-full text-sm tabular-nums">
          <caption className="sr-only">Completed trades, newest sale first</caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="pb-1.5 text-left font-medium">Stock</th>
              <th scope="col" className="pb-1.5 pl-3 text-left font-medium">Opened → closed</th>
              <th scope="col" className="hidden pb-1.5 pl-3 text-right font-medium sm:table-cell">Days</th>
              <th scope="col" className="pb-1.5 pl-3 text-right font-medium">Return</th>
              <th scope="col" className="hidden pb-1.5 pl-3 text-right font-medium sm:table-cell">Gain</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {trips.map((t, i) => (
              <TripRow key={`${t.symbol}-${t.exit}-${t.entry ?? "start"}-${i}`} t={t} />
            ))}
          </tbody>
        </table>
      )}
      {r.roundTrips.length > FIRST && (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
          {all ? "Show fewer" : `Show all ${r.roundTrips.length}`}
        </button>
      )}
      {r.open.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold">Still open</h3>
          <ul className="mt-2 divide-y divide-border text-sm tabular-nums">
            {r.open.map((l, i) => (
              <li key={`${l.symbol}-${l.entry ?? "start"}-${i}`} className="flex flex-wrap justify-between gap-x-4 py-1.5">
                <span>
                  <Link href={`/stocks/${l.symbol}`} className="font-semibold hover:text-accent">
                    {l.symbol}
                  </Link>{" "}
                  <span className="text-muted">
                    {l.shares} {l.side === "short" ? "short " : ""}from {l.entry === null ? "the start" : formatDate(l.entry)} at {formatCurrency(l.entryPrice)}
                    {l.reason && ` · ${REASON_NAMES[l.reason]}`}
                  </span>
                </span>
                <span className={tone(l.return)}>
                  {signed(l.return)} · {formatSignedCurrency(l.gain)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function TripRow({ t }: { t: RoundTrip }) {
  return (
    <tr>
      <td className="py-2 whitespace-nowrap">
        <Link href={`/stocks/${t.symbol}`} className="font-semibold hover:text-accent">
          {t.symbol}
        </Link>
        {t.option && ` ${formatCurrency(t.option.strike)} ${t.option.kind}`}
        <span className="block text-xs text-muted">
          {t.shares} {t.option ? (t.shares === 1 ? "contract" : "contracts") : t.shares === 1 ? "share" : "shares"}
          {t.side === "short" && (t.option ? " · written" : " · short")}
          {t.reason && ` · ${REASON_NAMES[t.reason]}`}
        </span>
      </td>
      <td className="py-2 pl-3 whitespace-nowrap">
        {t.entry === null ? <span className="text-muted">Start</span> : formatDate(t.entry)} → {formatDate(t.exit)}
        <span className="block text-xs text-muted">
          {formatCurrency(t.entryPrice)} → {formatCurrency(t.exitPrice)}
        </span>
      </td>
      <td className="hidden py-2 pl-3 text-right sm:table-cell">{t.days ?? DASH}</td>
      <td className={`py-2 pl-3 text-right ${tone(t.return)}`}>{signed(t.return)}</td>
      <td className={`hidden py-2 pl-3 text-right sm:table-cell ${tone(t.gain)}`}>{formatSignedCurrency(t.gain)}</td>
    </tr>
  );
}
