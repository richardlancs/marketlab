import { connection } from "next/server";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Explain } from "@/components/ui/explain";
import { getStockProfile } from "@/lib/analytics/server";
import type { StockProfile } from "@/lib/analytics/profile";
import { formatCurrency, formatDate, formatPercent, formatShare } from "@/lib/format";
import type { TermKey } from "@/lib/glossary";

const DASH = "—";
const pct = (v: number | null) => (v === null ? DASH : formatShare(v));
const signed = (v: number | null) => (v === null ? DASH : formatPercent(v));
const num = (v: number | null, digits = 2) => (v === null ? DASH : v.toFixed(digits));
const money = (v: number | null) => (v === null ? DASH : formatCurrency(v));

/**
 * The stock's risk and technical profile (lib/analytics), calculated by the
 * analytics service from stored prices as of the latest close. Streams in
 * after the rest of the page.
 */
export async function StockAnalysis({ symbol }: { symbol: string }) {
  // Always at request time: at build time the analytics service isn't reachable, and a prerendered
  // "unavailable" would be baked into the page.
  await connection();
  const result = await getStockProfile(symbol);
  if (result.status !== "ok") {
    return (
      <Card aria-labelledby="analysis">
        <h2 id="analysis" className="text-lg font-semibold tracking-tight">
          Risk and technicals
        </h2>
        <p className="mt-2 text-sm text-muted">{result.reason}</p>
      </Card>
    );
  }
  const { profile } = result;
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <RiskCard profile={profile} symbol={symbol} />
      <TechnicalsCard profile={profile} />
    </div>
  );
}

function Stat({ label, value, term, note }: { label: string; value: string; term?: TermKey; note?: ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs text-muted">
        {label}
        {term && <Explain term={term} />}
      </dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-muted">{note}</dd>}
    </div>
  );
}

