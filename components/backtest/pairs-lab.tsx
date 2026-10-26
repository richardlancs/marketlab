"use client";

import { useState, type PointerEvent } from "react";
import { ComparisonChart } from "@/components/charts/comparison-chart";
import { Card } from "@/components/ui/card";
import { Explain } from "@/components/ui/explain";
import { scanPairsAction, testPairAction } from "@/lib/pairs-actions";
import { scanSummary, type PairCandidate, type PairScan, type PairSettings, type PairTest } from "@/lib/pairs/types";
import { formatCurrency, formatDate, formatPercent, formatShare } from "@/lib/format";

type Load<T> = { status: "idle" } | { status: "running" } | { status: "error"; message: string } | { status: "done"; result: T };

const DAY = 24 * 60 * 60 * 1000;
const toInput = (time: number) => new Date(time).toISOString().slice(0, 10);
const fromInput = (value: string) => Date.parse(`${value}T23:59:59Z`);
const input = "h-10 w-full rounded-lg border border-border bg-transparent px-3 text-base tabular-nums outline-none transition-colors focus-visible:border-accent sm:text-sm";
const label = "text-xs text-muted";
const p = (v: number | null) => (v === null ? "—" : v < 0.001 ? "<0.001" : v.toFixed(3));

/**
 * The pairs-trading lab (Backtest page, #pairs): scan the catalog for
 * same-sector pairs whose gap keeps coming back over a formation year, then
 * trade one pair's gap over the following year (lib/pairs).
 */
