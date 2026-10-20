import type { Provenance } from "@/lib/backtest/stored";
import { formatDate } from "@/lib/format";

const ENGINE_NAMES: Record<string, string> = { typescript: "TypeScript engine", python: "Python engine" };
const SOURCE_NAMES: Record<string, string> = { mock: "MarketLab's simulated market", tiingo: "Tiingo end-of-day prices" };

/**
 * Where a backtest result came from: which engine calculated it, from what
 * data (simulated or real, and as of when), and the exact dataset, with the
 * simulation assumptions one click away. Shown under every result, live or saved.
 */
export function RunProvenance({ provenance, saved }: { provenance: Provenance; saved?: { createdAt: number } }) {
  const { engine, dataset, assumptions, computedAt } = provenance;
  return (
    <div className="mt-6 rounded-xl border border-border bg-foreground/[0.02] px-3.5 py-3 text-xs text-muted">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {dataset.simulated ? (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">Simulated prices</span>
        ) : (
          <span className="rounded-full bg-gain/10 px-2 py-0.5 font-medium text-gain">Real prices</span>
        )}
        <span>
          {saved ? `Saved result, calculated ${formatDate(computedAt)}` : "Calculated"} by the {ENGINE_NAMES[engine.name] ?? engine.name} {engine.version}
        </span>
        <span aria-hidden>·</span>
        <span>
          {SOURCE_NAMES[dataset.source] ?? dataset.source}, data as of {formatDate(dataset.asOf)}
          {dataset.firstDate !== null && dataset.lastDate !== null && ` (${formatDate(dataset.firstDate)} to ${formatDate(dataset.lastDate)}, ${dataset.observations} prices)`}
        </span>
        <span aria-hidden>·</span>
        <span>
          Dataset <code className="font-mono" title={`SHA-256 ${dataset.checksum}`}>{dataset.datasetVersion}</code>
        </span>
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer font-medium text-foreground/80 hover:text-foreground">Assumptions</summary>
        <dl className="mt-2 grid gap-1.5 sm:grid-cols-[8rem_1fr]">
          {Object.entries(assumptions).map(([key, text]) => (
            <div key={key} className="contents">
              <dt className="font-medium capitalize text-foreground/80">{key.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
