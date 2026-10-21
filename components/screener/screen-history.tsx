"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useAccount } from "@/components/account/account-provider";
import { ROWS } from "@/components/backtest/backtest-results";
import { RunProvenance } from "@/components/backtest/run-provenance";
import { ComparisonChart } from "@/components/charts/comparison-chart";
import { Card } from "@/components/ui/card";
import { Explain } from "@/components/ui/explain";
import { revealOnPhone } from "@/components/ui/reveal";
import { benchmarkLabel, percentileLabel, reasonFor, STATUS_LABELS, type SavedScreen, type ScreenMonth, type ScreenResult, type ScreenSettings } from "@/lib/analytics/history";
import { deleteBacktestAction } from "@/lib/backtest-actions";
import { MAX_RUN_NAME } from "@/lib/backtest/config";
import { formatCurrency, formatDate, formatPercent, formatShare } from "@/lib/format";
import {
  listSavedScreensAction,
  loadSavedScreenAction,
  reproduceSavedScreenAction,
  runScreenHistoryAction,
  saveScreenAction,
  type ReproduceScreenResult,
} from "@/lib/screen-actions";

const DAY = 86_400_000;
const toInput = (time: number) => new Date(time).toISOString().slice(0, 10);
const fromInput = (text: string) => Date.parse(`${text}T00:00:00Z`);
const input = "h-10 w-full rounded-lg border border-border bg-transparent px-3 text-base tabular-nums outline-none transition-colors focus-visible:border-accent sm:text-sm";
const label = "text-xs text-muted";
const secondary = "rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60";

type View =
  | { kind: "live"; settings: ScreenSettings; result: ScreenResult }
  | { kind: "saved"; run: SavedScreen; result: ScreenResult; reproduction: ReproduceScreenResult | "running" | null };

interface Form {
  start: string;
  end: string;
  cash: string;
  commission: string;
  slippage: string;
}

/**
 * "Test this screen over time": the Momentum leaders screen applied at the
 * start of every month, from the prices known then, over a chosen period.
 * The analytics service does the work; this sends the settings and shows
 * the result, the monthly picks and why, and saved runs.
 */
