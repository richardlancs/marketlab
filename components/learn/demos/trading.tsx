"use client";

import { useMemo, useState } from "react";
import { afterCosts, compoundPath, orderFill, pricePath, type OrderKind } from "@/lib/lessons/demos";
import { Choice, DemoChart, DemoFrame, dollars, plainPercent, signedPercent, Slider, Stat, StatRow } from "./parts";

/** Twenty daily closes with one sharp overnight drop (day 13), so a stop can fill below its level. */
const CLOSES = [100, 101, 99.2, 100.5, 98.1, 97.6, 99, 96.4, 95.7, 97.2, 94.6, 93.8, 95.1, 88.2, 87.5, 89.3, 90.4, 91.6, 92.3, 93.5];

const ORDER_KINDS = [
  { value: "market", label: "Market buy" },
  { value: "limit", label: "Limit buy" },
  { value: "stop", label: "Stop-loss sell" },
] as const;

/** Market, limit and stop orders: when each fills, and at what price, on daily closes. */
export function OrdersDemo() {
  const [kind, setKind] = useState<OrderKind>("limit");
  const [level, setLevel] = useState(96);
  const fill = orderFill(CLOSES, kind, level);
  const describe =
    kind === "market"
      ? "A market order fills at the next close, whatever it is."
      : kind === "limit"
        ? `A buy limit at ${dollars(level)} fills at the first close at or below it.`
        : `A stop-loss at ${dollars(level)} sells at the first close at or below it, even if that's well below.`;
  return (
    <DemoFrame title="When does the order fill?" note="Made-up closes. MarketLab checks orders at each day's close, like this.">
      <div className="flex flex-wrap items-center gap-4">
        <Choice label="Order type" options={ORDER_KINDS} value={kind} onChange={setKind} />
      </div>
      {kind !== "market" && <Slider label={kind === "limit" ? "Limit price" : "Stop price"} value={level} min={85} max={100} step={0.5} format={dollars} onChange={setLevel} />}
      <DemoChart
        series={[
          { label: "Daily close", values: CLOSES, color: "var(--series-1)" },
          ...(kind === "market" ? [] : [{ label: kind === "limit" ? "Your limit" : "Your stop", values: CLOSES.map(() => level), color: "var(--series-2)", dashed: true }]),
        ]}
        domain={[84, 103]}
        markers={fill ? [{ index: fill.day, label: `Fills at ${dollars(fill.price)}` }] : []}
        format={(v) => `$${v.toFixed(0)}`}
        summary={`${describe} ${fill ? `Here it fills on day ${fill.day} at ${dollars(fill.price)}.` : "Here it never fills."}`}
      />
      <p className="text-sm">{describe}</p>
      <StatRow>
        <Stat label="Fills on" value={fill ? `Day ${fill.day}` : "Never"} hint={fill ? undefined : "The price never reached it"} />
        <Stat label="Fill price" value={fill ? dollars(fill.price) : "—"} />
        {kind === "stop" && fill && <Stat label="Below your stop by" value={dollars(Math.max(0, level - fill.price))} tone={level - fill.price > 0.5 ? "loss" : undefined} hint="Gaps skip past stops" />}
      </StatRow>
    </DemoFrame>
  );
}

/** Trading costs: how commissions and slippage eat into a return as trading increases. */
export function TradingCostsDemo() {
  const [tradesPerYear, setTradesPerYear] = useState(50);
  const [commission, setCommission] = useState(1);
  const [slippage, setSlippage] = useState(10);
  const years = 5;
  const gross = 1.08 ** years - 1;
  const result = afterCosts(10_000, gross, tradesPerYear * years, commission, slippage);
  return (
    <DemoFrame title="What trading costs add up to" note="$10,000 earning 8% a year before costs, for 5 years.">
      <div className="grid gap-4 sm:grid-cols-3">
        <Slider label="Trades a year" value={tradesPerYear} min={0} max={250} step={5} format={String} onChange={setTradesPerYear} />
        <Slider label="Commission per trade" value={commission} min={0} max={10} step={0.5} format={dollars} onChange={setCommission} />
        <Slider label="Slippage" value={slippage} min={0} max={50} step={1} format={(v) => `${v} bps (${(v / 100).toFixed(2)}%)`} onChange={setSlippage} />
      </div>
      <StatRow>
        <Stat label="Without costs" value={dollars(result.gross)} tone="gain" />
        <Stat label="After costs" value={dollars(result.net)} tone={result.net < 10_000 ? "loss" : "gain"} />
        <Stat label="Lost to costs" value={dollars(result.cost)} tone={result.cost > 0 ? "loss" : undefined} hint={`${plainPercent(result.cost / result.gross)} of the result`} />
      </StatRow>
    </DemoFrame>
  );
}

