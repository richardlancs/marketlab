"use client";

import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { ServiceError, useServiceData } from "@/components/ui/service-data";
import { Tabs } from "@/components/ui/tabs";
import { formatCurrency, formatDate, formatShare } from "@/lib/format";
import { STRATEGIES, type ChainExpiry, type Greeks, type Leg, type OptionChain, type OptionKind, type Payoff, type StrategyKey } from "@/lib/options/types";

const inputClass = "mt-1 h-10 w-full rounded-lg border border-border bg-transparent px-3 text-base outline-none focus-visible:border-accent sm:text-sm";
const labelClass = "block text-xs font-medium text-muted";
const pill = (on: boolean) =>
  `tap rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${on ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`;

interface Pick {
  kind: OptionKind;
  strike: number;
}

/**
 * The options lab: a simulated chain for one of MarketLab's stocks, a
 * strategy builder with payoff charts, and a Black-Scholes calculator with
 * an implied-volatility solver. Every number comes from the analytics
 * service (services/analytics/analytics/options.py).
 */
export function OptionsLab({ stocks }: { stocks: { symbol: string; name: string }[] }) {
  const id = useId();
  const [symbol, setSymbol] = useState(stocks[0]?.symbol ?? "AAPL");
  const [expiryIndex, setExpiryIndex] = useState(0);
  const [pick, setPick] = useState<Pick | null>(null);
  const state = useServiceData<{ chain: OptionChain }>({ url: `/api/options/chain?symbol=${encodeURIComponent(symbol)}` });
  const chain = state.status === "ok" ? state.data.chain : null;
  const expiry = chain?.expiries[Math.min(expiryIndex, chain.expiries.length - 1)] ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <label htmlFor={`${id}-stock`} className={labelClass}>
            Stock
          </label>
          <select
            id={`${id}-stock`}
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value);
              setPick(null);
            }}
            className={inputClass}
          >
            {stocks.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol} · {s.name}
              </option>
            ))}
          </select>
        </div>
        {chain && (
          <p className="pb-2 text-sm text-muted">
            {formatCurrency(chain.spot)} · past-year volatility {formatShare(chain.volatility)} · as of {formatDate(chain.asOf)}
          </p>
        )}
      </div>

      {state.status === "loading" && <div aria-busy className="mt-6 h-96 animate-pulse rounded-2xl bg-foreground/[0.06]" />}
      {state.status === "error" && <ServiceError message={state.message} onRetry={state.retry} className="mt-6" />}
      {chain && expiry && (
        <Tabs
          className="mt-4"
          label="Options lab"
          tabs={[
            {
              id: "chain",
              label: "Chain",
              content: (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
                  <Card aria-labelledby={`${id}-chain`} className="lg:col-span-8">
                    <h2 id={`${id}-chain`} className="text-lg font-semibold tracking-tight">
                      {symbol} options
                    </h2>
                    <ExpiryPicker chain={chain} index={expiryIndex} onChange={setExpiryIndex} />
                    <ChainTable expiry={expiry} spot={chain.spot} pick={pick} onPick={setPick} />
                  </Card>
                  <div className="lg:col-span-4">
                    <OptionDetail chain={chain} expiry={expiry} pick={pick} symbol={symbol} />
                  </div>
                </div>
              ),
            },
            { id: "strategy", label: "Strategies", content: <StrategyBuilder key={`${symbol}-${expiry.expiry}`} chain={chain} expiry={expiry} expiryPicker={<ExpiryPicker chain={chain} index={expiryIndex} onChange={setExpiryIndex} />} /> },
            { id: "calculator", label: "Calculator", content: <Calculator key={symbol} chain={chain} /> },
          ]}
        />
      )}
    </div>
  );
}