export function ScreenHistory({ firstDate, lastDate }: { firstDate: number; lastDate: number }) {
  // A year of prices is needed before the first ranking, so start no earlier than that by default.
  const earliestUseful = firstDate + 380 * DAY;
  const [form, setForm] = useState<Form>({
    start: toInput(Math.min(lastDate - 30 * DAY, Math.max(earliestUseful, lastDate - Math.round(3 * 365.25) * DAY))),
    end: toInput(lastDate),
    cash: "10000",
    commission: "1",
    slippage: "5",
  });
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, startRunning] = useTransition();
  const saved = useSavedScreens();
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  // On phones the results are below the form: bring each new one into view.
  useEffect(() => {
    if (view && !running) revealOnPhone(resultsHeading.current);
  }, [view, running]);

  const set = (change: Partial<Form>) => setForm((f) => ({ ...f, ...change }));

  function settingsOf(f: Form): ScreenSettings | string {
    const start = fromInput(f.start);
    const end = fromInput(f.end) + DAY - 1; // the whole end day
    const settings: ScreenSettings = {
      preset: "momentum",
      start,
      end,
      initialCash: Number(f.cash),
      costs: { commission: Number(f.commission), slippageBps: Number(f.slippage) },
    };
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return "Choose a start date before the end date.";
    if (!(settings.initialCash >= 100 && settings.initialCash <= 10_000_000)) return "Starting cash must be between $100 and $10,000,000.";
    if (!(settings.costs.commission >= 0 && settings.costs.commission <= 100) || !(settings.costs.slippageBps >= 0 && settings.costs.slippageBps <= 100)) {
      return "Commission and slippage must each be between 0 and 100.";
    }
    return settings;
  }

  function run(event: FormEvent) {
    event.preventDefault();
    const settings = settingsOf(form);
    if (typeof settings === "string") return setError(settings);
    setError(null);
    startRunning(async () => {
      const outcome = await runScreenHistoryAction(settings).catch(() => ({ ok: false as const, message: "The historical screen couldn't be run. Try again in a minute." }));
      if (outcome.ok) setView({ kind: "live", settings, result: outcome.result });
      else setError(outcome.message);
    });
  }

  async function open(id: string) {
    setError(null);
    const outcome = await loadSavedScreenAction(id).catch(() => ({ ok: false as const, message: "Couldn't open the run. Try again in a minute." }));
    if (!outcome.ok) return setError(outcome.message);
    const { config } = outcome.run;
    setForm({ start: toInput(config.start), end: toInput(config.end), cash: String(config.initialCash), commission: String(config.costs.commission), slippage: String(config.costs.slippageBps) });
    setView({ kind: "saved", run: outcome.run, result: outcome.result, reproduction: null });
  }

  async function reproduce(run: SavedScreen) {
    setView((v) => (v?.kind === "saved" ? { ...v, reproduction: "running" } : v));
    const outcome = await reproduceSavedScreenAction(run.id).catch(() => ({ ok: false as const, message: "Couldn't reproduce the run. Try again in a minute." }));
    setView((v) => (v?.kind === "saved" && v.run.id === run.id ? { ...v, reproduction: outcome } : v));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="screen-settings">
          <h2 id="screen-settings" className="text-lg font-semibold tracking-tight">
            Monthly momentum leaders
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted">
            <li>On the first trading day of each month, every catalog stock is ranked using prices up to the day before.</li>
            <li>
              It qualifies when its 12-1 momentum <Explain term="momentum" /> is in the top fifth and its last close is above its 200-day average <Explain term="sma" />.
            </li>
            <li>The top five by momentum get 20% each; fewer qualifiers leave the rest in cash. They&apos;re held until the next month.</li>
          </ul>
          <form onSubmit={run} className="mt-4 flex flex-col gap-3" aria-describedby="screen-form-note">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="screen-start" className={label}>
                  Start
                </label>
                <input id="screen-start" type="date" min={toInput(firstDate)} max={toInput(lastDate)} value={form.start} onChange={(e) => set({ start: e.target.value })} className={`${input} mt-1`} />
              </div>
              <div>
                <label htmlFor="screen-end" className={label}>
                  End
                </label>
                <input id="screen-end" type="date" min={toInput(firstDate)} max={toInput(lastDate)} value={form.end} onChange={(e) => set({ end: e.target.value })} className={`${input} mt-1`} />
              </div>
            </div>
            <div>
              <label htmlFor="screen-cash" className={label}>
                Starting cash ($)
              </label>
              <input id="screen-cash" type="number" inputMode="decimal" min={100} max={10_000_000} step="any" value={form.cash} onChange={(e) => set({ cash: e.target.value })} className={`${input} mt-1`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="screen-commission" className={label}>
                  Commission per trade ($)
                </label>
                <input id="screen-commission" type="number" inputMode="decimal" min={0} max={100} step="any" value={form.commission} onChange={(e) => set({ commission: e.target.value })} className={`${input} mt-1`} />
              </div>
              <div>
                <label htmlFor="screen-slippage" className={label}>
                  Slippage (basis points)
                </label>
                <input id="screen-slippage" type="number" inputMode="decimal" min={0} max={100} step="any" value={form.slippage} onChange={(e) => set({ slippage: e.target.value })} className={`${input} mt-1`} />
              </div>
            </div>
            <p id="screen-form-note" className="text-xs text-muted">
              Prices begin {formatDate(firstDate)}. Ranking needs about a year of earlier prices, so results can start no earlier than about {formatDate(earliestUseful)}.
            </p>
            <button
              type="submit"
              disabled={running}
              className="h-11 w-full rounded-full bg-accent-fill text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {running ? "Testing…" : "Test this screen over time"}
            </button>
          </form>
        </Card>
        <SavedScreens saved={saved} activeId={view?.kind === "saved" ? view.run.id : null} onOpen={open} />
      </div>

      <div className="min-w-0" aria-live="polite" aria-busy={running}>
        {error && (
          <Card role="alert" className="mb-6 border-loss/30">
            <p className="text-sm text-loss">{error}</p>
          </Card>
        )}
        {running ? (
          <ResultsSkeleton />
        ) : view ? (
          <Card aria-labelledby="screen-results">
            <h2 id="screen-results" ref={resultsHeading} tabIndex={-1} className="sr-only">
              Results
            </h2>
            {view.kind === "saved" ? <SavedBar view={view} onReproduce={() => reproduce(view.run)} /> : <SaveBar settings={view.settings} onSaved={(run, result) => (saved.add(run), setView({ kind: "saved", run, result, reproduction: null }))} />}
            <ScreenResults result={view.result} />
            <RunProvenance provenance={view.result.provenance} saved={view.kind === "saved" ? { createdAt: view.run.createdAt } : undefined} />
          </Card>
        ) : (
          <Card>
            <p className="text-sm text-muted">
              Choose a period and press <span className="font-medium text-foreground">Test this screen over time</span>. Each month&apos;s picks, and the reasons for them, appear here.
            </p>
            <p className="mt-2 text-sm text-muted">
              This is different from the Screener&apos;s{" "}
              <Link href="/screener?preset=momentum" className="text-accent hover:underline">
                Backtest today&apos;s top 5
              </Link>
              , which buys <em>today&apos;s</em> picks and holds them: stocks chosen because they already did well.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  const block = "animate-pulse rounded-lg bg-foreground/[0.06]";
  return (
    <Card>
      <p className="text-sm text-muted">Ranking every catalog stock at the start of each month. This takes a few seconds…</p>
      <div className="mt-4 flex flex-col gap-4">
        <div className={`h-6 w-2/3 ${block}`} />
        <div className={`h-64 ${block}`} />
        <div className={`h-40 ${block}`} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** The limitations, stated where the numbers are. */
function Limitations({ result }: { result: ScreenResult }) {
  const simulated = result.provenance.dataset.simulated;
  return (
    <div className={`rounded-xl border px-3.5 py-3 text-sm ${simulated ? "border-accent/30 bg-accent/5" : "border-border bg-foreground/[0.02]"}`}>
      {simulated && (
        <p className="font-medium">
          <span className="mr-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">Simulated prices</span>
          These results use MarketLab&apos;s simulated market, not real stock prices.
        </p>
      )}
      <ul className={`list-disc space-y-1 pl-4 text-muted ${simulated ? "mt-2" : ""}`}>
        <li>
          The candidates are today&apos;s catalog of {result.universe.count} stocks, not every company listed at the time. Companies that were later delisted or bought out are missing, so the results carry{" "}
          <span className="font-medium text-foreground">survivorship bias</span>, even though each month&apos;s ranking uses only the prices known then.
        </li>
        <li>Only prices are used. Company numbers aren&apos;t, because when each filing became public isn&apos;t recorded.</li>
        <li>A past result isn&apos;t evidence that the screen will make money in future.</li>
      </ul>
    </div>
  );
}

function ScreenResults({ result }: { result: ScreenResult }) {
  const { run, benchmark, period } = result;
  const times = run.equity.map((p) => p.time);
  const bench = benchmarkLabel(result);
  const beat = run.metrics.finalValue >= benchmark.metrics.finalValue;

  return (
    <div className="space-y-6">
      <Limitations result={result} />
      {result.warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-loss/20 bg-loss/5 px-3.5 py-3 text-sm">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <p className="text-sm">
        Picking the momentum leaders every month turned {formatCurrency(result.settings.initialCash)} into <span className="font-medium">{formatCurrency(run.metrics.finalValue)}</span> (
        {formatPercent(run.metrics.totalReturn)}), {beat ? "ahead of" : "behind"} the {bench.name} at {formatCurrency(benchmark.metrics.finalValue)} ({formatPercent(benchmark.metrics.totalReturn)}), from{" "}
        {formatDate(period.start)} to {formatDate(period.end)}: {period.sessions.toLocaleString("en-US")} trading days and {result.months.length} monthly selections.
      </p>

      <ComparisonChart
        label={`Portfolio value: monthly momentum leaders compared with the ${bench.name}`}
        times={times}
        series={[
          { label: "Momentum leaders", color: "var(--series-1)", values: run.equity.map((p) => p.price) },
          { label: bench.name, color: "var(--series-2)", dashed: true, values: benchmark.equity.map((p) => p.price) },
        ]}
      />
      <p className="-mt-3 text-xs text-muted">
        Benchmark: buying and holding the {bench.name} with the same money and costs, over the same days. {bench.dividends}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Results compared with the benchmark</caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 text-left font-medium">
                Measure
              </th>
              <th scope="col" className="py-2 pl-4 text-right font-medium">
                Momentum leaders
              </th>
              <th scope="col" className="py-2 pl-4 text-right font-medium">
                {bench.name}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ROWS.map((row) => {
              const a = row.cell(run.metrics);
              const b = row.cell(benchmark.metrics);
              return (
                <tr key={row.label}>
                  <th scope="row" className="py-2 text-left font-normal">
                    <span className="inline-flex items-center gap-1.5">
                      {row.label}
                      {row.term && <Explain term={row.term} />}
                    </span>
                  </th>
                  <td className={`py-2 pl-4 text-right font-medium ${a.className ?? ""}`}>{a.text}</td>
                  <td className={`py-2 pl-4 text-right ${b.className ?? ""}`}>{b.text}</td>
                </tr>
              );
            })}
            <tr>
              <th scope="row" className="py-2 text-left font-normal" title="The value sold each year, as a share of the average portfolio value">
                Turnover per year
              </th>
              <td className="py-2 pl-4 text-right font-medium">{result.turnover === null ? "—" : formatShare(result.turnover)}</td>
              <td className="py-2 pl-4 text-right">{formatShare(0)}</td>
            </tr>
            <tr>
              <th scope="row" className="py-2 text-left font-normal">
                <span className="inline-flex items-center gap-1.5">
                  Trading costs <Explain term="tradingCosts" />
                </span>
              </th>
              <td className="py-2 pl-4 text-right font-medium">{formatCurrency(result.costs.total)}</td>
              <td className="py-2 pl-4 text-right">{formatCurrency(benchmark.costs.total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          Trading costs: {formatCurrency(result.costs.commission)} in commissions and {formatCurrency(result.costs.slippage)} lost to slippage, over {run.metrics.trades} trades worth{" "}
          {formatCurrency(result.traded)}. Turnover of 100% means stocks worth the whole portfolio were sold and replaced once a year; resetting each pick to 20% every month adds to it.
        </p>
      </div>

      <MonthlyHistory months={result.months} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The monthly selections
// ---------------------------------------------------------------------------

const MONTHS_SHOWN = 12;

function MonthlyHistory({ months }: { months: ScreenMonth[] }) {
  const [all, setAll] = useState(false);
  const newestFirst = [...months].reverse();
  const shown = all ? newestFirst : newestFirst.slice(0, MONTHS_SHOWN);
  return (
    <section aria-labelledby="selection-history">
      <h3 id="selection-history" className="text-base font-semibold tracking-tight">
        Monthly selections
      </h3>
      <p className="mt-1 text-sm text-muted">Newest first. Open a month to see why each stock was picked or dropped, the trades, and every candidate&apos;s numbers.</p>
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {shown.map((m) => (
          <li key={m.decision}>
            <MonthDetails month={m} />
          </li>
        ))}
      </ul>
      {months.length > MONTHS_SHOWN && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-3 text-sm font-medium text-accent hover:underline">
          {all ? "Show the latest 12 months" : `Show all ${months.length} months`}
        </button>
      )}
    </section>
  );
}

function MonthDetails({ month: m }: { month: ScreenMonth }) {
  const cashShare = m.value > 0 ? m.cash / m.value : 0;
  return (
    <details className="group py-2.5">
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="w-28 shrink-0 font-medium tabular-nums">{formatDate(m.decision)}</span>
        <span className="font-mono text-xs">{m.selected.length ? m.selected.map((s) => s.symbol).join(" · ") : "All cash"}</span>
        <span className="text-xs">
          {m.entered.map((s) => (
            <span key={s} className="mr-1.5 text-gain">
              +{s}
            </span>
          ))}
          {m.left.map((l) => (
            <span key={l.symbol} className="mr-1.5 text-loss">
              −{l.symbol}
            </span>
          ))}
        </span>
        {cashShare >= 0.005 && <span className="text-xs text-muted">{formatShare(cashShare)} cash</span>}
      </summary>

      <div className="mt-3 space-y-4 pb-2 text-sm">
        <p className="text-muted">
          Decided on {formatDate(m.decision)} using prices through {formatDate(m.basedOn)}, and traded at the {formatDate(m.decision)} close. Of {m.candidates} candidates, {m.ranked} had enough history to rank and{" "}
          {m.qualifying} qualified.
        </p>

        {m.selected.length > 0 && (
          <Table caption={`Stocks selected on ${formatDate(m.decision)}`} head={["Rank", "Stock", "Momentum 12-1", "Last close", "200-day avg", "Weight", "Why"]} align="llrrrrl">
            {m.selected.map((s) => (
              <tr key={s.symbol} className="align-top">
                <td className="py-1.5 pr-3">{s.rank}</td>
                <th scope="row" className="py-1.5 pr-3 text-left font-semibold">
                  {s.symbol}
                </th>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                  {formatPercent(s.momentum)} <span className="text-xs text-muted">({percentileLabel(s.percentile)})</span>
                </td>
                <td className="py-1.5 pr-3 text-right">{formatCurrency(s.close)}</td>
                <td className="py-1.5 pr-3 text-right">{formatCurrency(s.average)}</td>
                <td className="py-1.5 pr-3 text-right">{formatShare(s.weight)}</td>
                <td className="min-w-64 py-1.5 text-muted">{s.explanation}</td>
              </tr>
            ))}
          </Table>
        )}

        {m.left.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted">Left the portfolio</h4>
            <ul className="mt-1 space-y-1">
              {m.left.map((l) => (
                <li key={l.symbol}>
                  <span className="font-semibold">{l.symbol}</span>: <span className="text-muted">{l.explanation}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {m.notes.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 text-muted">
            {m.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

        {m.trades.length > 0 ? (
          <Table caption={`Trades for the ${formatDate(m.decision)} selection`} head={["Date", "Trade", "Stock", "Shares", "Fill price", "Value", "Commission", "Slippage"]} align="lllrrrrr">
            {m.trades.map((t, i) => (
              <tr key={i}>
                <td className="py-1.5 pr-3 whitespace-nowrap">{formatDate(t.time)}</td>
                <td className={`py-1.5 pr-3 ${t.side === "buy" ? "text-gain" : "text-loss"}`}>{t.side === "buy" ? "Buy" : "Sell"}</td>
                <th scope="row" className="py-1.5 pr-3 text-left font-semibold">
                  {t.symbol}
                </th>
                <td className="py-1.5 pr-3 text-right">{t.shares.toFixed(4)}</td>
                <td className="py-1.5 pr-3 text-right">{formatCurrency(t.price)}</td>
                <td className="py-1.5 pr-3 text-right">{formatCurrency(t.value)}</td>
                <td className="py-1.5 pr-3 text-right">{formatCurrency(t.commission)}</td>
                <td className="py-1.5 text-right">{formatCurrency(t.slippage)}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="text-muted">No trades: the holdings already matched.</p>
        )}
        <p>
          Costs this month: {formatCurrency(m.commission)} in commissions and {formatCurrency(m.slippage)} in slippage. After trading, {formatCurrency(m.cash)} ({formatShare(cashShare)}) was left uninvested, of{" "}
          {formatCurrency(m.value)}.
        </p>

        <details>
          <summary className="cursor-pointer text-sm font-medium text-accent">Every candidate&apos;s numbers ({m.table.length})</summary>
          <div className="mt-2 max-h-96 overflow-auto">
            <Table caption={`Every candidate on ${formatDate(m.decision)}`} head={["Stock", "Result", "Momentum 12-1", "Percentile", "Last close", "200-day avg", "Reason"]} align="llrrrrl" sticky>
              {m.table.map((row) => (
                <tr key={row[0]} className="align-top">
                  <th scope="row" className="py-1 pr-3 text-left font-semibold">
                    {row[0]}
                  </th>
                  <td className="py-1 pr-3 whitespace-nowrap">{STATUS_LABELS[row[1]]}</td>
                  <td className="py-1 pr-3 text-right">{row[2] === null ? "—" : formatPercent(row[2])}</td>
                  <td className="py-1 pr-3 text-right">{row[3] === null ? "—" : Math.floor(row[3] * 100)}</td>
                  <td className="py-1 pr-3 text-right">{row[4] === null ? "—" : formatCurrency(row[4])}</td>
                  <td className="py-1 pr-3 text-right">{row[5] === null ? "—" : formatCurrency(row[5])}</td>
                  <td className="min-w-56 py-1 text-muted">{reasonFor(row, m)}</td>
                </tr>
              ))}
            </Table>
          </div>
        </details>
      </div>
    </details>
  );
}

/** A compact table. `align` has one letter per column: "l" for text (left), "r" for numbers (right). */
function Table({ caption, head, align, children, sticky }: { caption: string; head: string[]; align: string; children: ReactNode; sticky?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className={`text-xs text-muted ${sticky ? "sticky top-0 bg-surface" : ""}`}>
          <tr className="border-b border-border">
            {head.map((h, i) => (
              <th key={h} scope="col" className={`py-1.5 pr-3 font-medium ${align[i] === "l" ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saving, opening and reproducing
// ---------------------------------------------------------------------------

function useSavedScreens() {
  const { mode } = useAccount();
  const [loaded, setLoaded] = useState<{ mode: string; runs: SavedScreen[] } | null>(null);
  useEffect(() => {
    if (mode === "loading") return;
    let cancelled = false;
    listSavedScreensAction()
      .then(({ runs }) => !cancelled && setLoaded({ mode, runs }))
      .catch(() => !cancelled && setLoaded({ mode, runs: [] }));
    return () => {
      cancelled = true;
    };
  }, [mode]);
  const runs = loaded && loaded.mode === mode ? loaded.runs : null;
  return {
    runs,
    add: (run: SavedScreen) => setLoaded((l) => ({ mode, runs: [run, ...(l?.mode === mode ? l.runs : [])] })),
    async remove(id: string) {
      setLoaded((l) => (l ? { ...l, runs: l.runs.filter((r) => r.id !== id) } : l));
      await deleteBacktestAction(id);
    },
  };
}

function SaveBar({ settings, onSaved }: { settings: ScreenSettings; onSaved: (run: SavedScreen, result: ScreenResult) => void }) {
  const [name, setName] = useState(`Momentum leaders, ${new Date(settings.start).getUTCFullYear()}–${new Date(settings.end).getUTCFullYear()}`);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  function save(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    startSaving(async () => {
      const outcome = await saveScreenAction(name, settings).catch(() => ({ ok: false as const, message: "Couldn't save the run. Try again in a minute." }));
      if (outcome.ok) onSaved(outcome.run, outcome.result);
      else setMessage(outcome.message);
    });
  }
  return (
    <form onSubmit={save} className="mb-4 flex flex-wrap items-end gap-2">
      <div className="min-w-48 flex-1">
        <label htmlFor="screen-run-name" className={label}>
          Save this run, with every candidate&apos;s prices, to reopen and reproduce it later
        </label>
        <input id="screen-run-name" value={name} maxLength={MAX_RUN_NAME} onChange={(e) => setName(e.target.value)} className={`${input} mt-1`} />
      </div>
      <button type="submit" disabled={saving || !name.trim()} className={`${secondary} h-10`}>
        {saving ? "Saving…" : "Save run"}
      </button>
      {message && (
        <p role="alert" className="w-full text-xs text-loss">
          {message}
        </p>
      )}
    </form>
  );
}

function SavedBar({ view, onReproduce }: { view: Extract<View, { kind: "saved" }>; onReproduce: () => void }) {
  const r = view.reproduction;
  const method = view.result.provenance.method;
  return (
    <div className="mb-4 rounded-xl border border-accent/20 bg-accent/5 px-3.5 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <span className="font-medium">{view.run.name}</span>: the result as saved on {formatDate(view.run.createdAt)}, not re-run.
        </p>
        <button type="button" onClick={onReproduce} disabled={r === "running"} className={secondary}>
          {r === "running" ? "Reproducing…" : "Reproduce from saved inputs"}
        </button>
      </div>
      {r && r !== "running" && (
        <p role="status" className={`mt-2 text-xs ${!r.ok || !r.comparison.matches ? "text-loss" : "text-gain"}`}>
          {!r.ok
            ? r.message
            : r.comparison.matches
              ? `Reproduced from the ${view.result.universe.count} candidates' saved prices (dataset ${view.result.provenance.dataset.datasetVersion}), screen version ${r.reproduced.provenance.method.version}: every selection, trade and value is the same ✓.`
              : r.reproduced.provenance.method.version !== method.version
                ? `Reproduced with screen version ${r.reproduced.provenance.method.version}, which differs from the ${method.version} this run was saved with: ${r.comparison.differences.join("; ")}.`
                : `Reproduced, but the result differs: ${r.comparison.differences.join("; ")}.`}
        </p>
      )}
    </div>
  );
}

function SavedScreens({ saved, activeId, onOpen }: { saved: ReturnType<typeof useSavedScreens>; activeId: string | null; onOpen: (id: string) => void }) {
  const { runs } = saved;
  return (
    <Card aria-labelledby="saved-screens" aria-busy={runs === null}>
      <h2 id="saved-screens" className="text-lg font-semibold tracking-tight">
        Saved screen runs
      </h2>
      {runs === null ? (
        <p className="mt-2 text-sm text-muted">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Runs you save appear here. They share the 50-run limit with saved backtests.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {runs.map((run) => (
            <li key={run.id} className="flex items-start justify-between gap-2 py-2">
              <button type="button" onClick={() => onOpen(run.id)} aria-current={run.id === activeId} className="min-w-0 text-left">
                <span className={`block truncate text-sm font-medium ${run.id === activeId ? "text-accent" : "hover:text-accent"}`}>{run.name}</span>
                <span className="block text-xs text-muted tabular-nums">
                  {formatPercent(run.summary.totalReturn)} vs {formatPercent(run.summary.benchmarkTotalReturn)} · {run.stored?.simulated === false ? "real" : "simulated"} prices · saved {formatDate(run.createdAt)}
                </span>
              </button>
              <button type="button" onClick={() => void saved.remove(run.id)} aria-label={`Delete ${run.name}`} className="shrink-0 rounded px-1.5 text-xs text-muted hover:text-loss">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
