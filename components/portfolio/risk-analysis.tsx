"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { Explain } from "@/components/ui/explain";
import type { PortfolioAnalysis, Weighting } from "@/lib/analytics/portfolio";
import { formatCompactCurrency, formatDate, formatPercent, formatShare } from "@/lib/format";
import type { TermKey } from "@/lib/glossary";

type Result = { status: "loading" } | { status: "empty" } | { status: "error"; message: string } | { status: "ok"; analysis: PortfolioAnalysis; totalValue: number };

const TABS = ["Risk", "Stress tests", "Projection", "Optimise"] as const;
type Tab = (typeof TABS)[number];
const DASH = "—";
const share = (v: number | null | undefined) => (v === null || v === undefined ? DASH : formatShare(v));
const signed = (v: number | null | undefined) => (v === null || v === undefined ? DASH : formatPercent(v));
const num = (v: number | null | undefined, digits = 2) => (v === null || v === undefined ? DASH : v.toFixed(digits));

/**
 * Risk analysis of the current holdings, calculated on the server by the
 * analytics service (app/api/portfolio/analysis). Fetched again whenever the
 * holdings or cash change.
 */
export function RiskAnalysis() {
  const { account } = useAccount();
  const key = account ? JSON.stringify([account.cash, account.holdings.map((h) => [h.symbol, h.shares])]) : null;
  const [result, setResult] = useState<{ key: string; value: Result } | null>(null);
  const [tab, setTab] = useState<Tab>("Risk");

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    fetch("/api/portfolio/analysis", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? "Couldn't load the analysis. Check your connection and try again.");
        return data;
      })
      .then(
        (data) => !cancelled && setResult({ key, value: data.empty ? { status: "empty" } : { status: "ok", analysis: data.analysis, totalValue: data.totalValue } }),
        (error: Error) => !cancelled && setResult({ key, value: { status: "error", message: error.message } }),
      );
    return () => {
      cancelled = true;
    };
  }, [key]);

  const value: Result = result && result.key === key ? result.value : result?.value.status === "ok" ? result.value : { status: "loading" };

  return (
    <Card aria-labelledby="risk-analysis">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="risk-analysis" className="text-lg font-semibold tracking-tight">
          Risk analysis
        </h2>
        {value.status === "ok" && (
          <div role="tablist" aria-label="Analysis views" className="flex gap-1 rounded-full bg-foreground/[0.06] p-1">
            {TABS.map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${tab === t ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {value.status === "loading" && <div aria-busy className="mt-4 h-48 animate-pulse rounded-lg bg-foreground/[0.06]" />}
      {value.status === "empty" && <p className="mt-3 text-sm text-muted">Buy a stock or two, and this shows how risky the mix is, how it might fare in a crash, and other ways to weight it.</p>}
      {value.status === "error" && <p className="mt-3 text-sm text-muted">{value.message}</p>}
      {value.status === "ok" && (
        <div role="tabpanel" className="mt-4">
          {tab === "Risk" && <RiskView a={value.analysis} />}
          {tab === "Stress tests" && <StressView a={value.analysis} totalValue={value.totalValue} />}
          {tab === "Projection" && <ProjectionView a={value.analysis} totalValue={value.totalValue} />}
          {tab === "Optimise" && <OptimiseView a={value.analysis} />}
          <p className="mt-4 text-xs text-muted">
            As of the {formatDate(value.analysis.asOf)} close, for today&apos;s holdings{value.analysis.leftOut.length > 0 && ` (without ${value.analysis.leftOut.join(", ")}: not enough price history)`}. Based on past prices; not a
            prediction or advice.
          </p>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, note, term }: { label: string; value: string; note?: string; term?: TermKey }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs text-muted">
        {label}
        {term && <Explain term={term} />}
      </dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-muted">{note}</dd>}
    </div>
  );
}

function RiskView({ a }: { a: PortfolioAnalysis }) {
  const r = a.risk;
  return (
    <div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label="Volatility" value={share(r.volatility)} note="a year, from daily moves" term="volatility" />
        <Stat label="Beta" value={num(r.beta)} note="vs the S&P 500" term="beta" />
        <Stat label="1-day VaR (95%)" value={r.var95 === null ? DASH : `−${formatShare(r.var95)}`} note="lost more on 1 day in 20" term="valueAtRisk" />
        <Stat label="Expected shortfall" value={r.expectedShortfall95 === null ? DASH : `−${formatShare(r.expectedShortfall95)}`} note="average of those days" />
        <Stat label="Diversification" value={r.diversificationRatio === null ? DASH : `${num(r.diversificationRatio)}×`} note="above 1: holdings offset" term="diversification" />
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Where the risk comes from</h3>
          <p className="text-xs text-muted">Each holding&apos;s share of the portfolio&apos;s ups and downs, next to its share of the money.</p>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th scope="col" className="py-1 text-left font-medium">Stock</th>
                <th scope="col" className="py-1 text-right font-medium">Weight</th>
                <th scope="col" className="py-1 text-right font-medium">Volatility</th>
                <th scope="col" className="py-1 text-right font-medium">Beta</th>
                <th scope="col" className="w-2/5 py-1 pl-3 text-left font-medium">Share of risk</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {a.symbols.map((s, i) => {
                const contribution = r.riskContribution[i] ?? 0;
                return (
                  <tr key={s} className="border-t border-border">
                    <th scope="row" className="py-1.5 text-left font-medium">{s}</th>
                    <td className="py-1.5 text-right">{share(a.weights[i])}</td>
                    <td className="py-1.5 text-right">{share(r.holdingVolatility[i])}</td>
                    <td className="py-1.5 text-right">{num(r.holdingBeta[i])}</td>
                    <td className="py-1.5 pl-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                          <div className={`h-full rounded-full ${contribution > (a.weights[i] ?? 0) * 1.25 ? "bg-loss/70" : "bg-accent/70"}`} style={{ width: `${Math.min(100, Math.max(0, contribution * 100))}%` }} />
                        </div>
                        <span className="w-12 text-right text-xs">{share(contribution)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            How they move together <Explain term="correlation" />
          </h3>
          <p className="text-xs text-muted">Correlation of daily returns over the last year: 1 moves in lockstep, 0 unrelated, below 0 opposite.</p>
          <Heatmap symbols={a.symbols} matrix={r.correlation} />
        </div>
      </div>

      <h3 className="mt-6 text-sm font-semibold">By sector</h3>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full">
        {Object.entries(a.sectors).map(([sector, weight], i) => (
          <div key={sector} title={`${sector}: ${share(weight)}`} className={i % 2 ? "bg-accent/40" : "bg-accent/80"} style={{ width: `${(weight ?? 0) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {Object.entries(a.sectors).map(([sector, weight]) => (
          <li key={sector}>
            {sector} <span className="font-medium text-foreground tabular-nums">{share(weight)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Heatmap({ symbols, matrix }: { symbols: string[]; matrix: (number | null)[][] }) {
  if (symbols.length < 2) return <p className="mt-3 text-sm text-muted">Hold two or more stocks to compare them.</p>;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="text-xs tabular-nums">
        <thead>
          <tr>
            <td />
            {symbols.map((s) => (
              <th key={s} scope="col" className="px-1 pb-1 font-medium text-muted">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((row, i) => (
            <tr key={row}>
              <th scope="row" className="pr-2 text-right font-medium text-muted">
                {row}
              </th>
              {symbols.map((col, j) => {
                const c = matrix[i][j] ?? 0;
                const strength = Math.round(Math.min(1, Math.abs(c)) * 70);
                return (
                  <td key={col} className="p-0.5">
                    <div
                      title={`${row} and ${col}: ${num(c)}`}
                      className="grid size-10 place-items-center rounded-md"
                      style={{ background: `color-mix(in oklab, var(${c >= 0 ? "--accent" : "--loss"}) ${strength}%, transparent)`, color: strength > 45 ? "white" : undefined }}
                    >
                      {i === j ? "" : num(c)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StressView({ a, totalValue }: { a: PortfolioAnalysis; totalValue: number }) {
  const worst = Math.max(0.01, ...a.stress.map((s) => Math.abs(s.portfolio ?? 0)), ...a.stress.map((s) => Math.abs(s.market ?? 0)));
  return (
    <div>
      <p className="text-sm text-muted">How today&apos;s holdings would have done in the market&apos;s worst falls in the data, and in made-up shocks scaled by each stock&apos;s beta.</p>
      <ul className="mt-4 divide-y divide-border">
        {a.stress.map((s) => (
          <li key={s.name} className="grid gap-2 py-3 sm:grid-cols-[1fr_16rem] sm:items-center">
            <div>
              <p className="text-sm font-medium">{s.name}</p>
              <p className="text-xs text-muted">
                {s.kind === "historical" ? "Replayed from real prices in the data" : "Hypothetical"}
                {s.coverage !== undefined && s.coverage !== null && s.coverage < 0.999 && ` · ${share(s.coverage)} of the holdings existed then`}
              </p>
            </div>
            <div className="space-y-1 text-xs tabular-nums">
              <Bar label="Market" value={s.market} scale={worst} />
              <Bar label="You" value={s.portfolio} scale={worst} money={s.portfolio === null ? null : s.portfolio * totalValue} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bar({ label, value, scale, money }: { label: string; value: number | null; scale: number; money?: number | null }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div className={`h-full rounded-full ${v < 0 ? "bg-loss/70" : "bg-gain/70"}`} style={{ width: `${(Math.abs(v) / scale) * 100}%` }} />
      </div>
      <span className={`w-28 text-right ${v < 0 ? "text-loss" : "text-gain"}`}>
        {signed(value)}
        {money !== undefined && money !== null && <span className="text-muted"> ({formatCompactCurrency(money)})</span>}
      </span>
    </div>
  );
}

function ProjectionView({ a, totalValue }: { a: PortfolioAnalysis; totalValue: number }) {
  const mc = a.monteCarlo;
  const b = mc.bands;
  const months = mc.months.length;
  const top = Math.max(...b.p95.map((v) => v ?? 0), 1.2);
  const x = (i: number) => (i / (months - 1)) * 100;
  const y = (v: number | null) => 48 - ((v ?? 1) / top) * 46;
  const area = (upper: (number | null)[], lower: (number | null)[]) =>
    `M${upper.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" L")} L${lower
      .map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`)
      .reverse()
      .join(" L")} Z`;
  const line = (values: (number | null)[]) => `M${values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" L")}`;
  return (
    <div>
      <p className="text-sm text-muted">
        <Explain term="monteCarlo" className="mr-1" />
        {mc.paths.toLocaleString()} possible next {mc.years} years for {formatCompactCurrency(totalValue)}, built from the portfolio&apos;s own past {Math.round(mc.historySessions / 252)} years of daily moves, drawn in
        month-long blocks. The bands hold the middle 50% and 90% of outcomes. Not a forecast.
      </p>
      <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="mt-4 h-56 w-full" role="img" aria-label={`Projected value: median ${formatCompactCurrency(totalValue * (mc.median["10Y"] ?? 1))} after ${mc.years} years`}>
        <line x1="0" x2="100" y1={y(1)} y2={y(1)} className="stroke-foreground/30" strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />
        <path d={area(b.p95, b.p5)} className="fill-accent/15" />
        <path d={area(b.p75, b.p25)} className="fill-accent/30" />
        <path d={line(b.p50)} fill="none" className="stroke-accent" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-xs text-muted">
        <span>Today</span>
        <span>{mc.years / 2} years</span>
        <span>{mc.years} years</span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-4 text-sm">
        {(["1Y", "5Y", "10Y"] as const).map((h) => (
          <div key={h}>
            <dt className="text-xs text-muted">After {h.replace("Y", h === "1Y" ? " year" : " years")}</dt>
            <dd className="font-semibold tabular-nums">{mc.median[h] === null ? DASH : formatCompactCurrency(totalValue * mc.median[h])}</dd>
            <dd className="text-xs text-muted">{share(mc.lossProbability[h])} chance of a loss</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function OptimiseView({ a }: { a: PortfolioAnalysis }) {
  const o = a.optimisation;
  if (!o) return <p className="text-sm text-muted">Hold two or more stocks to compare other ways of weighting them.</p>;
  const columns: { name: string; w: Weighting; tone: string }[] = [
    { name: "Yours", w: o.current, tone: "fill-foreground" },
    { name: "Least risk", w: o.minimumVariance, tone: "fill-gain" },
    { name: "Best Sharpe", w: o.maximumSharpe, tone: "fill-accent" },
    { name: "Risk parity", w: o.riskParity, tone: "fill-loss" },
  ];
  const points = [...o.frontier, ...columns.map((c) => c.w)];
  const vols = points.map((p) => p.volatility ?? 0);
  const rets = points.map((p) => p.expectedReturn ?? 0);
  const [v0, v1] = [Math.min(...vols) * 0.9, Math.max(...vols) * 1.1];
  const [r0, r1] = [Math.min(...rets) - 0.02, Math.max(...rets) + 0.02];
  // Plot area: x 14..156, y 4..56 of a 160 x 70 canvas, leaving room for the axis labels.
  const px = (v: number | null) => (((v ?? 0) - v0) / (v1 - v0 || 1)) * 142 + 14;
  const py = (r: number | null) => 56 - (((r ?? 0) - r0) / (r1 - r0 || 1)) * 52;
  const label = "fill-muted text-[4px]";
  return (
    <div>
      <p className="text-sm text-muted">
        <Explain term="riskParity" className="mr-1" />
        The same stocks (your cash aside), weighted other ways: long only, at most {share(o.cap)} in one stock. Expected returns and risks are estimated from the last {Math.round(o.estimationSessions / 252)} years and deliberately
        toned down, because past returns are a poor guide; treat this as a way to see trade-offs, not a recommendation.
      </p>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-muted">
                <th scope="col" className="py-1 text-left font-medium">Stock</th>
                {columns.map((c) => (
                  <th key={c.name} scope="col" className="py-1 text-right font-medium">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.symbols.map((s, i) => (
                <tr key={s} className="border-t border-border">
                  <th scope="row" className="py-1.5 text-left font-medium">{s}</th>
                  {columns.map((c) => (
                    <td key={c.name} className="py-1.5 text-right">
                      {share(c.w.weights[i])}
                    </td>
                  ))}
                </tr>
              ))}
              {(
                [
                  ["Expected return", (w: Weighting) => signed(w.expectedReturn)],
                  ["Volatility", (w: Weighting) => share(w.volatility)],
                  ["Sharpe", (w: Weighting) => num(w.sharpe)],
                ] as const
              ).map(([label, show]) => (
                <tr key={label} className="border-t border-border text-muted">
                  <th scope="row" className="py-1.5 text-left font-normal">{label}</th>
                  {columns.map((c) => (
                    <td key={c.name} className="py-1.5 text-right">
                      {show(c.w)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <figure>
          <svg viewBox="0 0 160 70" className="w-full" role="img" aria-label="Efficient frontier: expected return against volatility">
            <line x1={14} x2={156} y1={56} y2={56} className="stroke-border" strokeWidth={0.4} />
            <line x1={14} x2={14} y1={4} y2={56} className="stroke-border" strokeWidth={0.4} />
            <text x={14} y={62} className={label}>{share(v0)}</text>
            <text x={156} y={62} textAnchor="end" className={label}>{share(v1)}</text>
            <text x={85} y={68} textAnchor="middle" className={label}>Volatility →</text>
            <text x={12} y={8} textAnchor="end" className={label}>{signed(r1)}</text>
            <text x={12} y={56} textAnchor="end" className={label}>{signed(r0)}</text>
            <text x={4} y={30} textAnchor="middle" transform="rotate(-90 4 30)" className={label}>Return →</text>
            <path d={`M${o.frontier.map((p) => `${px(p.volatility).toFixed(2)},${py(p.expectedReturn).toFixed(2)}`).join(" L")}`} fill="none" className="stroke-accent/60" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            {columns.map((c) => (
              <circle key={c.name} cx={px(c.w.volatility)} cy={py(c.w.expectedReturn)} r={2} className={`${c.tone} stroke-surface`} strokeWidth={0.6}>
                <title>{`${c.name}: ${signed(c.w.expectedReturn)} a year at ${share(c.w.volatility)} volatility`}</title>
              </circle>
            ))}
          </svg>
          <figcaption className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span>Line: the least risk for each expected return. Right is riskier, up is higher return.</span>
            {columns.map((c) => (
              <span key={c.name} className="inline-flex items-center gap-1">
                <svg viewBox="0 0 4 4" className="size-2">
                  <circle cx="2" cy="2" r="2" className={c.tone} />
                </svg>
                {c.name}
              </span>
            ))}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
