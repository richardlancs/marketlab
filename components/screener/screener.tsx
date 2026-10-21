"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { StockLogo } from "@/components/stocks/stock-logo";
import { shareFragment } from "@/lib/backtest/share";
import { applyScreen, backtestOfScreen, EMPTY_SCREEN, METRICS, PRESETS, type MetricKey, type Screen, type ScreenerRow, type ScreenerView } from "@/lib/analytics/screener";
import { formatCompactCurrency, formatCurrency, formatPercent, formatShare } from "@/lib/format";

const DASH = "—";

function show(key: MetricKey, value: number | null) {
  if (value === null) return DASH;
  switch (METRICS[key].format) {
    case "money":
      return formatCurrency(value);
    case "signed":
      return formatPercent(value);
    case "percent":
      return formatShare(value);
    case "compact":
      return formatCompactCurrency(value);
    default:
      return value.toFixed(key === "rsi" ? 0 : key === "peRatio" || key === "priceToSales" ? 1 : 2);
  }
}

/** Range filters offered in the panel: percentages are typed as percents, market cap in billions. */
const RANGE_FILTERS: { key: MetricKey; unit: "%" | "B" | "" }[] = [
  { key: "momentum", unit: "%" },
  { key: "volatility", unit: "%" },
  { key: "beta", unit: "" },
  { key: "rsi", unit: "" },
  { key: "fromHigh", unit: "%" },
  { key: "dividendYield", unit: "%" },
  { key: "peRatio", unit: "" },
  { key: "marketCap", unit: "B" },
  { key: "priceToSales", unit: "" },
  { key: "revenueGrowth", unit: "%" },
  { key: "netMargin", unit: "%" },
  { key: "returnOnEquity", unit: "%" },
  { key: "freeCashFlowYield", unit: "%" },
];
const SCALE = { "%": 100, B: 1e-9, "": 1 } as const;

type Column = { key: MetricKey; className?: string };

const MARKET_COLUMNS: Column[] = [
  { key: "price" },
  { key: "r1M", className: "hidden md:table-cell" },
  { key: "r1Y" },
  { key: "momentum", className: "hidden lg:table-cell" },
  { key: "volatility", className: "hidden sm:table-cell" },
  { key: "beta", className: "hidden sm:table-cell" },
  { key: "rsi", className: "hidden md:table-cell" },
  { key: "fromHigh", className: "hidden lg:table-cell" },
  { key: "dividendYield", className: "hidden lg:table-cell" },
  { key: "marketCap", className: "hidden md:table-cell" },
];

/** The companies' reported numbers (SEC filings), valued at today's price. */
const COMPANY_COLUMNS: Column[] = [
  { key: "price", className: "hidden sm:table-cell" },
  { key: "peRatio" },
  { key: "priceToSales", className: "hidden md:table-cell" },
  { key: "revenueGrowth" },
  { key: "netMargin", className: "hidden sm:table-cell" },
  { key: "returnOnEquity", className: "hidden md:table-cell" },
  { key: "freeCashFlowYield", className: "hidden lg:table-cell" },
  { key: "dividendYield", className: "hidden lg:table-cell" },
  { key: "marketCap", className: "hidden lg:table-cell" },
];

const VIEWS: { id: ScreenerView; label: string }[] = [
  { id: "market", label: "Price and risk" },
  { id: "company", label: "Company numbers" },
];

