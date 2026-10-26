import { describeExposures, FACTOR_NAMES, FACTORS, type Factor, type FactorExposures } from "@/lib/analytics/factors";
import { Explain } from "@/components/ui/explain";
import { formatDate, formatPercent } from "@/lib/format";

/** The bars' scale: ±SCALE fills half the track. Exposures past it are drawn at the edge, with the number still exact. */
const SCALE = 1.5;

/**
 * Factor exposures as a diverging bar per factor around zero, the clear
 * ones (|t| ≥ 2) solid and the rest faint, with a summary in plain words.
 * Exposures aren't good or bad, so the bars use the accent colour, never
 * gain and loss colours. Used by the stock page and the portfolio page.
 */
export function FactorExposuresView({ exposures, subject }: { exposures: FactorExposures; subject: string }) {
  return (
    <div>
      <p className="text-sm">
        <Explain term="factors" className="mr-1" />
        {describeExposures(exposures, subject)}
      </p>
      <dl className="mt-4 space-y-2.5">
        {FACTORS.map((f) => (
          <FactorRow key={f} factor={f} beta={exposures.betas[f]} t={exposures.tStats[f]} />
        ))}
      </dl>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Explained by the factors (R²)</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{exposures.r2 === null ? "—" : `${Math.round(exposures.r2 * 100)}%`}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-xs text-muted">
            Alpha (a year) <Explain term="alpha" />
          </dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {exposures.alpha === null ? "—" : formatPercent(exposures.alpha)}
            {exposures.alphaT !== null && Math.abs(exposures.alphaT) < 2 && <span className="ml-1.5 text-xs font-normal text-muted">likely chance</span>}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-xs text-muted">Measured over</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {exposures.sessions} sessions to {formatDate(exposures.asOf)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">Faint bars could be chance (less than two standard errors from zero). Factors come from MarketLab&apos;s own stocks; past exposures can change.</p>
    </div>
  );
}

function FactorRow({ factor, beta, t }: { factor: Factor; beta: number | null; t: number | null }) {
  const clear = t !== null && Math.abs(t) >= 2;
  const share = beta === null ? 0 : Math.min(Math.abs(beta) / SCALE, 1) * 50;
  return (
    <div className="grid grid-cols-[7.5rem_1fr_3.25rem] items-center gap-3 text-sm">
      <dt className="truncate text-muted">{FACTOR_NAMES[factor]}</dt>
      <dd className="relative h-2.5 rounded-full bg-foreground/[0.06]" aria-hidden>
        <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
        {beta !== null && (
          <span
            className={`absolute inset-y-0 rounded-full ${clear ? "bg-accent" : "bg-accent/30"}`}
            style={beta >= 0 ? { left: "50%", width: `${share}%` } : { right: "50%", width: `${share}%` }}
          />
        )}
      </dd>
      <dd className="text-right font-medium tabular-nums">
        {beta === null ? "—" : beta.toFixed(2)}
        <span className="sr-only">{clear ? ", clear" : ", could be chance"}</span>
      </dd>
    </div>
  );
}
