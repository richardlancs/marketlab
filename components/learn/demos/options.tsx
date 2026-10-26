"use client";

import { useState } from "react";
import { blackScholes, breakevens, impliedVolatility, intrinsicValue, profitAtExpiry, type Leg, type OptionKind } from "@/lib/lessons/demos";
import { Choice, DemoChart, DemoFrame, dollars, plainPercent, Slider, Stat, StatRow } from "./parts";

// Every number here is arithmetic only (lib/lessons/demos builds exp and log
// from series), so the server's render and the browser's agree to the bit.

/** Stock prices at expiry for the payoff charts: $60 to $140, a dollar apart. */
const GRID = Array.from({ length: 81 }, (_, i) => 60 + i);
const gridIndex = (price: number) => Math.round(price) - GRID[0];
const GRID_NOTE = "Stock price at expiry runs from $60 on the left to $140 on the right.";

const KINDS = [
  { value: "call", label: "Call" },
  { value: "put", label: "Put" },
] as const;
const SIDES = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
] as const;

/** Dollars for one contract (100 shares), with a sign: "+$700", "−$300". */
const contract = (perShare: number) => {
  const value = Math.round(perShare * 100);
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString("en-US")}`;
};
const price = (v: number) => `$${v.toFixed(2)}`;

/** The most a position can make and lose at expiry, per share. Payoffs are straight beyond the grid, so $0 and a far-off price settle it. */
function extremes(legs: readonly Leg[]) {
  const values = [0, ...GRID].map((p) => profitAtExpiry(legs, p));
  const far = profitAtExpiry(legs, 10_000);
  return { best: far > Math.max(...values) ? Infinity : Math.max(far, ...values), worst: far < Math.min(...values) ? -Infinity : Math.min(far, ...values) };
}

const breakEvenLine = { label: "Break even", values: GRID.map(() => 0), color: "var(--muted)", dashed: true };

/** Calls and puts: one option bought or sold, and its profit at expiry. */
export function OptionPayoffDemo() {
  const [kind, setKind] = useState<OptionKind>("call");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [strike, setStrike] = useState(105);
  const [premium, setPremium] = useState(3);
  const [end, setEnd] = useState(115);
  const legs: Leg[] = [{ kind, strike, premium, quantity: side === "buy" ? 1 : -1 }];
  const profit = GRID.map((p) => profitAtExpiry(legs, p));
  const atEnd = profitAtExpiry(legs, end);
  const { best, worst } = extremes(legs);
  const breakeven = kind === "call" ? strike + premium : strike - premium;
  const name = `${side === "buy" ? "Buying" : "Selling"} a $${strike} ${kind} for ${price(premium)}`;
  return (
    <DemoFrame title="Profit at expiry" note={`Each contract covers 100 shares. ${GRID_NOTE}`}>
      <div className="flex flex-wrap gap-2">
        <Choice label="Option" options={KINDS} value={kind} onChange={setKind} />
        <Choice label="Side" options={SIDES} value={side} onChange={setSide} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Slider label="Strike" value={strike} min={80} max={120} format={(v) => `$${v}`} onChange={setStrike} />
        <Slider label="Premium per share" value={premium} min={0.5} max={15} step={0.5} format={price} onChange={setPremium} />
        <Slider label="Stock price at expiry" value={end} min={60} max={140} format={(v) => `$${v}`} onChange={setEnd} />
      </div>
      <DemoChart
        series={[{ label: `${side === "buy" ? "Buyer" : "Seller"}'s profit per share`, values: profit, color: "var(--series-1)" }, breakEvenLine]}
        markers={[
          { index: gridIndex(strike), label: `Strike $${strike}` },
          ...(Math.round(end) !== strike ? [{ index: gridIndex(end), label: `Ends at $${end}` }] : []),
        ]}
        format={(v) => `$${v.toFixed(0)}`}
        summary={`${name}: if the stock ends at $${end}, the profit is ${contract(atEnd)} per contract. It breaks even at ${price(breakeven)}.`}
      />
      <StatRow>
        <Stat label={`Profit if it ends at $${end}`} value={contract(atEnd)} tone={atEnd > 0 ? "gain" : atEnd < 0 ? "loss" : undefined} hint="Per contract" />
        <Stat label="Breaks even at" value={price(breakeven)} hint={kind === "call" ? "Strike + premium" : "Strike − premium"} />
        <Stat label="Most it can make" value={best === Infinity ? "Unlimited" : contract(best)} />
        <Stat label="Most it can lose" value={worst === -Infinity ? "Unlimited" : contract(worst)} tone="loss" />
      </StatRow>
    </DemoFrame>
  );
}

