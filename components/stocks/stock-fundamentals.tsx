import { connection } from "next/server";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Explain } from "@/components/ui/explain";
import { getFundamentals, ratiosAt } from "@/lib/fundamentals";
import { formatCompactCurrency, formatCurrency, formatPercent, formatShare } from "@/lib/format";
import { RATIO_KEYS, type FiscalYear, type Ratios } from "@/lib/market/fundamentals";
import { marketMode } from "@/lib/market/mode";
import type { TermKey } from "@/lib/glossary";

const DASH = "—";
const money = (v: number | null) => (v === null ? DASH : formatCompactCurrency(v));
const share = (v: number | null) => (v === null ? DASH : formatShare(v));
/** "Jun 27, 2026" from "2026-06-27", without a time zone shifting the day. */
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * What the company reported to the SEC: revenue, profits, margins and cash
 * flow, with valuation ratios at today's price. Streams in after the rest of
 * the page; hidden when the company has no numbers to show (not an SEC filer,
 * or not reporting in dollars).
 */
export async function StockFundamentals({ symbol, price, marketCap }: { symbol: string; price: number; marketCap: number | null }) {
  // Read at request time: stored numbers change when the daily job refreshes them.
  await connection();
  const facts = await getFundamentals(symbol);
  if (!facts || facts.years.length === 0) return null;
  // The ratios at today's price, from the analytics service; without it, the reported numbers still show.
  const worked = await ratiosAt(facts, price, marketCap);
  const r: Ratios = worked?.ratios ?? Object.fromEntries(RATIO_KEYS.map((k) => [k, null])) as unknown as Ratios;
  const last = facts.years.at(-1)!;
  const t = facts.trailing;
  const quarterly = t !== null && t.end !== last.end;
  const simulated = marketMode() !== "tiingo";

  return (
    <Card aria-labelledby="fundamentals">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="fundamentals" className="text-lg font-semibold tracking-tight">
          Company numbers
        </h2>
        <span className="text-xs text-muted">From SEC filings, through {day(t?.end ?? last.end)}</span>
      </div>
      {worked?.current === false && <p className="mt-2 text-sm text-muted">These are the latest figures it reported in US dollars, which are now over a year old.</p>}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Revenue" value={money(t?.revenue ?? null)} note={quarterly ? "last 4 quarters" : "last fiscal year"} term="revenue" />
        <Stat label="Revenue growth" value={r.revenueGrowth === null ? DASH : formatPercent(r.revenueGrowth)} note="last fiscal year" tone={r.revenueGrowth} />
        <Stat label="Net income" value={money(t?.netIncome ?? null)} note={r.netMargin === null ? undefined : `${formatShare(r.netMargin)} of revenue`} term="margins" />
        <Stat label="Earnings per share" value={t?.eps == null ? DASH : formatCurrency(t.eps)} note={r.epsGrowth === null ? "diluted" : `diluted; ${formatPercent(r.epsGrowth)} last year`} />
        <Stat label="Gross margin" value={share(r.grossMargin)} term="margins" />
        <Stat label="Operating margin" value={share(r.operatingMargin)} term="margins" />
        <Stat label="Return on equity" value={share(r.returnOnEquity)} note={r.returnOnEquity === null && last.equity !== null && last.equity <= 0 ? "equity below zero" : "last fiscal year"} term="returnOnEquity" />
        <Stat label="Free cash flow" value={money(last.freeCashFlow)} note={r.freeCashFlowYield === null ? "last fiscal year" : `${formatShare(r.freeCashFlowYield)} of market value`} term="freeCashFlow" />
      </dl>

      <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-4">
        <Stat label="P/E, reported earnings" value={r.peRatio === null ? (t?.netIncome != null && t.netIncome <= 0 ? "Loss" : DASH) : r.peRatio.toFixed(1)} term="peRatio" />
        <Stat label="Price to sales" value={r.priceToSales === null ? DASH : r.priceToSales.toFixed(1)} />
        <Stat label="Earnings yield" value={r.peRatio === null ? DASH : formatShare(1 / r.peRatio)} note="earnings ÷ market value" />
      </dl>

      <YearsChart years={facts.years} />

      <p className="mt-4 text-xs text-muted">
        As reported by {facts.name || "the company"}
        {quarterly ? "; margins, earnings and P/E cover the last four quarters" : ""}.{" "}
        {simulated ? "Prices on this site are simulated, so the valuation ratios use a simulated price and are illustrative." : "Valuation ratios use today's price."} Not investment advice.
      </p>
    </Card>
  );
}

function Stat({ label, value, term, note, tone }: { label: string; value: string; term?: TermKey; note?: ReactNode; tone?: number | null }) {
  const color = tone === undefined || tone === null ? "" : tone >= 0 ? "text-gain" : "text-loss";
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs text-muted">
        {label}
        {term && <Explain term={term} />}
      </dt>
      <dd className={`mt-0.5 text-sm font-medium tabular-nums ${color}`}>{value}</dd>
      {note && <dd className="text-xs text-muted">{note}</dd>}
    </div>
  );
}

/** Revenue and net income for each fiscal year, as paired bars, with the same numbers in a table for screen readers. */
function YearsChart({ years }: { years: FiscalYear[] }) {
  const shown = years.filter((y) => y.revenue !== null || y.netIncome !== null);
  if (shown.length < 2) return null;
  const values = shown.flatMap((y) => [y.revenue ?? 0, y.netIncome ?? 0]);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const zero = (max / span) * 36 + 2;
  const height = (v: number | null) => ((v ?? 0) / span) * 36;
  const slot = 100 / shown.length;
  const bar = slot * 0.3;
  const year = (y: FiscalYear) => `FY${y.end.slice(0, 4)}`;

  return (
    <figure className="mt-6">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>By fiscal year</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-accent/70" /> Revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-gain/70" /> Net income
        </span>
      </figcaption>
      <svg viewBox="0 0 100 40" className="mt-2 h-28 w-full" preserveAspectRatio="none" aria-hidden="true">
        {shown.map((y, i) => {
          const x = i * slot + slot / 2;
          const rev = height(y.revenue);
          const net = height(y.netIncome);
          return (
            <g key={y.end}>
              <title>{`${year(y)}: revenue ${money(y.revenue)}, net income ${money(y.netIncome)}`}</title>
              <rect x={x - bar - 0.4} width={bar} y={rev >= 0 ? zero - rev : zero} height={Math.abs(rev)} className="fill-accent/70" />
              <rect x={x + 0.4} width={bar} y={net >= 0 ? zero - net : zero} height={Math.abs(net)} className={(y.netIncome ?? 0) >= 0 ? "fill-gain/70" : "fill-loss/70"} />
            </g>
          );
        })}
        <line x1={0} x2={100} y1={zero} y2={zero} className="stroke-border" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex text-center text-xs text-muted tabular-nums" aria-hidden>
        {shown.map((y) => (
          <span key={y.end} className="flex-1">
            {year(y)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Revenue and net income by fiscal year</caption>
        <thead>
          <tr>
            <th scope="col">Fiscal year ended</th>
            <th scope="col">Revenue</th>
            <th scope="col">Net income</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((y) => (
            <tr key={y.end}>
              <th scope="row">{day(y.end)}</th>
              <td>{money(y.revenue)}</td>
              <td>{money(y.netIncome)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