export function Screener({ rows, asOf, initialPreset }: { rows: ScreenerRow[]; asOf: number; initialPreset?: string }) {
  const start = PRESETS.find((p) => p.id === initialPreset);
  const [preset, setPreset] = useState<string | null>(start?.id ?? null);
  const [screen, setScreen] = useState<Screen>(start?.screen ?? EMPTY_SCREEN);
  const [view, setView] = useState<ScreenerView>(start?.view ?? "market");
  const columns = view === "company" ? COMPANY_COLUMNS : MARKET_COLUMNS;
  const results = useMemo(() => applyScreen(rows, screen), [rows, screen]);
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector))].sort(), [rows]);
  const backtest = backtestOfScreen(results, asOf);

  const update = (change: Partial<Screen>) => {
    setPreset(null);
    setScreen((s) => ({ ...s, ...change }));
  };
  const setRange = (key: MetricKey, bound: "min" | "max", text: string, unit: keyof typeof SCALE) => {
    const value = text.trim() === "" ? undefined : Number(text) / SCALE[unit];
    if (value !== undefined && !Number.isFinite(value)) return;
    const range = { ...screen.ranges[key], [bound]: value };
    const ranges = { ...screen.ranges, [key]: range };
    if (range.min === undefined && range.max === undefined) delete ranges[key];
    update({ ranges });
  };
  const sortBy = (key: MetricKey | "symbol") => setScreen((s) => ({ ...s, sort: key, descending: s.sort === key ? !s.descending : key !== "symbol" }));
  const active = screen.sectors.length + Object.keys(screen.ranges).length + (screen.trend ? 1 : 0);
  // On phones the results are rows with one number: the one sorted by, or a sensible default.
  const shownKey: MetricKey = screen.sort !== "symbol" ? screen.sort : view === "company" ? "peRatio" : "r1Y";
  const sheet = useRef<HTMLDialogElement>(null);

  const filterControls = (
    <>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Sectors">
      {sectors.map((sector) => {
        const on = screen.sectors.includes(sector);
        return (
          <button
            key={sector}
            type="button"
            aria-pressed={on}
            onClick={() => update({ sectors: on ? screen.sectors.filter((s) => s !== sector) : [...screen.sectors, sector] })}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${on ? "bg-accent/10 text-accent ring-accent/40" : "text-muted ring-border hover:text-foreground"}`}
          >
            {sector}
          </button>
        );
      })}
    </div>
    <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted">Trend</span>
        <select
          value={screen.trend ?? ""}
          onChange={(e) => update({ trend: e.target.value === "" ? null : (e.target.value as "above" | "below") })}
          className="rounded-lg border border-border bg-surface-raised px-2 py-1 text-sm"
        >
          <option value="">Any</option>
          <option value="above">Above 200-day</option>
          <option value="below">Below 200-day</option>
        </select>
      </label>
      {RANGE_FILTERS.map(({ key, unit }) => {
        const range = screen.ranges[key];
        const shown = (v: number | undefined) => (v === undefined ? "" : String(Math.round(v * SCALE[unit] * 100) / 100));
        return (
          <fieldset key={key} className="flex items-center justify-between gap-2 text-sm">
            <legend className="sr-only">{METRICS[key].label}</legend>
            <span className="text-muted">
              {METRICS[key].label}
              {unit && ` (${unit === "B" ? "$B" : unit})`}
            </span>
            <span className="flex items-center gap-1">
              <input aria-label={`${METRICS[key].label} at least`} inputMode="decimal" placeholder="min" value={shown(range?.min)} onChange={(e) => setRange(key, "min", e.target.value, unit)} className="w-16 rounded-lg border border-border bg-surface-raised px-2 py-1 text-right tabular-nums" />
              <span className="text-muted">–</span>
              <input aria-label={`${METRICS[key].label} at most`} inputMode="decimal" placeholder="max" value={shown(range?.max)} onChange={(e) => setRange(key, "max", e.target.value, unit)} className="w-16 rounded-lg border border-border bg-surface-raised px-2 py-1 text-right tabular-nums" />
            </span>
          </fieldset>
        );
      })}
    </div>
    </>
  );

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Preset screens">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.description}
            aria-pressed={preset === p.id}
            onClick={() => {
              setPreset(preset === p.id ? null : p.id);
              setScreen(preset === p.id ? EMPTY_SCREEN : p.screen);
              if (preset !== p.id) setView(p.view ?? "market");
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${preset === p.id ? "bg-accent-fill text-white" : "bg-foreground/[0.06] hover:bg-foreground/[0.1]"}`}
          >
            {p.name}
          </button>
        ))}
        {(preset || screen !== EMPTY_SCREEN) && (
          <button type="button" onClick={() => (setPreset(null), setScreen(EMPTY_SCREEN))} className="rounded-full px-3 py-1.5 text-sm text-accent hover:underline">
            Clear all
          </button>
        )}
      </div>
      {preset && <p className="-mt-2 text-sm text-muted">{PRESETS.find((p) => p.id === preset)?.description}</p>}

      <details className="hidden rounded-2xl border border-border bg-surface p-4 sm:p-5 md:block" open>
        <summary className="cursor-pointer text-sm font-semibold">Filters</summary>
        {filterControls}
      </details>

      {/* Phones: the filters open in a sheet from the bottom, so the results come first. */}
      <button
        type="button"
        onClick={() => sheet.current?.showModal()}
        className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-surface text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent md:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden>
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        Filters{active > 0 && ` (${active})`}
      </button>
      <dialog
        ref={sheet}
        aria-labelledby="filters-title"
        // A click on the backdrop (the dialog element itself, outside its content) closes it.
        onClick={(e) => e.target === e.currentTarget && sheet.current?.close()}
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none animate-slide-up flex-col rounded-t-3xl border border-b-0 border-border bg-surface text-foreground shadow-2xl backdrop:bg-black/40 open:flex md:hidden"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 id="filters-title" className="font-semibold">
            Filters
          </h2>
          {active > 0 && (
            <button type="button" onClick={() => update({ sectors: [], ranges: {}, trend: null })} className="min-h-11 px-2 text-sm text-accent">
              Clear filters
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-4 pb-4">{filterControls}</div>
        <div className="border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => sheet.current?.close()} className="min-h-12 w-full rounded-full bg-accent-fill text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Show {results.length} {results.length === 1 ? "stock" : "stocks"}
          </button>
        </div>
      </dialog>

      <section aria-label="Results" className="rounded-2xl border border-border bg-surface px-2 py-2 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-2">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted" role="status">
              {results.length} of {rows.length} stocks
            </p>
            <div role="group" aria-label="Columns" className="flex rounded-full bg-foreground/[0.06] p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={view === v.id}
                  onClick={() => setView(v.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${view === v.id ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {preset === "momentum" && (
              <Link href="/screener/history" className="tap text-sm font-medium text-accent hover:underline" title="Apply this screen at the start of every month, using only the prices known then">
                Test this screen over time →
              </Link>
            )}
            {backtest && (
              <Link
                href={`/backtest#${shareFragment(backtest)}`}
                className="tap text-sm font-medium text-accent hover:underline"
                title="Buy and hold today's top five, equally weighted, over the last 3 years. They were picked with today's numbers, so this looks back with hindsight."
              >
                Backtest today&apos;s top {Math.min(5, results.length)} →
              </Link>
            )}
          </div>
        </div>
        <div className="md:hidden">
          <div className="flex items-center gap-2 px-2 pb-2">
            <label htmlFor="screener-sort" className="text-sm text-muted">
              Sort by
            </label>
            <select id="screener-sort" value={screen.sort} onChange={(e) => sortBy(e.target.value as MetricKey | "symbol")} className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-2">
              <option value="symbol">Symbol</option>
              {columns.map(({ key }) => (
                <option key={key} value={key}>
                  {METRICS[key].label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setScreen((s) => ({ ...s, descending: !s.descending }))}
              aria-label={screen.descending ? "Sorted high to low; sort low to high" : "Sorted low to high; sort high to low"}
              className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span aria-hidden>{screen.descending ? "↓" : "↑"}</span>
            </button>
          </div>
          <ul className="divide-y divide-border">
            {results.map((r) => {
              const value = r[shownKey];
              const tone = METRICS[shownKey].format === "signed" && value !== null ? (value >= 0 ? "text-gain" : "text-loss") : "";
              return (
                <li key={r.symbol}>
                  <Link href={`/stocks/${r.symbol}`} className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-accent">
                    <StockLogo symbol={r.symbol} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{r.symbol}</span>
                      <span className="block truncate text-xs text-muted">{r.name}</span>
                    </span>
                    <span className="text-right">
                      <span className={`block font-medium tabular-nums ${tone}`}>{show(shownKey, value)}</span>
                      <span className="block text-xs text-muted">{METRICS[shownKey].label}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {results.length === 0 && <p className="px-2 py-8 text-center text-sm text-muted">No stocks match. Loosen a filter.</p>}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th scope="col" className="py-2 pr-3 text-left font-medium">
                  <button type="button" onClick={() => sortBy("symbol")} className="tap hover:text-foreground">
                    Stock {screen.sort === "symbol" && (screen.descending ? "▼" : "▲")}
                  </button>
                </th>
                {columns.map(({ key, className = "" }) => (
                  <th key={key} scope="col" aria-sort={screen.sort === key ? (screen.descending ? "descending" : "ascending") : undefined} className={`py-2 pl-3 text-right font-medium whitespace-nowrap ${className}`}>
                    <button type="button" onClick={() => sortBy(key)} className={`tap ${screen.sort === key ? "text-foreground" : "hover:text-foreground"}`}>
                      {screen.sort === key && (screen.descending ? "▼ " : "▲ ")}
                      {METRICS[key].label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.map((r) => (
                <tr key={r.symbol} className="relative transition-colors hover:bg-foreground/[0.04]">
                  <td className="max-w-0 py-2.5 pr-3 sm:max-w-none">
                    <div className="flex items-center gap-3">
                      <StockLogo symbol={r.symbol} size={30} hideOnPhone />
                      <div className="min-w-0">
                        <Link href={`/stocks/${r.symbol}`} className="block font-semibold outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:outline-accent">
                          {r.symbol}
                        </Link>
                        <span className="block truncate text-xs text-muted">
                          {r.name} · {r.sector}
                        </span>
                      </div>
                    </div>
                  </td>
                  {columns.map(({ key, className = "" }) => {
                    const value = r[key];
                    const tone = METRICS[key].format === "signed" && value !== null ? (value >= 0 ? "text-gain" : "text-loss") : "";
                    return (
                      <td key={key} className={`py-2.5 pl-3 text-right tabular-nums whitespace-nowrap ${tone} ${className}`}>
                        {show(key, value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {results.length === 0 && <p className="px-2 py-8 text-center text-sm text-muted">No stocks match. Loosen a filter.</p>}
        </div>
      </section>
      <p className="text-xs text-muted">
        Momentum 12-1 is the return from 12 months ago to 1 month ago. Volatility, beta and RSI use the last year, as of the latest close. Company numbers come from SEC filings: margins and P/E
        over the last four reported quarters, revenue growth, return on equity and free cash flow over the last fiscal year, valued at today&apos;s price. A screen picks stocks by how they did up
        to today, so backtesting today&apos;s picks over the past flatters them (look-ahead). Not investment advice.
      </p>
    </div>
  );
}
