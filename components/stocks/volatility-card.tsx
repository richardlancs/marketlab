import { Card } from "@/components/ui/card";
import { Explain } from "@/components/ui/explain";
import type { VolatilityConeRow, VolatilityForecast, VolatilityRange } from "@/lib/analytics/profile";
import { formatCurrency, formatShare } from "@/lib/format";

const HORIZON_NAMES = { day: "Next day", week: "Next week", month: "Next month" } as const;
const WINDOW_NAMES: Record<number, string> = { 5: "1 week", 21: "1 month", 63: "3 months", 126: "6 months", 252: "1 year" };

/**
 * "How much it might move": the GARCH volatility forecast stored with the
 * stock's profile (services/analytics/analytics/volatility.py), as price
 * ranges for the next day, week and month, the volatility cone, and how the
 * forecast held up over the last year.
 */
export function VolatilityCard({ forecast, symbol, simulated }: { forecast: VolatilityForecast; symbol: string; simulated: boolean }) {
  const { model, ranges, check } = forecast;
  return (
    <Card aria-labelledby="volatility-forecast">
      <h2 id="volatility-forecast" className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
        How much it might move <Explain term="volatilityClustering" />
      </h2>
      <p className="mt-1 text-sm text-muted">
        {model
          ? "A GARCH model: calm and stormy spells each tend to last, so recent swings say a lot about the next few."
          : "Not enough history, or too little clustering, for a GARCH model; these ranges use the last month's volatility."}
      </p>

      {model && <ModelSentence model={model} />}
      {ranges && forecast.price !== null && <Ranges ranges={ranges} price={forecast.price} symbol={symbol} />}
      {forecast.cone.length > 0 && <Cone rows={forecast.cone} />}

      {check && check.inside90 !== null && (
        <p className="mt-5 border-t border-border pt-4 text-sm">
          Checked on the last {check.sessions} sessions with a model fitted only on the days before them: the next day&apos;s move stayed inside the 90% range on{" "}
          <span className="font-medium tabular-nums">{formatShare(check.inside90)}</span> of days
          {check.naiveInside90 !== null && <> (a plain &ldquo;last month&apos;s volatility&rdquo; forecast: {formatShare(check.naiveInside90)})</>}.{" "}
          {check.qlike !== null && check.naiveQlike !== null && (check.qlike < check.naiveQlike ? "Day by day, it sized the moves better than the plain forecast." : "Day by day, it sized the moves no better than the plain forecast.")}
        </p>
      )}
      <p className="mt-3 text-xs text-muted">
        Ranges assume moves are roughly normal, which understates rare crashes; they describe size, not direction.{" "}
        {simulated && "Prices here are simulated with this kind of model, so it fits them unusually well. "}Not a prediction or advice.
      </p>
    </Card>
  );
}

function ModelSentence({ model }: { model: NonNullable<VolatilityForecast["model"]> }) {
  if (model.now === null || model.longRun === null) return null;
  const ratio = model.now / model.longRun;
  const mood = ratio < 0.85 ? "calmer than usual" : ratio > 1.15 ? "stormier than usual" : "about usual";
  return (
    <p className="mt-3 text-sm">
      Volatility now: <span className="font-medium tabular-nums">{formatShare(model.now)}</span> a year, against a long-run{" "}
      <span className="font-medium tabular-nums">{formatShare(model.longRun)}</span>: {mood}.
      {model.halfLife !== null && (
        <>
          {" "}
          A shock fades by half in about <span className="font-medium tabular-nums">{Math.round(model.halfLife)}</span> sessions.
        </>
      )}
    </p>
  );
}

/** One row per horizon on a shared price axis: the 90% range light, the middle two-thirds darker, today's price as a line. */
function Ranges({ ranges, price, symbol }: { ranges: Record<"day" | "week" | "month", VolatilityRange>; price: number; symbol: string }) {
  const rows = (["day", "week", "month"] as const).map((k) => [k, ranges[k]] as const);
  const lows = rows.map(([, r]) => r.low90 ?? price);
  const highs = rows.map(([, r]) => r.high90 ?? price);
  const lo = Math.min(...lows) * 0.99;
  const hi = Math.max(...highs) * 1.01;
  const at = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  return (
    <figure className="mt-5">
      <figcaption className="sr-only">Likely price ranges for {symbol}</figcaption>
      <div className="space-y-4">
        {rows.map(([key, r]) => (
          <div key={key}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
              <span className="font-medium">{HORIZON_NAMES[key]}</span>
              <span className="text-muted tabular-nums">
                {r.sd !== null && `±${formatShare(r.sd)} typical · `}9 in 10: {r.low90 !== null ? formatCurrency(r.low90) : "—"} to {r.high90 !== null ? formatCurrency(r.high90) : "—"}
              </span>
            </div>
            <div
              className="relative mt-1.5 h-3 rounded-full bg-foreground/[0.06]"
              role="img"
              aria-label={`${HORIZON_NAMES[key]}: about 2 in 3 between ${formatCurrency(r.low68 ?? price)} and ${formatCurrency(r.high68 ?? price)}, 9 in 10 between ${formatCurrency(r.low90 ?? price)} and ${formatCurrency(r.high90 ?? price)}`}
            >
              {r.low90 !== null && r.high90 !== null && <div className="absolute inset-y-0 rounded-full bg-accent/25" style={{ left: at(r.low90), width: `calc(${at(r.high90)} - ${at(r.low90)})` }} />}
              {r.low68 !== null && r.high68 !== null && <div className="absolute inset-y-0 rounded-full bg-accent/55" style={{ left: at(r.low68), width: `calc(${at(r.high68)} - ${at(r.low68)})` }} />}
              <div className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-surface" style={{ left: at(price) }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-full bg-accent/55" /> About 2 in 3
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-full bg-accent/25" /> 9 in 10
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 rounded-full bg-foreground" /> Last close {formatCurrency(price)}
        </span>
      </p>
    </figure>
  );
}

/** For each window, the 10th–90th percentile of past realised volatility as a band, its median as a tick, and today's as a dot. */
function Cone({ rows }: { rows: VolatilityConeRow[] }) {
  const values = rows.flatMap((r) => [r.low, r.high, r.now]).filter((v): v is number => v !== null);
  const hi = Math.max(...values, 0.01) * 1.1;
  const at = (v: number) => `${(v / hi) * 100}%`;
  return (
    <figure className="mt-6">
      <figcaption className="text-sm font-medium">Today against its own history</figcaption>
      <p className="text-xs text-muted">Volatility over each window, as a yearly rate; the band holds 80% of past readings.</p>
      <dl className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <div key={r.sessions} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 text-xs">
            <dt className="text-muted">{WINDOW_NAMES[r.sessions] ?? `${r.sessions} sessions`}</dt>
            <dd className="relative h-2 rounded-full bg-foreground/[0.06]" title={r.low !== null && r.high !== null ? `Usually ${formatShare(r.low)} to ${formatShare(r.high)}` : undefined}>
              {r.low !== null && r.high !== null && <div className="absolute inset-y-0 rounded-full bg-foreground/20" style={{ left: at(r.low), width: `calc(${at(r.high)} - ${at(r.low)})` }} />}
              {r.median !== null && <div className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground/50" style={{ left: at(r.median) }} />}
              {r.now !== null && <div className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface" style={{ left: at(r.now) }} />}
            </dd>
            <dd className="text-right font-medium tabular-nums">{r.now !== null ? formatShare(r.now) : "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-accent" /> Now
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 rounded-full bg-foreground/50" /> Typical
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-foreground/20" /> Usual range
        </span>
      </p>
    </figure>
  );
}