function ExpiryPicker({ chain, index, onChange }: { chain: OptionChain; index: number; onChange: (i: number) => void }) {
  return (
    <div role="group" aria-label="Expiry" className="mt-3 flex flex-wrap gap-1 rounded-2xl bg-foreground/[0.06] p-1 sm:inline-flex sm:rounded-full">
      {chain.expiries.map((e, i) => (
        <button key={e.expiry} type="button" aria-pressed={i === index} onClick={() => onChange(i)} className={pill(i === index)}>
          {new Date(`${e.expiry}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
          <span className="ml-1 text-muted">{e.days}d</span>
        </button>
      ))}
    </div>
  );
}

function ChainTable({ expiry, spot, pick, onPick }: { expiry: ChainExpiry; spot: number; pick: Pick | null; onPick: (p: Pick) => void }) {
  const nearest = expiry.strikes.reduce((best, r) => (Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best)).strike;
  const cell = (kind: OptionKind, strike: number, g: Greeks, inTheMoney: boolean) => {
    const selected = pick?.kind === kind && pick.strike === strike;
    return (
      <td className={`p-0 ${inTheMoney ? "bg-accent/[0.06]" : ""}`}>
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`${kind === "call" ? "Call" : "Put"} at ${formatCurrency(strike)}: ${formatCurrency(g.price)}, delta ${g.delta.toFixed(2)}`}
          onClick={() => onPick({ kind, strike })}
          className={`flex min-h-10 w-full items-center justify-end gap-3 px-2 tabular-nums transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${selected ? "bg-accent/15 font-semibold" : ""}`}
        >
          <span>{g.price.toFixed(2)}</span>
          <span className="hidden w-12 text-muted sm:inline">{g.delta.toFixed(2)}</span>
        </button>
      </td>
    );
  };
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Calls and puts by strike; shaded cells are in the money</caption>
        <thead className="text-xs text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Call <span className="hidden sm:inline">· delta</span>
            </th>
            <th scope="col" className="px-2 py-2 text-center font-medium">
              Strike
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Put <span className="hidden sm:inline">· delta</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {expiry.strikes.map((r) => (
            <tr key={r.strike} className={r.strike === nearest ? "border-y-2 border-y-accent/40" : ""}>
              {cell("call", r.strike, r.call, r.strike < spot)}
              <th scope="row" className="px-2 text-center font-semibold tabular-nums">
                {r.strike.toFixed(r.strike % 1 ? 1 : 0)}
              </th>
              {cell("put", r.strike, r.put, r.strike > spot)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">Prices per share (a contract is 100 shares). Shaded: in the money. Outlined: nearest the stock&apos;s price.</p>
    </div>
  );
}

function OptionDetail({ chain, expiry, pick, symbol }: { chain: OptionChain; expiry: ChainExpiry; pick: Pick | null; symbol: string }) {
  if (!pick) {
    return (
      <Card>
        <h2 className="text-lg font-semibold tracking-tight">The Greeks</h2>
        <p className="mt-2 text-sm text-muted">Choose a price in the chain to see what drives it.</p>
      </Card>
    );
  }
  const row = expiry.strikes.find((r) => r.strike === pick.strike);
  if (!row) return null;
  const g = row[pick.kind];
  const intrinsic = pick.kind === "call" ? Math.max(chain.spot - pick.strike, 0) : Math.max(pick.strike - chain.spot, 0);
  const lines: [string, string, string][] = [
    ["Price", formatCurrency(g.price), `${formatCurrency(intrinsic)} intrinsic value + ${formatCurrency(g.price - intrinsic)} time value; ${formatCurrency(g.price * 100)} a contract`],
    ["Delta", g.delta.toFixed(3), `Moves about ${formatCurrency(Math.abs(g.delta))} for each $1 the stock moves${pick.kind === "put" ? ", the other way" : ""}`],
    ["Gamma", g.gamma.toFixed(4), `Delta changes by ${g.gamma.toFixed(3)} for each $1 move`],
    ["Theta", g.theta.toFixed(3), `Loses about ${formatCurrency(Math.abs(g.theta))} a day as expiry nears, all else equal`],
    ["Vega", g.vega.toFixed(3), `Gains about ${formatCurrency(g.vega)} if volatility rises 1 point`],
    ["Rho", g.rho.toFixed(3), `Changes ${formatCurrency(Math.abs(g.rho))} if interest rates rise 1 point`],
  ];
  return (
    <Card aria-label="The Greeks">
      <h2 className="text-lg font-semibold tracking-tight">
        {symbol} {formatCurrency(pick.strike)} {pick.kind}
      </h2>
      <p className="text-xs text-muted">
        Expires {formatDate(Date.parse(`${expiry.expiry}T21:00:00Z`))}, in {expiry.days} days
      </p>
      <dl className="mt-4 space-y-3">
        {lines.map(([label, value, note]) => (
          <div key={label}>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
            <dd className="text-xs text-muted">{note}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

// --- Strategies ------------------------------------------------------------------------

/** The strikes a strategy starts with: at the money, or a step or two out, from the chosen expiry. */
function legsFor(key: StrategyKey, expiry: ChainExpiry, spot: number, strikes: { a: number; b: number }): Leg[] {
  const row = (k: number) => expiry.strikes.find((r) => r.strike === k) ?? expiry.strikes[0];
  const call = (k: number, side: Leg["side"]): Leg => ({ kind: "call", side, quantity: 100, strike: k, premium: row(k).call.price });
  const put = (k: number, side: Leg["side"]): Leg => ({ kind: "put", side, quantity: 100, strike: k, premium: row(k).put.price });
  const stock: Leg = { kind: "stock", side: "long", quantity: 100, price: spot };
  switch (key) {
    case "long-call":
      return [call(strikes.a, "long")];
    case "long-put":
      return [put(strikes.a, "long")];
    case "covered-call":
      return [stock, call(strikes.a, "short")];
    case "protective-put":
      return [stock, put(strikes.a, "long")];
    case "bull-call-spread":
      return [call(strikes.a, "long"), call(strikes.b, "short")];
    case "straddle":
      return [call(strikes.a, "long"), put(strikes.a, "long")];
  }
}

function defaultStrikes(key: StrategyKey, expiry: ChainExpiry, spot: number) {
  const list = expiry.strikes.map((r) => r.strike);
  const atm = list.reduce((best, k) => (Math.abs(k - spot) < Math.abs(best - spot) ? k : best));
  const i = list.indexOf(atm);
  const at = (j: number) => list[Math.max(0, Math.min(list.length - 1, j))];
  if (key === "covered-call") return { a: at(i + 2), b: at(i + 4) };
  if (key === "protective-put") return { a: at(i - 2), b: at(i - 4) };
  return { a: atm, b: at(i + 3) };
}

function StrategyBuilder({ chain, expiry, expiryPicker }: { chain: OptionChain; expiry: ChainExpiry; expiryPicker: ReactNode }) {
  const id = useId();
  const [key, setKey] = useState<StrategyKey>("covered-call");
  const [strikes, setStrikes] = useState(() => defaultStrikes("covered-call", expiry, chain.spot));
  const legs = useMemo(() => legsFor(key, expiry, chain.spot, strikes), [key, expiry, chain.spot, strikes]);
  const state = useServiceData<Payoff>({ url: "/api/options/payoff", body: { spot: chain.spot, legs } });
  const twoStrikes = key === "bull-call-spread";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      <Card aria-labelledby={`${id}-title`} className="lg:col-span-4">
        <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
          Build a strategy
        </h2>
        <div role="group" aria-label="Strategy" className="mt-3 flex flex-wrap gap-1.5">
          {(Object.keys(STRATEGIES) as StrategyKey[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={k === key}
              onClick={() => {
                setKey(k);
                setStrikes(defaultStrikes(k, expiry, chain.spot));
              }}
              className={`tap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${k === key ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"}`}
            >
              {STRATEGIES[k].name}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">{STRATEGIES[key].about}</p>
        {expiryPicker}
        <div className={`mt-4 grid gap-3 ${twoStrikes ? "grid-cols-2" : "grid-cols-1"}`}>
          <StrikeSelect id={`${id}-a`} label={twoStrikes ? "Buy the call at" : "Strike"} expiry={expiry} value={strikes.a} onChange={(a) => setStrikes((s) => ({ ...s, a }))} />
          {twoStrikes && <StrikeSelect id={`${id}-b`} label="Sell the call at" expiry={expiry} value={strikes.b} onChange={(b) => setStrikes((s) => ({ ...s, b }))} />}
        </div>
        <ul className="mt-4 space-y-1 text-sm">
          {legs.map((leg, i) => (
            <li key={i} className="flex justify-between gap-2 tabular-nums">
              <span>
                {leg.side === "long" ? "Buy" : "Sell"} {leg.kind === "stock" ? "100 shares" : `1 ${leg.kind} at ${formatCurrency(leg.strike!)}`}
              </span>
              <span className="text-muted">{leg.kind === "stock" ? formatCurrency(leg.price!) : `${formatCurrency(leg.premium!)} a share`}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card aria-labelledby={`${id}-payoff`} aria-live="polite" className="lg:col-span-8">
        <h2 id={`${id}-payoff`} className="text-lg font-semibold tracking-tight">
          Profit at expiry
        </h2>
        {state.status === "loading" && <div aria-busy className="mt-4 h-64 animate-pulse rounded-lg bg-foreground/[0.06]" />}
        {state.status === "error" && <ServiceError message={state.message} onRetry={state.retry} />}
        {state.status === "ok" && <PayoffChart payoff={state.data} spot={chain.spot} />}
      </Card>
    </div>
  );
}

function StrikeSelect({ id, label, expiry, value, onChange }: { id: string; label: string; expiry: ChainExpiry; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputClass}>
        {expiry.strikes.map((r) => (
          <option key={r.strike} value={r.strike}>
            {formatCurrency(r.strike)}
          </option>
        ))}
      </select>
    </div>
  );
}

function PayoffChart({ payoff, spot }: { payoff: Payoff; spot: number }) {
  const { prices, profit } = payoff;
  const [x0, x1] = [prices[0], prices[prices.length - 1]];
  const lo = Math.min(...profit, 0);
  const hi = Math.max(...profit, 0);
  const pad = (hi - lo) * 0.08 || 1;
  const x = (p: number) => ((p - x0) / (x1 - x0)) * 100;
  const y = (v: number) => 48 - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 46;
  const line = `M${prices.map((p, i) => `${x(p).toFixed(2)},${y(profit[i]).toFixed(2)}`).join(" L")}`;
  const zero = y(0);
  const money = (v: number | null, unlimited: string) => (v === null ? unlimited : formatCurrency(v));
  return (
    <div>
      <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="mt-4 h-64 w-full" role="img" aria-label={`Profit at expiry from ${formatCurrency(x0)} to ${formatCurrency(x1)}: breakeven ${payoff.breakevens.map((b) => formatCurrency(b)).join(" and ") || "none"}`}>
        <defs>
          <clipPath id="payoff-above">
            <rect x="0" y="0" width="100" height={zero} />
          </clipPath>
          <clipPath id="payoff-below">
            <rect x="0" y={zero} width="100" height={50 - zero} />
          </clipPath>
        </defs>
        <path d={`${line} L100,${zero} L0,${zero} Z`} className="fill-gain/15" clipPath="url(#payoff-above)" />
        <path d={`${line} L100,${zero} L0,${zero} Z`} className="fill-loss/15" clipPath="url(#payoff-below)" />
        <line x1="0" x2="100" y1={zero} y2={zero} className="stroke-foreground/40" vectorEffect="non-scaling-stroke" />
        <line x1={x(spot)} x2={x(spot)} y1="0" y2="50" className="stroke-foreground/30" strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />
        <path d={line} fill="none" className="stroke-accent" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-xs text-muted">
        <span>{formatCurrency(x0)}</span>
        <span>Dashed: today&apos;s price</span>
        <span>{formatCurrency(x1)}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">Most it can make</dt>
          <dd className="font-semibold tabular-nums text-gain">{money(payoff.maxProfit, "Unlimited")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Most it can lose</dt>
          <dd className="font-semibold tabular-nums text-loss">{money(payoff.maxLoss, "Unlimited")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Breakeven{payoff.breakevens.length === 1 ? "" : "s"}</dt>
          <dd className="font-semibold tabular-nums">{payoff.breakevens.length ? payoff.breakevens.map((b) => formatCurrency(b)).join(", ") : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Premium</dt>
          <dd className="font-semibold tabular-nums">{payoff.netPremium >= 0 ? `${formatCurrency(payoff.netPremium)} received` : `${formatCurrency(-payoff.netPremium)} paid`}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">At expiry, for one contract (100 shares) per option, before trading costs. Simulated prices: learning only.</p>
    </div>
  );
}

// --- Calculator -----------------------------------------------------------------------

function Calculator({ chain }: { chain: OptionChain }) {
  const id = useId();
  const [form, setForm] = useState({ kind: "call" as OptionKind, spot: chain.spot.toFixed(2), strike: chain.expiries[0].strikes[Math.floor(chain.expiries[0].strikes.length / 2)].strike.toString(), days: "30", vol: (chain.volatility * 100).toFixed(1), rate: (chain.rate * 100).toFixed(1), market: "" });
  const [request, setRequest] = useState<{ price: Record<string, unknown>; iv: Record<string, unknown> | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const priced = useServiceData<Greeks>(request ? { url: "/api/options/price", body: request.price } : null);
  const implied = useServiceData<{ volatility: number }>(request?.iv ? { url: "/api/options/implied-volatility", body: request.iv } : null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    const n = { spot: Number(form.spot), strike: Number(form.strike), days: Number(form.days), vol: Number(form.vol) / 100, rate: Number(form.rate) / 100, market: form.market.trim() ? Number(form.market) : null };
    if (!(n.spot > 0 && n.strike > 0 && Number.isInteger(n.days) && n.days >= 0 && n.vol > 0 && Number.isFinite(n.rate))) return setProblem("Check the numbers: prices and volatility above zero, days a whole number.");
    if (n.market !== null && !(n.market > 0 && n.days > 0)) return setProblem("The market price must be above zero, with at least a day to expiry.");
    setProblem(null);
    const common = { kind: form.kind, spot: n.spot, strike: n.strike, days: n.days, rate: n.rate, dividendYield: chain.dividendYield };
    setRequest({ price: { ...common, volatility: n.vol }, iv: n.market !== null ? { ...common, price: n.market } : null });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      <Card aria-labelledby={`${id}-title`} className="lg:col-span-5">
        <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
          Black-Scholes calculator
        </h2>
        <form onSubmit={submit} className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2 flex gap-1 rounded-full bg-foreground/[0.06] p-1" role="group" aria-label="Option type">
            {(["call", "put"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={form.kind === k} onClick={() => setForm((f) => ({ ...f, kind: k }))} className={`flex-1 ${pill(form.kind === k)}`}>
                {k === "call" ? "Call" : "Put"}
              </button>
            ))}
          </div>
          {(
            [
              ["spot", "Stock price ($)"],
              ["strike", "Strike ($)"],
              ["days", "Days to expiry"],
              ["vol", "Volatility (%)"],
              ["rate", "Interest rate (%)"],
              ["market", "Market price, for implied volatility ($, optional)"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className={k === "market" ? "col-span-2" : ""}>
              <label htmlFor={`${id}-${k}`} className={labelClass}>
                {label}
              </label>
              <input id={`${id}-${k}`} inputMode="decimal" value={form[k]} onChange={set(k)} className={inputClass} />
            </div>
          ))}
          {problem && (
            <p role="alert" className="col-span-2 text-sm text-loss">
              {problem}
            </p>
          )}
          <button type="submit" className="col-span-2 h-10 rounded-full bg-accent-fill text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Calculate
          </button>
        </form>
      </Card>
      <Card aria-label="Result" aria-live="polite" className="self-start lg:col-span-7">
        {!request && <p className="text-sm text-muted">Set the inputs and calculate. Start from this stock&apos;s price and past-year volatility, then change one thing at a time to see what each does.</p>}
        {request && priced.status === "loading" && <div aria-busy className="h-40 animate-pulse rounded-lg bg-foreground/[0.06]" />}
        {request && priced.status === "error" && <ServiceError message={priced.message} onRetry={priced.retry} className="" />}
        {request && priced.status === "ok" && (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {(["price", "delta", "gamma", "theta", "vega", "rho"] as const).map((k) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k === "price" ? "Fair value" : k[0].toUpperCase() + k.slice(1)}</dt>
                <dd className="text-lg font-semibold tabular-nums">{k === "price" ? formatCurrency(priced.data.price) : priced.data[k].toFixed(k === "gamma" ? 4 : 3)}</dd>
              </div>
            ))}
          </dl>
        )}
        {request?.iv && (
          <div className="mt-5 border-t border-border pt-4 text-sm">
            {implied.status === "loading" && <p className="text-muted">Solving for implied volatility…</p>}
            {implied.status === "error" && <ServiceError message={implied.message} onRetry={implied.retry} className="" />}
            {implied.status === "ok" && (
              <p>
                At {formatCurrency(Number(request.iv.price))}, the market would be implying a volatility of <strong className="font-semibold tabular-nums">{formatShare(implied.data.volatility)}</strong>, against the{" "}
                {formatShare(Number(request.price.volatility))} you entered{implied.data.volatility > Number(request.price.volatility) ? ": it expects bigger moves" : ": it expects calmer moves"}.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