/** Dividends and dividend yield: income now, and what reinvesting it does over time. */
export function DividendDemo() {
  const [shares, setShares] = useState(100);
  const [price, setPrice] = useState(60);
  const [yieldRate, setYieldRate] = useState(0.03);
  const annual = shares * price * yieldRate;
  const quarterly = annual / 4;
  const perShare = (price * yieldRate) / 4;
  // 20 years, price growing 4% a year: dividends taken as cash vs reinvested in more shares.
  const growth = 0.04;
  const start = shares * price;
  const reinvested = compoundPath(start, growth + yieldRate, 20);
  const priceOnly = compoundPath(start, growth, 20);
  const cashCollected = priceOnly.slice(0, -1).reduce((sum, v) => sum + v * yieldRate, 0);
  return (
    <DemoFrame title="Your dividends" note="An illustration with steady numbers; real dividends and prices change.">
      <div className="grid gap-4 sm:grid-cols-3">
        <Slider label="Shares" value={shares} min={10} max={1000} step={10} format={String} onChange={setShares} />
        <Slider label="Share price" value={price} min={10} max={300} step={5} format={dollars} onChange={setPrice} />
        <Slider label="Dividend yield" value={yieldRate} min={0} max={0.08} step={0.0025} format={(v) => plainPercent(v, 2)} onChange={setYieldRate} />
      </div>
      <StatRow>
        <Stat label="A year of dividends" value={dollars(annual)} />
        <Stat label="Each quarter" value={dollars(quarterly)} hint={`${dollars(perShare)} a share`} />
        <Stat label="Price on the ex-date" value={`≈ ${dollars(price - perShare)}`} hint="Drops by about the dividend" />
      </StatRow>
      <DemoChart
        series={[
          { label: "Dividends reinvested", values: reinvested, color: "var(--series-1)" },
          { label: "Dividends taken as cash", values: priceOnly, color: "var(--series-2)", dashed: true },
        ]}
        format={(v) => dollars(v)}
        summary={`Over 20 years with the price rising 4% a year, reinvesting grows ${dollars(start)} to ${dollars(reinvested[20])}; taking the cash leaves ${dollars(priceOnly[20])} in shares plus about ${dollars(cashCollected)} collected.`}
      />
      <p className="text-sm text-muted">
        After 20 years: {dollars(reinvested[20])} reinvested, against {dollars(priceOnly[20])} in shares plus {dollars(cashCollected)} of dividends spent along the way.
      </p>
    </DemoFrame>
  );
}

const SPLITS = [
  { value: "2", label: "2-for-1" },
  { value: "3", label: "3-for-1" },
  { value: "1.5", label: "3-for-2" },
  { value: "10", label: "10-for-1" },
] as const;

/** Stock splits and adjusted prices: the holding stays the same; raw prices jump, adjusted ones don't. */
export function SplitDemo() {
  const [ratio, setRatio] = useState<(typeof SPLITS)[number]["value"]>("2");
  const r = Number(ratio);
  const shares = 15;
  const price = 600;
  const newShares = shares * r;
  const whole = Math.floor(newShares);
  const cash = (newShares - whole) * (price / r);
  const SPLIT_DAY = 120;
  const adjusted = useMemo(() => pricePath(71, 252, { start: 600 / r, annualVolatility: 0.25, annualReturn: 0.12 }), [r]);
  const raw = adjusted.map((v, i) => (i < SPLIT_DAY ? v * r : v));
  return (
    <DemoFrame title="Before and after a split">
      <Choice label="Split" options={SPLITS} value={ratio} onChange={setRatio} />
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-foreground/[0.03] text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium" />
              <th className="px-3 py-2 text-right font-medium">Shares</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr className="border-t border-border">
              <th className="px-3 py-2 text-left font-medium">Before</th>
              <td className="px-3 py-2 text-right">{shares}</td>
              <td className="px-3 py-2 text-right">{dollars(price)}</td>
              <td className="px-3 py-2 text-right">{dollars(shares * price)}</td>
            </tr>
            <tr className="border-t border-border">
              <th className="px-3 py-2 text-left font-medium">After</th>
              <td className="px-3 py-2 text-right">{whole}</td>
              <td className="px-3 py-2 text-right">{dollars(price / r)}</td>
              <td className="px-3 py-2 text-right">
                {dollars(whole * (price / r))}
                {cash > 0 && <span className="text-muted"> + {dollars(cash)} cash</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {cash > 0 && (
        <p className="text-sm text-muted">
          {shares} × {r} = {newShares} shares: the {newShares - whole} of a share is paid out in cash, as MarketLab does.
        </p>
      )}
      <DemoChart
        series={[
          { label: "Price as it traded", values: raw, color: "var(--series-2)", dashed: true },
          { label: "Adjusted price", values: adjusted, color: "var(--series-1)" },
        ]}
        markers={[{ index: SPLIT_DAY, label: "Split" }]}
        format={(v) => `$${v.toFixed(0)}`}
        summary={`The price as traded drops to 1/${r} on the split day, which looks like a crash; the adjusted price divides the earlier prices by ${r}, so the line is continuous.`}
      />
      <p className="text-sm">
        The raw line seems to crash {signedPercent(1 / r - 1)} on the split day; nothing was lost. The adjusted line divides every earlier price by {r}, so the history compares like for like.
      </p>
    </DemoFrame>
  );
}
