"use client";

import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { Explain } from "@/components/ui/explain";
import { deleteMLRunAction, listMLRunsAction, loadMLRunAction, reproduceMLRunAction, runMLAction, saveMLAction } from "@/lib/ml-actions";
import { ML_FEATURES, ML_LIMITS, ML_MODELS, type MLFeature, type MLModel, type MLResult, type MLSettings, type SavedMLRun } from "@/lib/ml/types";
import { formatDate, formatPercent, formatShare } from "@/lib/format";

const inputClass = "mt-1 h-10 w-full rounded-lg border border-border bg-transparent px-3 text-base outline-none focus-visible:border-accent sm:text-sm";
const labelClass = "block text-xs font-medium text-muted";
const YEAR = 365.25 * 86_400_000;

type View = { kind: "empty" } | { kind: "result"; settings: MLSettings; result: MLResult } | { kind: "saved"; run: SavedMLRun; result: MLResult; reproduction?: Awaited<ReturnType<typeof reproduceMLRunAction>> | "running" };

/**
 * The machine-learning sandbox (Backtest page, Machine learning tab): train
 * a small model on a few stocks' features to predict next week's direction,
 * walk-forward only, and see whether it beats luck and buying and holding.
 * Everything runs in the analytics service (services/analytics/analytics/ml.py).
 */