export function PairsLab({ lastDate }: { lastDate: number }) {
  const [formationEnd, setFormationEnd] = useState(() => toInput(lastDate - 366 * DAY));
  const [scan, setScan] = useState<Load<PairScan>>({ status: "idle" });
  const [levels, setLevels] = useState({ entry: "2", exit: "0", stop: "4", borrow: "50" });
  const [test, setTest] = useState<Load<PairTest>>({ status: "idle" });
  const [chosen, setChosen] = useState<PairCandidate | null>(null);

  async function runScan() {
    setScan({ status: "running" });
    setTest({ status: "idle" });
    setChosen(null);
    try {
      const outcome = await scanPairsAction(fromInput(formationEnd));
      setScan(outcome.ok ? { status: "done", result: outcome.result } : { status: "error", message: outcome.message });
    } catch {
      setScan({ status: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  async function runTest(pair: PairCandidate, end: number) {
    setChosen(pair);
    setTest({ status: "running" });
    const settings: PairSettings = {
      a: pair.a,
      b: pair.b,
      formationEnd: end,
      entry: Number(levels.entry),
      exit: Number(levels.exit),
      stop: Number(levels.stop),
      initialCash: 10_000,
      costs: { commission: 0, slippageBps: 5 },
      borrowBps: Number(levels.borrow),
    };
    try {
      const outcome = await testPairAction(settings);
      setTest(outcome.ok ? { status: "done", result: outcome.result } : { status: "error", message: outcome.message });
    } catch {
      setTest({ status: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
      <Card className="lg:col-span-4" aria-labelledby="pairs-settings">
        <h2 id="pairs-settings" className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
          Pairs trading <Explain term="pairsTrading" />
        </h2>
        <p className="mt-1 text-sm text-muted">
          Find two stocks from the same sector whose prices keep a steady relationship, then trade the gap when it stretches: buy the cheap side, sell the dear one short, and close when the gap comes back.
        </p>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void runScan();
          }}
        >
          <div>
            <label htmlFor="formation-end" className={label}>
              Formation year ends
            </label>
            <input id="formation-end" type="date" max={toInput(lastDate - 30 * DAY)} value={formationEnd} onChange={(e) => setFormationEnd(e.target.value)} className={`${input} mt-1`} />
            <p className="mt-1 text-xs text-muted">Pairs are found on the year before this date and traded on the year after it.</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Trading the gap</legend>
            <p className="text-xs text-muted">How far the gap is from its usual level, in standard deviations (its z-score).</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["entry", "Trade at ±"],
                  ["exit", "Close at ±"],
                  ["stop", "Give up at ±"],
                ] as const
              ).map(([key, text]) => (
                <div key={key}>
                  <label htmlFor={`pair-${key}`} className={label}>
                    {text}
                  </label>
                  <input id={`pair-${key}`} type="number" inputMode="decimal" step="0.5" value={levels[key]} onChange={(e) => setLevels({ ...levels, [key]: e.target.value })} className={`${input} mt-1`} />
                </div>
              ))}
            </div>
            <div>
              <label htmlFor="pair-borrow" className={label}>
                Borrowing the shares sold short (basis points a year)
              </label>
              <input id="pair-borrow" type="number" inputMode="decimal" value={levels.borrow} onChange={(e) => setLevels({ ...levels, borrow: e.target.value })} className={`${input} mt-1`} />
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={scan.status === "running"}
            className="h-11 w-full rounded-full bg-accent-fill text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {scan.status === "running" ? "Scanning…" : "Find pairs"}
          </button>
          {scan.status === "error" && (
            <p role="alert" className="text-sm text-loss">
              {scan.message}
            </p>
          )}
        </form>
        <p className="mt-4 text-xs text-muted">
          On simulated prices, stocks only share the market&apos;s and their sector&apos;s moves, so a lasting relationship between two of them is rare. Expect few or no pairs to survive: that&apos;s the honest answer, not a fault.
        </p>
      </Card>

      <div className="flex flex-col gap-4 lg:col-span-8 lg:gap-6">
        <Card aria-labelledby="pairs-found">
          <h2 id="pairs-found" className="text-lg font-semibold tracking-tight">
            Pairs found
          </h2>
          {scan.status === "idle" && <p className="mt-2 text-sm text-muted">Choose a formation year and find pairs. Every same-sector pair of MarketLab&apos;s stocks is tested.</p>}
          {scan.status === "running" && <div aria-busy className="mt-4 h-48 animate-pulse rounded-lg bg-foreground/[0.06]" />}
          {scan.status === "done" && <ScanResults scan={scan.result} chosen={chosen} onTest={(pair) => void runTest(pair, scan.result.formationEnd)} />}
        </Card>
        {test.status !== "idle" && (
          <Card aria-labelledby="pair-test">
            <h2 id="pair-test" className="text-lg font-semibold tracking-tight">
              {chosen ? `${chosen.a} and ${chosen.b}, the year after` : "The year after"}
            </h2>
            {test.status === "running" && <div aria-busy className="mt-4 h-64 animate-pulse rounded-lg bg-foreground/[0.06]" />}
            {test.status === "error" && (
              <p role="alert" className="mt-2 text-sm text-loss">
                {test.message}
              </p>
            )}
            {test.status === "done" && <TestResults t={test.result} />}
          </Card>
        )}
      </div>
    </div>
  );
}

function ScanResults({ scan, chosen, onTest }: { scan: PairScan; chosen: PairCandidate | null; onTest: (pair: PairCandidate) => void }) {
  return (
    <div className="mt-2">
      <p className="text-sm">{scanSummary(scan)}</p>
      <p className="mt-1 text-xs text-muted">
        Formation year {formatDate(scan.formationStart)} to {formatDate(scan.formationEnd)}. The adjusted p-value allows for testing {scan.tests} pairs at once (Benjamini–Hochberg); below 0.05 is the bar. The
        best {scan.pairs.length} are listed, adjusted or not, so you can see how close they come.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">The pairs whose gap came back most reliably, best first</caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="py-1.5 text-left font-medium">Pair</th>
              <th scope="col" className="py-1.5 text-left font-medium">Sector</th>
              <th scope="col" className="py-1.5 pl-3 text-right font-medium">p-value</th>
              <th scope="col" className="py-1.5 pl-3 text-right font-medium">Adjusted</th>
              <th scope="col" className="py-1.5 pl-3 text-right font-medium">Half-life</th>
              <th scope="col" className="py-1.5 pl-3 text-right font-medium">Hedge ratio</th>
              <th scope="col" className="py-1.5 pl-3 text-right font-medium">Correlation</th>
              <th scope="col" className="py-1.5 pl-3">
                <span className="sr-only">Test</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {scan.pairs.map((pair) => {
              const survives = pair.adjusted !== null && pair.adjusted < 0.05;
              return (
                <tr key={`${pair.a}-${pair.b}`} className={chosen?.a === pair.a && chosen.b === pair.b ? "bg-accent/[0.06]" : undefined}>
                  <th scope="row" className="py-1.5 text-left font-medium whitespace-nowrap">
                    {pair.a} · {pair.b}
                  </th>
                  <td className="py-1.5 text-muted">{pair.sector}</td>
                  <td className="py-1.5 pl-3 text-right">{p(pair.pValue)}</td>
                  <td className={`py-1.5 pl-3 text-right ${survives ? "font-medium text-gain" : ""}`}>{p(pair.adjusted)}</td>
                  <td className="py-1.5 pl-3 text-right whitespace-nowrap">{pair.halfLife === null ? "—" : `${Math.round(pair.halfLife)} days`}</td>
                  <td className="py-1.5 pl-3 text-right">{pair.hedgeRatio === null ? "—" : pair.hedgeRatio.toFixed(2)}</td>
                  <td className="py-1.5 pl-3 text-right">{pair.correlation === null ? "—" : pair.correlation.toFixed(2)}</td>
                  <td className="py-1.5 pl-3 text-right">
                    <button type="button" onClick={() => onTest(pair)} className="tap font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent" aria-label={`Test ${pair.a} and ${pair.b}`}>
                      Test
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TestResults({ t }: { t: PairTest }) {
  const [allTrades, setAllTrades] = useState(false);
  const m = t.metrics;
  const held = t.trading.pValue !== null && t.trading.pValue < 0.05;
  const stats: [string, string][] = [
    ["Total return", formatPercent(m.totalReturn)],
    ["Sharpe ratio", m.sharpe === null ? "—" : m.sharpe.toFixed(2)],
    ["Max drawdown", m.maxDrawdown > 0 ? `-${formatShare(m.maxDrawdown)}` : formatShare(0)],
    ["Trades", String(m.trades)],
    ["Time in a trade", formatShare(m.exposure)],
    ["Costs paid", formatCurrency(t.costs.commission + t.costs.slippage + t.costs.borrow)],
  ];
  const trades = allTrades ? t.trades : t.trades.slice(0, 12);
  return (
    <div className="mt-2 space-y-5">
      <p className="text-sm">
        On the formation year the gap&apos;s p-value was {p(t.formation.pValue)}
        {t.formation.halfLife !== null && <>, closing half of a stretch in about {Math.round(t.formation.halfLife)} days</>}. On the year it was traded it was {p(t.trading.pValue)}:{" "}
        {held ? "the relationship held." : "the relationship didn't clearly hold, which is common: a pair found in one year often drifts apart in the next."}
      </p>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {stats.map(([name, value]) => (
          <div key={name}>
            <dt className="text-xs text-muted">{name}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <ZChart t={t} />
      <ComparisonChart label={`Value of $${t.settings.initialCash.toLocaleString("en-US")} trading the gap`} times={t.times} series={[{ label: "Trading the gap", color: "var(--series-1)", values: t.equity.map((e) => e.price) }]} />
      <div>
        <h3 className="text-sm font-semibold">Trades</h3>
        {t.trades.length === 0 ? (
          <p className="mt-2 text-sm text-muted">The gap never stretched far enough to trade.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">Trades, oldest first</caption>
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="py-1.5 text-left font-medium">Date</th>
                  <th scope="col" className="py-1.5 text-left font-medium">Trade</th>
                  <th scope="col" className="py-1.5 pl-3 text-right font-medium">Shares</th>
                  <th scope="col" className="py-1.5 pl-3 text-right font-medium">Price</th>
                  <th scope="col" className="py-1.5 pl-3 text-left font-medium">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {trades.map((trade, i) => (
                  <tr key={i}>
                    <td className="py-1.5 whitespace-nowrap">{formatDate(trade.time)}</td>
                    <td className="py-1.5 whitespace-nowrap">
                      <span className={`font-medium ${trade.side === "buy" ? "text-accent" : "text-loss"}`}>{trade.side === "buy" ? "Buy" : "Sell"}</span> {trade.symbol}
                    </td>
                    <td className="py-1.5 pl-3 text-right">{trade.shares === null ? "—" : trade.shares.toFixed(3)}</td>
                    <td className="py-1.5 pl-3 text-right">{trade.price === null ? "—" : formatCurrency(trade.price)}</td>
                    <td className="py-1.5 pl-3 text-muted">{trade.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {t.trades.length > 12 && (
              <button type="button" onClick={() => setAllTrades(!allTrades)} className="mt-2 text-sm font-medium text-accent hover:underline">
                {allTrades ? "Show fewer" : `Show all ${t.trades.length} trades`}
              </button>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-muted">
        Long {t.a} and short {t.formation.hedgeRatio === null ? "" : `${Math.abs(t.formation.hedgeRatio).toFixed(2)}× as many dollars of `}
        {t.b} when the gap is low (the reverse when it&apos;s high), together the starting money. Decided on the previous close, filled at the day&apos;s close with {t.settings.slippageBps} basis points of slippage; the
        short side pays {t.settings.borrowBps} basis points a year to borrow. The gap&apos;s usual level and spread come from the formation year only.
      </p>
    </div>
  );
}

/** The gap's z-score over the trading year, with the entry, exit and stop levels, and a hover readout. */
function ZChart({ t }: { t: PairTest }) {
  const [active, setActive] = useState<number | null>(null);
  const values = t.z.map((v) => v ?? 0);
  const limit = Math.max(t.settings.stop + 0.5, ...values.map(Math.abs)) * 1.05;
  // Percentages of the plot area, so the line stretches to any width while the text stays its size.
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * 100;
  const y = (v: number) => ((limit - v) / (2 * limit)) * 100;
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const index = new Map(t.times.map((time, i) => [time, i]));
  const opened = t.trades.filter((trade, i, all) => trade.reason.startsWith("gap stretched") && (i === 0 || all[i - 1].time !== trade.time));
  const levels: { v: number; className: string; dashed?: boolean }[] = [
    { v: 0, className: "stroke-border" },
    ...[t.settings.entry, -t.settings.entry].map((v) => ({ v, className: "stroke-accent/70", dashed: true })),
    ...[t.settings.stop, -t.settings.stop].map((v) => ({ v, className: "stroke-loss/70", dashed: true })),
  ];

  function onMove(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    setActive(Math.max(0, Math.min(values.length - 1, Math.round(((event.clientX - box.left) / box.width) * (values.length - 1)))));
  }

  return (
    <figure>
      <div className="flex gap-2">
        <div className="relative w-6 shrink-0 text-right text-xs text-muted tabular-nums" aria-hidden>
          {levels.map((l) => (
            <span key={l.v} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(l.v)}%` }}>
              {l.v > 0 ? `+${l.v}` : l.v}
            </span>
          ))}
        </div>
        <div
          role="img"
          aria-label={`The gap's z-score each day, against entry levels of ±${t.settings.entry} and stops at ±${t.settings.stop}`}
          className="relative h-44 flex-1 touch-pan-y"
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            {levels.map((l) => (
              <line key={l.v} x1={0} x2={100} y1={y(l.v)} y2={y(l.v)} className={l.className} strokeWidth={1} strokeDasharray={l.dashed ? "4 4" : undefined} vectorEffect="non-scaling-stroke" />
            ))}
            <path d={path} fill="none" className="stroke-foreground/80" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {active !== null && <line x1={x(active)} x2={x(active)} y1={0} y2={100} className="stroke-foreground/30" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          </svg>
          {opened.map((trade) => {
            const i = index.get(trade.time);
            return i === undefined ? null : <Dot key={trade.time} left={x(i)} top={y(values[i])} className="bg-accent" />;
          })}
          {active !== null && <Dot left={x(active)} top={y(values[active])} className="bg-foreground" />}
        </div>
      </div>
      <div className="mt-1 flex justify-between pl-8 text-xs text-muted">
        <span>{formatDate(t.times[0])}</span>
        <span>{formatDate(t.times[t.times.length - 1])}</span>
      </div>
      <figcaption className="mt-1 min-h-4 text-xs text-muted">
        {active !== null ? (
          <>
            {formatDate(t.times[active])}: z-score <span className="font-medium text-foreground tabular-nums">{t.z[active] === null ? "—" : t.z[active]!.toFixed(2)}</span>
          </>
        ) : (
          <>The gap&apos;s z-score. Inner dashed lines (±{t.settings.entry}): trade beyond them. Outer dashed lines (±{t.settings.stop}): give up beyond them. Dots: trades opened.</>
        )}
      </figcaption>
    </figure>
  );
}

/** A round marker over the stretched plot, so it stays round. */
function Dot({ left, top, className }: { left: number; top: number; className: string }) {
  return <span className={`pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${className}`} style={{ left: `${left}%`, top: `${top}%` }} />;
}