const STOCK: Leg = { kind: "stock", price: 100, quantity: 1 };
/** Prices from Black-Scholes with the stock at $100, 3 months to expiry, 20% volatility and a 4% rate, as in the lesson. */
const STRATEGIES = [
  {
    value: "covered",
    label: "Covered call",
    text: "Own 100 shares bought at $100 and sell a $110 call for $1.14.",
    legs: [STOCK, { kind: "call", strike: 110, premium: 1.14, quantity: -1 }],
  },
  {
    value: "protective",
    label: "Protective put",
    text: "Own 100 shares bought at $100 and buy a $90 put for $0.58.",
    legs: [STOCK, { kind: "put", strike: 90, premium: 0.58, quantity: 1 }],
  },
  {
    value: "spread",
    label: "Bull call spread",
    text: "Buy a $100 call for $4.49 and sell a $110 call for $1.14.",
    legs: [
      { kind: "call", strike: 100, premium: 4.49, quantity: 1 },
      { kind: "call", strike: 110, premium: 1.14, quantity: -1 },
    ],
  },
  {
    value: "straddle",
    label: "Straddle",
    text: "Buy a $100 call for $4.49 and a $100 put for $3.49.",
    legs: [
      { kind: "call", strike: 100, premium: 4.49, quantity: 1 },
      { kind: "put", strike: 100, premium: 3.49, quantity: 1 },
    ],
  },
] as const satisfies readonly { value: string; label: string; text: string; legs: readonly Leg[] }[];

/** Option strategies: four classic combinations, against simply owning the shares. */
export function OptionStrategiesDemo() {
  const [choice, setChoice] = useState<(typeof STRATEGIES)[number]["value"]>("covered");
  const strategy = STRATEGIES.find((s) => s.value === choice)!;
  const legs: readonly Leg[] = strategy.legs;
  const { best, worst } = extremes(legs);
  const evens = breakevens(legs, GRID);
  const strikes = [...new Set(legs.flatMap((l) => (l.kind === "stock" ? [] : [l.strike])))];
  return (
    <DemoFrame title="Shape the payoff" note={`Profit per share at expiry; a contract is 100 shares. ${GRID_NOTE}`}>
      <Choice label="Strategy" options={STRATEGIES} value={choice} onChange={setChoice} />
      <p className="text-sm">{strategy.text}</p>
      <DemoChart
        series={[
          { label: strategy.label, values: GRID.map((p) => profitAtExpiry(legs, p)), color: "var(--series-1)" },
          { label: "Shares alone", values: GRID.map((p) => profitAtExpiry([STOCK], p)), color: "var(--series-2)", dashed: true },
          breakEvenLine,
        ]}
        markers={strikes.map((s) => ({ index: gridIndex(s), label: `$${s}` }))}
        format={(v) => `$${v.toFixed(0)}`}
        summary={`${strategy.text} It breaks even at ${evens.map(price).join(" and ")}; the most it can make is ${best === Infinity ? "unlimited" : price(best)} a share and the most it can lose is ${worst === -Infinity ? "unlimited" : price(-worst)} a share.`}
      />
      <StatRow>
        <Stat label="Breaks even at" value={evens.map(price).join(" / ")} />
        <Stat label="Most it can make" value={best === Infinity ? "Unlimited" : contract(best)} hint="Per 100 shares" />
        <Stat label="Most it can lose" value={worst === -Infinity ? "Unlimited" : contract(worst)} tone="loss" hint="Per 100 shares" />
      </StatRow>
    </DemoFrame>
  );
}

const RATE = 0.04;
const STRIKE = 100;