export function MLSandbox({ lastDate }: { lastDate: number }) {
  const id = useId();
  const { quotes } = useAccount();
  const stocks = Object.keys(quotes);
  const [symbols, setSymbols] = useState<string[]>(["AAPL", "MSFT", "JPM"].filter((s) => stocks.includes(s)));
  const [features, setFeatures] = useState<MLFeature[]>(["return1w", "return1m", "rsi", "gap50", "volatility"]);
  const [model, setModel] = useState<MLModel>("logistic");
  const [years, setYears] = useState(5);
  const [trainYears, setTrainYears] = useState(2);
  const [costBps, setCostBps] = useState(10);
  const [view, setView] = useState<View>({ kind: "empty" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState<SavedMLRun[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMLRunsAction().then((r) => !cancelled && setSaved(r.runs), () => !cancelled && setSaved([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const settings = (): MLSettings => ({ version: 1, symbols, features, model, start: Math.round(lastDate - years * YEAR), end: lastDate, trainYears, testMonths: 3, costBps, seed: 7 });

  function run(event: FormEvent) {
    event.preventDefault();
    if (symbols.length === 0 || features.length === 0) return setError("Choose at least one stock and one feature.");
    if (years < trainYears + 1) return setError("Choose a period at least a year longer than the training window.");
    const s = settings();
    setError(null);
    start(async () => {
      const r = await runMLAction(s);
      if (!r.ok) return setError(r.message);
      setView({ kind: "result", settings: s, result: r.result });
    });
  }

  const toggle = <T,>(list: T[], item: T, max = Infinity) => (list.includes(item) ? list.filter((x) => x !== item) : list.length < max ? [...list, item] : list);
  const chip = (on: boolean) =>
    `tap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${on ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"}`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      <div className="flex flex-col gap-4 lg:col-span-4 lg:gap-6">
        <Card aria-labelledby={`${id}-settings`}>
          <h2 id={`${id}-settings`} className="text-lg font-semibold tracking-tight">
            Train a model
          </h2>
          <p className="mt-1 text-sm text-muted">
            <Explain term="machineLearning" className="mr-1" />
            Predict whether each stock will rise over the next week, from what was known that day. Tested only on data the model never saw.
          </p>
          <form onSubmit={run} className="mt-4 space-y-4">
            <fieldset>
              <legend className={labelClass}>
                Stocks ({symbols.length} of up to {ML_LIMITS.maxSymbols})
              </legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {stocks.map((s) => (
                  <button key={s} type="button" aria-pressed={symbols.includes(s)} onClick={() => setSymbols((list) => toggle(list, s, ML_LIMITS.maxSymbols))} className={chip(symbols.includes(s))}>
                    {s}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className={labelClass}>Features: what the model sees</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(Object.keys(ML_FEATURES) as MLFeature[]).map((f) => (
                  <button key={f} type="button" aria-pressed={features.includes(f)} onClick={() => setFeatures((list) => toggle(list, f))} className={chip(features.includes(f))}>
                    {ML_FEATURES[f]}
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor={`${id}-model`} className={labelClass}>
                Model
              </label>
              <select id={`${id}-model`} value={model} onChange={(e) => setModel(e.target.value as MLModel)} className={inputClass}>
                {(Object.keys(ML_MODELS) as MLModel[]).map((m) => (
                  <option key={m} value={m}>
                    {ML_MODELS[m].name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">{ML_MODELS[model].about}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor={`${id}-years`} className={labelClass}>
                  Years
                </label>
                <select id={`${id}-years`} value={years} onChange={(e) => setYears(Number(e.target.value))} className={inputClass}>
                  {[3, 4, 5, 7, 10].map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-train`} className={labelClass}>
                  Train on
                </label>
                <select id={`${id}-train`} value={trainYears} onChange={(e) => setTrainYears(Number(e.target.value))} className={inputClass}>
                  {[1, 2, 3].map((y) => (
                    <option key={y} value={y}>
                      {y} yr
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-cost`} className={labelClass}>
                  Costs (bp)
                </label>
                <input id={`${id}-cost`} type="number" min={0} max={ML_LIMITS.maxCostBps} value={costBps} onChange={(e) => setCostBps(Number(e.target.value))} className={inputClass} />
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-loss">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="h-11 w-full rounded-full bg-accent-fill text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
            >
              {pending ? "Training and testing…" : "Train and test"}
            </button>
          </form>
        </Card>
        <SavedList
          runs={saved}
          onOpen={(r) =>
            start(async () => {
              const found = await loadMLRunAction(r.id);
              if (!found.ok) return setError(found.message);
              setView({ kind: "saved", run: found.run, result: found.result });
            })
          }
          onDelete={async (r) => {
            setSaved((list) => list?.filter((x) => x.id !== r.id) ?? null);
            await deleteMLRunAction(r.id);
          }}
        />
      </div>

      <Card aria-labelledby={`${id}-results`} aria-live="polite" aria-busy={pending} className="lg:col-span-8">
        <h2 id={`${id}-results`} className="text-lg font-semibold tracking-tight">
          Out-of-sample results
        </h2>
        {view.kind === "empty" && <p className="py-16 text-center text-sm text-muted">Choose stocks, features and a model, then train and test.</p>}
        {view.kind === "result" && (
          <>
            <SaveForm settings={view.settings} onSaved={(run) => setSaved((list) => [run, ...(list ?? [])])} />
            <MLResultView result={view.result} />
          </>
        )}
        {view.kind === "saved" && (
          <>
            <div className="mt-3 rounded-xl border border-accent/20 bg-accent/5 px-3.5 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  <span className="font-medium">{view.run.name}</span>: as saved on {formatDate(view.run.createdAt)}.
                </p>
                <button
                  type="button"
                  disabled={view.reproduction === "running"}
                  onClick={() => {
                    setView({ ...view, reproduction: "running" });
                    start(async () => setView({ ...view, reproduction: await reproduceMLRunAction(view.run.id) }));
                  }}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
                >
                  {view.reproduction === "running" ? "Reproducing…" : "Reproduce from saved prices"}
                </button>
              </div>
              {view.reproduction && view.reproduction !== "running" && (
                <p role="status" className={`mt-2 text-xs ${view.reproduction.ok && view.reproduction.comparison.matches ? "text-gain" : "text-loss"}`}>
                  {!view.reproduction.ok
                    ? view.reproduction.message
                    : view.reproduction.comparison.matches
                      ? "Trained and tested again from the saved prices: the same result ✓"
                      : `Reproduced, but the result differs: ${view.reproduction.comparison.differences.join("; ")}.`}
                </p>
              )}
            </div>
            <MLResultView result={view.result} />
          </>
        )}
      </Card>
    </div>
  );
}

function SaveForm({ settings, onSaved }: { settings: MLSettings; onSaved: (run: SavedMLRun) => void }) {
  const [name, setName] = useState(`${ML_MODELS[settings.model].name} · ${settings.symbols.join(", ")}`);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (status?.ok) return <p role="status" className="mt-3 text-sm text-gain">{status.text}</p>;
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveMLAction(name, settings);
          if (r.ok) onSaved(r.run);
          setStatus(r.ok ? { ok: true, text: "Saved, with the exact prices it used." } : { ok: false, text: r.message });
        });
      }}
    >
      <label htmlFor="ml-run-name" className="sr-only">
        Name for this run
      </label>
      <input id="ml-run-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-9 w-64 max-w-full rounded-lg border border-border bg-transparent px-3 text-base outline-none focus-visible:border-accent sm:text-sm" />
      <button type="submit" disabled={pending || !name.trim()} className="h-9 rounded-full bg-accent-fill px-4 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50">
        {pending ? "Saving…" : "Save run"}
      </button>
      {status && (
        <p role="alert" className="w-full text-sm text-loss">
          {status.text}
        </p>
      )}
    </form>
  );
}

function SavedList({ runs, onOpen, onDelete }: { runs: SavedMLRun[] | null; onOpen: (r: SavedMLRun) => void; onDelete: (r: SavedMLRun) => void }) {
  if (!runs?.length) return null;
  return (
    <Card aria-label="Saved machine-learning runs">
      <h2 className="text-lg font-semibold tracking-tight">Saved runs</h2>
      <ul className="mt-3 divide-y divide-border text-sm">
        {runs.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 py-2">
            <button type="button" onClick={() => onOpen(r)} className="tap min-w-0 text-left hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
              <span className="block truncate font-medium">{r.name}</span>
              <span className="text-xs text-muted">
                {formatShare(r.summary.accuracy)} right · {formatPercent(r.summary.totalReturn)} vs {formatPercent(r.summary.buyAndHoldReturn)} holding
              </span>
            </button>
            <button type="button" onClick={() => onDelete(r)} aria-label={`Delete ${r.name}`} className="tap shrink-0 text-xs text-muted hover:text-loss focus-visible:outline-2 focus-visible:outline-accent">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MLResultView({ result }: { result: MLResult }) {
  const a = result.accuracy;
  const beatsChance = a.low > a.majority;
  const luckBest = Math.max(...result.luck.accuracies);
  const s = result.strategy;
  const b = result.buyAndHold;
  const verdict = beatsChance
    ? s.totalReturn > b.totalReturn
      ? "The model did better than chance, and its trades beat buying and holding over this period. Check the luck-adjusted chance below before trusting it."
      : "The model did better than chance, but after trading costs its trades still trailed simply buying and holding."
    : "The model did no better than always guessing the most common answer: most of what looks like skill here is noise. That's the usual result.";
  const c = result.curve;
  const all = [...c.strategy, ...c.buyAndHold, ...c.luck];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const x = (i: number) => (i / (c.times.length - 1)) * 100;
  const y = (v: number) => 48 - ((v - lo) / (hi - lo || 1)) * 44;
  const line = (values: number[]) => `M${values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" L")}`;
  const importance = Object.entries(result.importance).sort((p, q) => (q[1] ?? 0) - (p[1] ?? 0));

  return (
    <div className="mt-4 space-y-5">
      <p className="text-sm">{verdict}</p>
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">Right about the direction</dt>
          <dd className="font-semibold tabular-nums">{formatShare(a.accuracy)}</dd>
          <dd className="text-xs text-muted">
            95% range {formatShare(a.low)}–{formatShare(a.high)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Always guessing the usual</dt>
          <dd className="font-semibold tabular-nums">{formatShare(a.majority)}</dd>
          <dd className="text-xs text-muted">{formatShare(a.upShare)} of weeks rose</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Trained on shuffled answers</dt>
          <dd className="font-semibold tabular-nums">up to {formatShare(luckBest)}</dd>
          <dd className="text-xs text-muted">pure luck, {result.luck.accuracies.length} tries</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Predictions tested</dt>
          <dd className="font-semibold tabular-nums">{a.samples.toLocaleString()}</dd>
          <dd className="text-xs text-muted">{result.folds} training windows</dd>
        </div>
      </dl>

      <div>
        <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="h-56 w-full" role="img" aria-label={`Growth of $1: the model ${formatPercent(s.totalReturn)}, buying and holding ${formatPercent(b.totalReturn)}`}>
          <path d={line(c.luck)} fill="none" className="stroke-foreground/30" strokeWidth={1.5} strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" />
          <path d={line(c.buyAndHold)} fill="none" className="stroke-foreground/60" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={line(c.strategy)} fill="none" className="stroke-accent" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
          <span>{formatDate(result.testStart)}</span>
          <span className="flex flex-wrap gap-x-3">
            <span className="text-accent">— The model</span>
            <span>— Buy and hold</span>
            <span>- - Luck (median)</span>
          </span>
          <span>{formatDate(result.testEnd)}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="py-1.5 text-left font-medium" />
              <th scope="col" className="py-1.5 text-right font-medium">
                Total return
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                A year
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Sharpe
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Max drawdown
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(
              [
                ["The model, after costs", s],
                ["Buy and hold", b],
              ] as const
            ).map(([label, m]) => (
              <tr key={label}>
                <th scope="row" className="py-2 text-left font-medium">
                  {label}
                </th>
                <td className="py-2 text-right">{formatPercent(m.totalReturn)}</td>
                <td className="py-2 text-right">{formatPercent(m.cagr)}</td>
                <td className="py-2 text-right">{m.sharpe === null ? "—" : m.sharpe.toFixed(2)}</td>
                <td className="py-2 text-right">−{formatShare(m.maxDrawdown)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          The model traded about {s.turnover.toFixed(0)}× its money a year and was invested {formatShare(s.exposure)} of the time.
          {result.check && (
            <>
              {" "}
              <Explain term="overfitting" className="mx-0.5" /> Allowing for the luck runs, the chance it truly beats buying and holding is about <span className="font-medium text-foreground">{Math.round(result.check.probability * 100)}%</span>.
            </>
          )}
        </p>
      </div>

      {importance.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">What the last model leaned on</h3>
          <dl className="mt-2 space-y-1.5">
            {importance.map(([f, v]) => (
              <div key={f} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3 text-sm">
                <dt className="truncate text-muted">{ML_FEATURES[f as MLFeature]}</dt>
                <dd className="h-2 rounded-full bg-foreground/[0.06]" aria-hidden>
                  <span className="block h-2 rounded-full bg-accent" style={{ width: `${Math.round((v ?? 0) * 100)}%` }} />
                </dd>
                <dd className="text-right tabular-nums">{formatShare(v ?? 0)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted">Leaning on a feature isn&apos;t the same as it working: a model can lean hard on noise.</p>
        </div>
      )}
      <p className="text-xs text-muted">
        {result.provenance.dataset.simulated ? "Simulated prices. " : ""}Dataset {result.provenance.dataset.datasetVersion}, sandbox version {result.provenance.method.version}, scikit-learn {result.provenance.method.scikitLearn}. Not investment advice.
      </p>
    </div>
  );
}