function RiskCard({ profile, symbol }: { profile: StockProfile; symbol: string }) {
  const { risk, returns } = profile;
  const dd = risk.maxDrawdown;
  const isMarket = symbol === "SPX";
  return (
    <Card aria-labelledby="risk">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="risk" className="text-lg font-semibold tracking-tight">
          Risk
        </h2>
        <span className="text-xs text-muted">As of the {formatDate(profile.asOf)} close</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Volatility (1Y)" value={pct(risk.volatility1Y)} term="volatility" note={risk.volatility3Y !== null ? `3Y: ${pct(risk.volatility3Y)}` : undefined} />
        {!isMarket && <Stat label="Beta vs S&P 500" value={num(risk.beta1Y)} term="beta" note={risk.beta3Y !== null ? `3Y: ${num(risk.beta3Y)}` : undefined} />}
        {!isMarket && <Stat label="Correlation" value={num(risk.correlation1Y)} term="correlation" note="with the S&P 500, 1Y" />}
        <Stat
          label="Max drawdown"
          value={dd.depth > 0 ? `−${formatShare(dd.depth)}` : DASH}
          term="maxDrawdown"
          note={dd.trough === null ? undefined : dd.recovered !== null ? `Recovered in ${dd.recoveryDays} sessions` : "Not yet recovered"}
        />
        <Stat label="1-day VaR (95%)" value={risk.var95 === null ? DASH : `−${formatShare(risk.var95)}`} term="valueAtRisk" note="lost more on 1 day in 20" />
        <Stat label="Expected shortfall" value={risk.expectedShortfall95 === null ? DASH : `−${formatShare(risk.expectedShortfall95)}`} note="average of those days" />
        <Stat label="Best / worst day" value={`${signed(risk.bestDay)} / ${signed(risk.worstDay)}`} note="last year" />
        <Stat label="Below 52-week high" value={risk.drawdownFromHigh === null ? DASH : risk.drawdownFromHigh < 0.0005 ? "At the high" : `−${formatShare(risk.drawdownFromHigh)}`} />
      </dl>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <figure>
          <figcaption className="text-xs text-muted">Daily returns, last year</figcaption>
          <Histogram histogram={risk.histogram} varLine={risk.var95} />
        </figure>
        <figure>
          <figcaption className="text-xs text-muted">Volatility over 3 months, rolling</figcaption>
          <Sparkline points={risk.rollingVolatility} />
        </figure>
      </div>

      <dl className="mt-6 grid grid-cols-5 gap-2 border-t border-border pt-4 text-center">
        {(["1M", "3M", "6M", "1Y", "3Y"] as const).map((period) => (
          <div key={period}>
            <dt className="text-xs text-muted">{period}</dt>
            <dd className={`mt-0.5 text-sm font-medium tabular-nums ${returns[period] === null ? "" : returns[period] >= 0 ? "text-gain" : "text-loss"}`}>{signed(returns[period])}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">Total returns, dividends included. Past moves don&apos;t predict future ones.</p>
    </Card>
  );
}

function TechnicalsCard({ profile }: { profile: StockProfile }) {
  const t = profile.technicals;
  const s = t.states;
  const chips: { label: string; tone: "gain" | "loss" | "muted" }[] = [];
  if (s.trend) chips.push({ label: s.trend === "above" ? "Above its 200-day average" : "Below its 200-day average", tone: s.trend === "above" ? "gain" : "loss" });
  if (s.cross) chips.push({ label: `${s.cross === "golden" ? "Golden" : "Death"} cross${s.lastCross ? ` since ${formatDate(s.lastCross)}` : ""}`, tone: s.cross === "golden" ? "gain" : "loss" });
  if (s.rsi) chips.push({ label: `RSI ${num(t.rsi14, 0)}: ${s.rsi}`, tone: s.rsi === "overbought" ? "loss" : s.rsi === "oversold" ? "gain" : "muted" });
  if (s.macd) chips.push({ label: `MACD ${s.macd}`, tone: s.macd === "bullish" ? "gain" : "loss" });
  const tones = { gain: "bg-gain/10 text-gain", loss: "bg-loss/10 text-loss", muted: "bg-foreground/[0.06] text-muted" };

  return (
    <Card aria-labelledby="technicals">
      <h2 id="technicals" className="text-lg font-semibold tracking-tight">
        Technicals
      </h2>
      {chips.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <li key={c.label} className={`rounded-full px-2.5 py-1 text-xs font-medium ${tones[c.tone]}`}>
              {c.label}
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="50-day average" value={money(t.sma50)} term="sma" />
        <Stat label="200-day average" value={money(t.sma200)} term="sma" />
        <Stat label="20-day EMA" value={money(t.ema20)} term="ema" />
        <Stat label="RSI (14)" value={num(t.rsi14, 1)} term="rsi" />
        <Stat label="MACD" value={num(t.macd)} term="macd" note={t.macdSignal !== null ? `Signal ${num(t.macdSignal)}` : undefined} />
        <Stat label="Bollinger Bands" term="bollingerBands" value={t.bollingerLower === null ? DASH : `${money(t.bollingerLower)} – ${money(t.bollingerUpper)}`} note={t.percentB !== null ? `%B ${num(t.percentB)}` : undefined} />
        <Stat label="ATR (14)" value={money(t.atr14)} note={t.atr14 !== null ? `${formatShare(t.atr14 / profile.price)} of the price` : undefined} />
        <Stat label="Relative volume" value={t.relativeVolume === null ? DASH : `${num(t.relativeVolume)}×`} note="today vs 20-day average" />
      </dl>
      <p className="mt-4 text-xs text-muted">Indicators describe the past, as of the latest close; they aren&apos;t predictions or advice.</p>
    </Card>
  );
}

/** Bars of how many days fell in each 0.5% band of returns, with a line at the VaR. */
function Histogram({ histogram, varLine }: { histogram: StockProfile["risk"]["histogram"]; varLine: number | null }) {
  const { counts, edges } = histogram;
  const max = Math.max(1, ...counts);
  const w = 100 / counts.length;
  // Bin i covers [edges[i-1], edges[i]); the first and last are open-ended.
  const low = edges[0] - 0.005;
  const high = edges[edges.length - 1] + 0.005;
  const x = (r: number) => ((Math.min(Math.max(r, low), high) - low) / (high - low)) * 100;
  return (
    <svg viewBox="0 0 100 40" className="mt-2 h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Histogram of daily returns over the last year">
      {counts.map((c, i) => {
        const left = edges[i - 1] ?? low;
        return <rect key={i} x={i * w + 0.3} width={w - 0.6} y={40 - (c / max) * 38} height={(c / max) * 38} className={left < 0 ? "fill-loss/60" : "fill-gain/60"} />;
      })}
      {varLine !== null && <line x1={x(-varLine)} x2={x(-varLine)} y1={0} y2={40} className="stroke-foreground/60" strokeWidth={0.4} strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

function Sparkline({ points }: { points: [number, number | null][] }) {
  const values = points.filter((p): p is [number, number] => p[1] !== null);
  if (values.length < 2) return <p className="mt-2 text-sm text-muted">Not enough history yet.</p>;
  const ys = values.map((p) => p[1]);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const path = values.map((p, i) => `${i === 0 ? "M" : "L"}${((i / (values.length - 1)) * 100).toFixed(2)},${(38 - ((p[1] - min) / span) * 36).toFixed(2)}`).join(" ");
  return (
    <div>
      <svg viewBox="0 0 100 40" className="mt-2 h-24 w-full" preserveAspectRatio="none" role="img" aria-label={`Rolling volatility, from ${formatShare(min)} to ${formatShare(max)}`}>
        <path d={path} fill="none" className="stroke-accent" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="flex justify-between text-xs text-muted tabular-nums">
        <span>Low {formatShare(min)}</span>
        <span>Now {formatShare(ys[ys.length - 1])}</span>
        <span>High {formatShare(max)}</span>
      </p>
    </div>
  );
}
