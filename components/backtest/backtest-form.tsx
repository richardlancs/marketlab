"use client";

import { LIMITS, parseConfig, STRATEGY_NAMES, type BacktestConfig, type StrategyConfig } from "@/lib/backtest/config";
import { DAY } from "@/lib/market/calendar";

/** The form as typed: strings, so half-finished numbers don't throw. */
export interface FormState {
  holdings: { symbol: string; percent: string }[];
  strategy: StrategyConfig["kind"];
  fast: string;
  slow: string;
  installments: string;
  frequency: "monthly" | "quarterly";
  /** YYYY-MM-DD, as date inputs use. */
  start: string;
  end: string;
  cash: string;
  commission: string;
  slippage: string;
  benchmark: BacktestConfig["benchmark"];
}

export interface StockOption {
  symbol: string;
  name: string;
}

const toInput = (time: number) => new Date(time).toISOString().slice(0, 10);
const fromInput = (value: string) => Date.parse(`${value}T00:00:00Z`);
const yearsBefore = (time: number, years: number) => {
  const d = new Date(time);
  return Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), d.getUTCDate());
};

export function defaultForm(lastDate: number): FormState {
  return {
    holdings: [{ symbol: "AAPL", percent: "100" }],
    strategy: "moving-average",
    fast: "50",
    slow: "200",
    installments: "12",
    frequency: "quarterly",
    start: toInput(yearsBefore(lastDate, 5)),
    end: toInput(lastDate),
    cash: "10000",
    commission: "0",
    slippage: "0",
    benchmark: "same-stocks",
  };
}

/** The form's own form of a saved config, to load a run back into the form. */
export function formFromConfig(config: BacktestConfig): FormState {
  const s = config.strategy;
  return {
    holdings: config.holdings.map((h) => ({ symbol: h.symbol, percent: String(Math.round(h.weight * 1000) / 10) })),
    strategy: s.kind,
    fast: s.kind === "moving-average" ? String(s.fast) : "50",
    slow: s.kind === "moving-average" ? String(s.slow) : "200",
    installments: s.kind === "dollar-cost-averaging" ? String(s.installments) : "12",
    frequency: s.kind === "rebalancing" ? s.frequency : "quarterly",
    start: toInput(config.start),
    end: toInput(config.end),
    cash: String(config.initialCash),
    commission: String(config.costs.commission),
    slippage: String(config.costs.slippageBps),
    benchmark: config.benchmark,
  };
}

/** Turns the form into a config, or explains the first problem in plain words. */
export function toConfig(form: FormState, symbols: readonly string[]): { config: BacktestConfig } | { error: string } {
  const percents = form.holdings.map((h) => Number(h.percent));
  if (percents.some((p) => !(p > 0))) return { error: "Give every stock a weight above 0%." };
  const total = percents.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 0.1) return { error: `The weights add up to ${Math.round(total * 10) / 10}%. They need to add up to 100%.` };
  if (new Set(form.holdings.map((h) => h.symbol)).size !== form.holdings.length) return { error: "Each stock can only be listed once." };

  const fast = Number(form.fast);
  const slow = Number(form.slow);
  if (form.strategy === "moving-average" && !(Number.isInteger(fast) && Number.isInteger(slow) && fast >= 2 && slow > fast && slow <= LIMITS.maxAverageDays)) {
    return { error: `The short average must be at least 2 days and shorter than the long one (at most ${LIMITS.maxAverageDays} days).` };
  }
  const installments = Number(form.installments);
  if (form.strategy === "dollar-cost-averaging" && !(Number.isInteger(installments) && installments >= 1 && installments <= LIMITS.maxInstallments)) {
    return { error: `Choose between 1 and ${LIMITS.maxInstallments} monthly purchases.` };
  }

  const start = fromInput(form.start);
  const end = fromInput(form.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return { error: "The start date must be before the end date." };

  const cash = Number(form.cash);
  if (!(cash >= LIMITS.minCash && cash <= LIMITS.maxCash)) return { error: `Starting cash must be between $${LIMITS.minCash} and $${LIMITS.maxCash.toLocaleString("en-US")}.` };
  const commission = Number(form.commission || 0);
  const slippage = Number(form.slippage || 0);
  if (!(commission >= 0 && commission <= LIMITS.maxCommission)) return { error: `Commission must be between $0 and $${LIMITS.maxCommission}.` };
  if (!(slippage >= 0 && slippage <= LIMITS.maxSlippageBps)) return { error: `Slippage must be between 0 and ${LIMITS.maxSlippageBps} basis points.` };

  const strategy: StrategyConfig =
    form.strategy === "moving-average"
      ? { kind: "moving-average", fast, slow }
      : form.strategy === "dollar-cost-averaging"
        ? { kind: "dollar-cost-averaging", installments }
        : form.strategy === "rebalancing"
          ? { kind: "rebalancing", frequency: form.frequency }
          : { kind: "buy-and-hold" };

  const config = parseConfig(
    {
      holdings: form.holdings.map((h, i) => ({ symbol: h.symbol, weight: percents[i] / total })),
      strategy,
      start,
      end: end + DAY - 1, // include the whole end day
      initialCash: cash,
      costs: { commission, slippageBps: slippage },
      benchmark: form.benchmark,
    },
    symbols,
  );
  return config ? { config } : { error: "Those settings aren't valid. Check each field." };
}