/** The Greeks: a Black-Scholes price, and how it reacts to the stock, time and volatility. */
export function OptionGreeksDemo() {
  const [kind, setKind] = useState<OptionKind>("call");
  const [spot, setSpot] = useState(100);
  const [weeks, setWeeks] = useState(13);
  const [volatility, setVolatility] = useState(0.2);
  const inputs = { spot, strike: STRIKE, years: weeks / 52, volatility, rate: RATE };
  const value = blackScholes(kind, inputs);
  const now = GRID.map((p) => blackScholes(kind, { ...inputs, spot: p }).price);
  const atExpiry = GRID.map((p) => intrinsicValue(kind, p, STRIKE));
  const greek = (v: number, digits = 2) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
  return (
    <DemoFrame title="What moves an option's price" note={`A $${STRIKE}-strike option priced by Black-Scholes with a ${plainPercent(RATE, 0)} interest rate and no dividends. ${GRID_NOTE}`}>
      <Choice label="Option" options={KINDS} value={kind} onChange={setKind} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Slider label="Stock price" value={spot} min={70} max={130} format={(v) => `$${v}`} onChange={setSpot} />
        <Slider label="Time to expiry" value={weeks} min={1} max={52} format={(v) => `${v} week${v === 1 ? "" : "s"}`} onChange={setWeeks} />
        <Slider label="Volatility" value={volatility} min={0.05} max={0.8} step={0.01} format={(v) => plainPercent(v, 0)} onChange={setVolatility} />
      </div>
      <DemoChart
        series={[
          { label: "Value today", values: now, color: "var(--series-1)" },
          { label: "Value at expiry", values: atExpiry, color: "var(--series-2)", dashed: true },
        ]}
        markers={[{ index: gridIndex(spot), label: `Stock $${spot}` }]}
        format={(v) => `$${v.toFixed(0)}`}
        summary={`With the stock at $${spot}, ${weeks} weeks to go and ${plainPercent(volatility, 0)} volatility, the ${kind} is worth ${price(value.price)} a share, with a delta of ${greek(value.delta)}.`}
      />
      <StatRow>
        <Stat label="Price" value={price(value.price)} hint={`${dollars(value.price * 100)} a contract`} />
        <Stat label="Delta" value={greek(value.delta)} hint="Per $1 in the stock" />
        <Stat label="Gamma" value={greek(value.gamma, 3)} hint="Delta's change per $1" />
        <Stat label="Theta" value={greek(value.theta, 3)} hint="Per day that passes" />
        <Stat label="Vega" value={greek(value.vega)} hint="Per 1 point of volatility" />
        <Stat label="Rho" value={greek(value.rho)} hint="Per 1 point of interest rate" />
      </StatRow>
    </DemoFrame>
  );
}

const HISTORICAL = 0.2;
const IV_INPUTS = { spot: 100, strike: STRIKE, years: 0.25, rate: RATE };
/** Volatilities for the price curve: 5% to 80%. */
const VOL_GRID = Array.from({ length: 76 }, (_, i) => 0.05 + i / 100);

/** Implied volatility: the volatility at which the model's price matches the market's. */
export function ImpliedVolatilityDemo() {
  const [market, setMarket] = useState(5.5);
  const solved = impliedVolatility("call", market, IV_INPUTS);
  const modelAtHistorical = blackScholes("call", { ...IV_INPUTS, volatility: HISTORICAL }).price;
  const curve = VOL_GRID.map((volatility) => blackScholes("call", { ...IV_INPUTS, volatility }).price);
  const implied = solved?.volatility;
  return (
    <DemoFrame title="Work backward from the price" note={`A 3-month $${STRIKE} call on a $100 stock, ${plainPercent(RATE, 0)} interest rate. The stock's historical volatility is ${plainPercent(HISTORICAL, 0)}.`}>
      <Slider label="The call's market price" value={market} min={1.5} max={12} step={0.05} format={price} onChange={setMarket} />
      <DemoChart
        series={[
          { label: "Black-Scholes price at each volatility", values: curve, color: "var(--series-1)" },
          { label: "Market price", values: VOL_GRID.map(() => market), color: "var(--series-2)", dashed: true },
        ]}
        markers={implied !== undefined && implied >= 0.05 && implied <= 0.8 ? [{ index: Math.round((implied - 0.05) * 100), label: `${plainPercent(implied)} implied` }] : []}
        format={(v) => `$${v.toFixed(0)}`}
        summary={implied === undefined ? `No volatility gives a price of ${price(market)}.` : `A market price of ${price(market)} implies ${plainPercent(implied)} volatility, against ${plainPercent(HISTORICAL, 0)} historical.`}
      />
      <p className="text-sm text-muted">Volatility runs from 5% on the left to 80% on the right. Where the curve meets the market price is the implied volatility.</p>
      <StatRow>
        <Stat label="Implied volatility" value={implied === undefined ? "—" : plainPercent(implied)} />
        <Stat label="Historical volatility" value={plainPercent(HISTORICAL, 0)} hint={`Model price ${price(modelAtHistorical)}`} />
        <Stat
          label="Options look"
          value={implied === undefined ? "—" : implied > HISTORICAL + 0.005 ? "Expensive" : implied < HISTORICAL - 0.005 ? "Cheap" : "Fairly priced"}
          hint="Compared with past swings"
        />
      </StatRow>
      {solved && (
        <div>
          <p className="text-sm font-medium">The first guesses, each halving the range</p>
          <ol className="mt-2 space-y-1 text-sm tabular-nums">
            {solved.steps.slice(0, 6).map((s, i) => (
              <li key={s.volatility} className="flex justify-between gap-3">
                <span className="text-muted">
                  {i + 1}. Try {plainPercent(s.volatility)}
                </span>
                <span>
                  {price(s.price)}, {s.price > market ? "too high" : "too low"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </DemoFrame>
  );
}
