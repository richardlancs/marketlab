"use client";

import { useMemo, useState } from "react";
import { equalMix, metricsOf, relatedPaths, worstDrawdown } from "@/lib/lessons/demos";
import { ANCHORS } from "@/lib/market/anchors";
import { STOCKS } from "@/lib/market/universe";
import { Choice, DemoChart, DemoFrame, dollars, plainPercent, Slider, Stat, StatRow } from "./parts";

const capLabel = (billions: number) => (billions >= 1000 ? `$${(billions / 1000).toFixed(2)} trillion` : `$${billions.toFixed(0)} billion`);

/** Market cap and P/E: company size from price × shares, and what a price says about earnings. */
export function CompanySizeDemo() {
  const [first, setFirst] = useState("NFLX");
  const [second, setSecond] = useState("MSFT");
  const [price, setPrice] = useState(100);
  const [eps, setEps] = useState(4);
  const rows = [first, second].map((symbol) => {
    const [anchorPrice, capBillions] = ANCHORS[symbol];
    return { symbol, name: STOCKS.find((s) => s.symbol === symbol)?.name ?? symbol, price: anchorPrice, capBillions, shares: (capBillions * 1e9) / anchorPrice };
  });
  const pe = price / eps;
  const select = "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-accent";
  return (
    <DemoFrame title="How big, and how expensive?" note="Prices and market caps as of Oct 16, 2026. The P/E calculator uses your own numbers.">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Compare</span>
        <select aria-label="First company" value={first} onChange={(e) => setFirst(e.target.value)} className={select}>
          {STOCKS.map((s) => (
            <option key={s.symbol}>{s.symbol}</option>
          ))}
        </select>
        <span className="text-muted">with</span>
        <select aria-label="Second company" value={second} onChange={(e) => setSecond(e.target.value)} className={select}>
          {STOCKS.map((s) => (
            <option key={s.symbol}>{s.symbol}</option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-foreground/[0.03] text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Company</th>
              <th className="px-3 py-2 text-right font-medium">Share price</th>
              <th className="px-3 py-2 text-right font-medium">× Shares</th>
              <th className="px-3 py-2 text-right font-medium">= Market cap</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => (
              <tr key={r.symbol} className="border-t border-border">
                <th className="px-3 py-2 text-left font-medium">
                  {r.symbol} <span className="font-normal text-muted">{r.name}</span>
                </th>
                <td className="px-3 py-2 text-right">{dollars(r.price)}</td>
                <td className="px-3 py-2 text-right">{(r.shares / 1e9).toFixed(2)} billion</td>
                <td className="px-3 py-2 text-right font-medium">{capLabel(r.capBillions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows[0].capBillions !== rows[1].capBillions && (
        <p className="text-sm">
          {(rows[0].capBillions > rows[1].capBillions ? rows[0] : rows[1]).symbol} is worth about{" "}
          {(Math.max(rows[0].capBillions, rows[1].capBillions) / Math.min(rows[0].capBillions, rows[1].capBillions)).toFixed(1)}× as much, whatever their share prices say.
        </p>
      )}
      <div className="border-t border-border pt-4">
        <p className="text-sm font-medium">P/E calculator</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Slider label="Share price" value={price} min={5} max={500} step={5} format={dollars} onChange={setPrice} />
          <Slider label="Earnings per share (a year)" value={eps} min={0.5} max={25} step={0.5} format={dollars} onChange={setEps} />
        </div>
        <div className="mt-4">
          <StatRow>
            <Stat label="P/E ratio" value={pe.toFixed(1)} hint={`You pay ${dollars(pe)} per $1 of yearly profit`} />
            <Stat label="Earnings yield" value={plainPercent(eps / price)} hint="Profit ÷ price: P/E upside down" />
          </StatRow>
        </div>
      </div>
    </DemoFrame>
  );
}

const CORRELATIONS = [
  { value: "low", label: "Mostly independent" },
  { value: "high", label: "Move together" },
] as const;

/** Diversification: one stock against an equal mix of many. */
export function DiversificationDemo() {
  const [count, setCount] = useState(10);
  const [together, setTogether] = useState<(typeof CORRELATIONS)[number]["value"]>("low");
  const paths = useMemo(() => relatedPaths(81, 30, 504, together === "low" ? 0.2 : 0.85), [together]);
  const single = paths[0];
  const mix = useMemo(() => equalMix(paths.slice(0, count)), [paths, count]);
  const singleStats = metricsOf(single);
  const mixStats = metricsOf(mix);
  return (
    <DemoFrame title="One stock, or many?">
      <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
        <Slider label="Stocks in the mix" value={count} min={1} max={30} format={(v) => (v === 1 ? "1 stock" : `${v} stocks`)} onChange={setCount} />
        <Choice label="How the stocks relate" options={CORRELATIONS} value={together} onChange={setTogether} />
      </div>
      <DemoChart
        series={[
          { label: "One stock", values: single, color: "var(--series-2)", dashed: true },
          { label: `Equal mix of ${count}`, values: mix, color: "var(--series-1)" },
        ]}
        format={(v) => `$${v.toFixed(0)}`}
        summary={`One stock swings with ${plainPercent(singleStats.volatility, 0)} volatility; an equal mix of ${count} swings with ${plainPercent(mixStats.volatility, 0)}.`}
      />
      <StatRow>
        <Stat label="Volatility, one stock" value={plainPercent(singleStats.volatility, 0)} />
        <Stat label={`Volatility, mix of ${count}`} value={plainPercent(mixStats.volatility, 0)} />
        <Stat label="Worst fall, one vs mix" value={`−${plainPercent(worstDrawdown(single).depth, 0)} / −${plainPercent(worstDrawdown(mix).depth, 0)}`} />
      </StatRow>
      <p className="text-sm text-muted">
        {together === "low"
          ? "When stocks mostly move for their own reasons, their swings cancel out: a mix of 10–20 is far calmer than any one."
          : "When stocks move together, adding more barely helps: they all fall at once."}
      </p>
    </DemoFrame>
  );
}