const STRATEGY_HELP: Record<StrategyConfig["kind"], string> = {
  "buy-and-hold": "Invest everything on the first day and never trade.",
  "moving-average": "Hold each stock while its short-term average price is above its long-term one (an uptrend), and cash otherwise.",
  "dollar-cost-averaging": "Spread the starting cash over equal monthly purchases instead of investing it all at once.",
  rebalancing: "Invest at the weights below, then reset to them regularly by selling what grew and buying what shrank.",
};

const input =
  "h-10 w-full rounded-lg border border-border bg-transparent px-3 text-base tabular-nums outline-none transition-colors focus-visible:border-accent sm:text-sm";
const label = "text-xs text-muted";
const fieldset = "space-y-3 border-t border-border pt-4 first:border-0 first:pt-0";
const legend = "mb-2 text-sm font-semibold";

interface BacktestFormProps {
  form: FormState;
  onChange: (form: FormState) => void;
  onRun: () => void;
  stocks: StockOption[];
  firstDate: number;
  lastDate: number;
  running: boolean;
  error: string | null;
}

export function BacktestForm({ form, onChange, onRun, stocks, firstDate, lastDate, running, error }: BacktestFormProps) {
  const set = (patch: Partial<FormState>) => onChange({ ...form, ...patch });
  const setHolding = (i: number, patch: Partial<FormState["holdings"][number]>) =>
    set({ holdings: form.holdings.map((h, j) => (j === i ? { ...h, ...patch } : h)) });
  const total = form.holdings.reduce((sum, h) => sum + (Number(h.percent) || 0), 0);
  const unused = stocks.find((s) => !form.holdings.some((h) => h.symbol === s.symbol));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onRun();
      }}
      noValidate
      className="space-y-5"
    >
      <fieldset className={fieldset}>
        <legend className={legend}>Stocks</legend>
        {form.holdings.map((holding, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor={`stock-${i}`} className={label}>
                Stock {form.holdings.length > 1 ? i + 1 : ""}
              </label>
              <select id={`stock-${i}`} value={holding.symbol} onChange={(e) => setHolding(i, { symbol: e.target.value })} className={`${input} mt-1`}>
                {stocks.map((s) => (
                  <option key={s.symbol} value={s.symbol} disabled={s.symbol !== holding.symbol && form.holdings.some((h) => h.symbol === s.symbol)}>
                    {s.symbol} · {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-20">
              <label htmlFor={`weight-${i}`} className={label}>
                Weight %
              </label>
              <input
                id={`weight-${i}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                value={holding.percent}
                onChange={(e) => setHolding(i, { percent: e.target.value })}
                className={`${input} mt-1`}
              />
            </div>
            {form.holdings.length > 1 && (
              <button
                type="button"
                onClick={() => set({ holdings: form.holdings.filter((_, j) => j !== i) })}
                aria-label={`Remove ${holding.symbol}`}
                className="grid size-10 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-foreground/5 hover:text-loss focus-visible:outline-2 focus-visible:outline-accent"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {form.holdings.length < LIMITS.maxHoldings && unused && (
            <button
              type="button"
              onClick={() => set({ holdings: [...form.holdings, { symbol: unused.symbol, percent: "0" }] })}
              className="font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              + Add a stock
            </button>
          )}
          {form.holdings.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const each = Math.floor((100 / form.holdings.length) * 10) / 10;
                // Give any rounding remainder to the first stock, so the total is exactly 100.
                const first = Math.round((100 - each * (form.holdings.length - 1)) * 10) / 10;
                set({ holdings: form.holdings.map((h, i) => ({ ...h, percent: String(i === 0 ? first : each) })) });
              }}
              className="font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Split evenly
            </button>
          )}
          <span className={`ml-auto text-xs tabular-nums ${Math.abs(total - 100) > 0.1 ? "text-loss" : "text-muted"}`}>Total {Math.round(total * 10) / 10}%</span>
        </div>
      </fieldset>

      <fieldset className={fieldset}>
        <legend className={legend}>Strategy</legend>
        <div className="grid gap-2">
          {(Object.keys(STRATEGY_NAMES) as StrategyConfig["kind"][]).map((kind) => (
            <label
              key={kind}
              className="cursor-pointer rounded-xl border border-border p-3 transition-colors has-checked:border-accent has-checked:bg-accent/[0.06] has-focus-visible:outline-2 has-focus-visible:outline-accent"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="strategy"
                  value={kind}
                  checked={form.strategy === kind}
                  // Buy and hold against buying and holding the same stocks would be one line twice, so compare it with the market.
                  onChange={() => set(kind === "buy-and-hold" ? { strategy: kind, benchmark: "market" } : { strategy: kind })}
                  className="accent-accent"
                />
                {STRATEGY_NAMES[kind]}
              </span>
              <span className="mt-1 block text-xs text-muted">{STRATEGY_HELP[kind]}</span>
            </label>
          ))}
        </div>

        {form.strategy === "moving-average" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="fast" className={label}>
                Short average (days)
              </label>
              <input id="fast" type="number" inputMode="numeric" value={form.fast} onChange={(e) => set({ fast: e.target.value })} className={`${input} mt-1`} />
            </div>
            <div>
              <label htmlFor="slow" className={label}>
                Long average (days)
              </label>
              <input id="slow" type="number" inputMode="numeric" value={form.slow} onChange={(e) => set({ slow: e.target.value })} className={`${input} mt-1`} />
            </div>
          </div>
        )}
        {form.strategy === "dollar-cost-averaging" && (
          <div>
            <label htmlFor="installments" className={label}>
              Monthly purchases
            </label>
            <input
              id="installments"
              type="number"
              inputMode="numeric"
              value={form.installments}
              onChange={(e) => set({ installments: e.target.value })}
              className={`${input} mt-1`}
            />
          </div>
        )}
        {form.strategy === "rebalancing" && (
          <div>
            <label htmlFor="frequency" className={label}>
              Rebalance
            </label>
            <select id="frequency" value={form.frequency} onChange={(e) => set({ frequency: e.target.value as FormState["frequency"] })} className={`${input} mt-1`}>
              <option value="monthly">Every month</option>
              <option value="quarterly">Every quarter</option>
            </select>
          </div>
        )}
      </fieldset>

      <fieldset className={fieldset}>
        <legend className={legend}>Dates</legend>
        <div className="flex gap-1" role="group" aria-label="Date range presets">
          {[1, 3, 5].map((years) => (
            <button
              key={years}
              type="button"
              onClick={() => set({ start: toInput(Math.max(firstDate, yearsBefore(lastDate, years))), end: toInput(lastDate) })}
              className="rounded-full bg-foreground/5 px-3 py-1 text-xs font-semibold text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
            >
              {years}Y
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="start" className={label}>
              From
            </label>
            <input id="start" type="date" min={toInput(firstDate)} max={toInput(lastDate)} value={form.start} onChange={(e) => set({ start: e.target.value })} className={`${input} mt-1`} />
          </div>
          <div>
            <label htmlFor="end" className={label}>
              To
            </label>
            <input id="end" type="date" min={toInput(firstDate)} max={toInput(lastDate)} value={form.end} onChange={(e) => set({ end: e.target.value })} className={`${input} mt-1`} />
          </div>
        </div>
      </fieldset>

      <fieldset className={fieldset}>
        <legend className={legend}>Money and costs</legend>
        <div>
          <label htmlFor="cash" className={label}>
            Starting cash ($)
          </label>
          <input id="cash" type="number" inputMode="decimal" value={form.cash} onChange={(e) => set({ cash: e.target.value })} className={`${input} mt-1`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="commission" className={label}>
              Commission ($ per trade)
            </label>
            <input id="commission" type="number" inputMode="decimal" value={form.commission} onChange={(e) => set({ commission: e.target.value })} className={`${input} mt-1`} />
          </div>
          <div>
            <label htmlFor="slippage" className={label}>
              Slippage (basis points)
            </label>
            <input
              id="slippage"
              type="number"
              inputMode="decimal"
              value={form.slippage}
              onChange={(e) => set({ slippage: e.target.value })}
              aria-describedby="slippage-hint"
              className={`${input} mt-1`}
            />
          </div>
        </div>
        <p id="slippage-hint" className="text-xs text-muted">
          Slippage: how much worse than the close each trade fills. 10 basis points = 0.1%.
        </p>
      </fieldset>

      <fieldset className={fieldset}>
        <legend className={legend}>Compare with</legend>
        <select
          aria-label="Benchmark"
          value={form.benchmark}
          onChange={(e) => set({ benchmark: e.target.value as FormState["benchmark"] })}
          className={input}
        >
          <option value="same-stocks">Buying and holding the same stocks</option>
          <option value="market">The S&amp;P 500</option>
        </select>
      </fieldset>

      <p role="alert" className="min-h-5 text-sm text-loss">
        {error}
      </p>
      <button
        type="submit"
        disabled={running}
        className="h-11 w-full rounded-full bg-accent text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
      >
        {running ? "Running…" : "Run backtest"}
      </button>
    </form>
  );
}
