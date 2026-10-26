"use client";

import { useEffect, useRef, useState } from "react";
import { revealOnPhone } from "@/components/ui/reveal";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import type { ResultExtras } from "@/lib/backtest/extras";
import { Tabs } from "@/components/ui/tabs";
import { compareRunsAction, loadSavedRunAction, reproduceSavedRunAction, runBacktestAction, type ReproduceResult } from "@/lib/backtest-actions";
import { STRATEGY_NAMES, type BacktestConfig, type BacktestOutcome, type SavedRun } from "@/lib/backtest/config";
import { isSymbolFormat } from "@/lib/market/symbols";
import { BacktestForm, defaultForm, formFromConfig, toConfig, type FormState } from "./backtest-form";
import { BacktestResults, holdingsLabel } from "./backtest-results";
import { RunComparison } from "./run-comparison";
import { SavedRuns } from "./saved-runs";
import { SweepPanel, SweepResults, type Measure } from "./sweep-panel";
import type { SweepResult } from "@/lib/backtest/sweep";
import { WalkForward } from "./walk-forward";
import { useSavedRuns } from "./use-saved-runs";
import { useSweep } from "./use-sweep";
import { parseShareFragment, shareFragment } from "@/lib/backtest/share";
import type { StoredResult } from "@/lib/backtest/stored";
import type { Axis } from "@/lib/backtest/sweep";
import { formatDate } from "@/lib/format";
import { RunProvenance } from "./run-provenance";

type View =
  | { kind: "empty" }
  | { kind: "result"; config: BacktestConfig; outcome: BacktestOutcome; provenance: StoredResult["provenance"]; extras?: ResultExtras }
  /** A saved run's stored result, exactly as it was calculated (not re-run). */
  | { kind: "saved"; run: SavedRun; result: StoredResult; reproduction: ReproduceResult | "running" | null }
  /** A run saved before results were stored: only its settings exist. */
  | { kind: "legacy"; run: SavedRun }
  | { kind: "compare"; runs: SavedRun[]; outcomes: BacktestOutcome[] }
  | { kind: "sweep"; measure: Measure };

/**
 * The backtest page's interactive part: the settings form, saved runs, and
 * the results of the last run or comparison. Backtests run on the server
 * (lib/backtest/server.ts), next to the prices: this sends the settings and
 * shows the results. The stocks to pick from are the catalog's, from the
 * account provider; with real data any other ticker can be typed too.
 */
export function BacktestWorkbench({ firstDate, lastDate }: { firstDate: number; lastDate: number }) {
  const { listings, openTickers } = useAccount();
  const isKnown = (symbol: string) => (openTickers ? isSymbolFormat(symbol) : listings.some((l) => l.symbol === symbol));
  const [note, setNote] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => defaultForm(lastDate));
  const [view, setView] = useState<View>({ kind: "empty" });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  // On phones the results are below the settings: bring each new one into view.
  useEffect(() => {
    if (view.kind !== "empty") revealOnPhone(resultsHeading.current);
  }, [view]);
  const saved = useSavedRuns();
  const sweep = useSweep();
  // The form as a config, for the sweep panel (null while the form has a mistake).
  const parsedForm = toConfig(form, isKnown);
  const sweepBase = "config" in parsedForm ? parsedForm.config : null;

  /** Runs `work` with the loading state and error handling every action shares. */
  async function busy(work: () => Promise<void>) {
    setRunning(true);
    setError(null);
    try {
      await work();
    } catch {
      // A Server Action that couldn't be reached throws; the server's own refusals come back as messages.
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setRunning(false);
    }
  }

  const runWith = (config: BacktestConfig) =>
    busy(async () => {
      const result = await runBacktestAction(config);
      if (!result.ok) return setError(result.message);
      setNote(result.note);
      setView({ kind: "result", config, outcome: result.outcome, provenance: result.provenance, extras: result.extras });
    });

  function run() {
    const parsed = toConfig(form, isKnown);
    if ("error" in parsed) setError(parsed.error);
    else void runWith(parsed.config);
  }

  /** Loads settings into the form and runs them: a saved run, or a cell of a sweep. */
  function openConfig(config: BacktestConfig) {
    setForm(formFromConfig(config));
    void runWith(config);
  }
  /**
   * Opens a saved run: its stored result, exactly as calculated and saved
   * (re-running, with current prices or the saved ones, is a separate button).
   * A run saved before results were kept shows its settings only.
   */
  const open = (run: SavedRun) =>
    busy(async () => {
      setForm(formFromConfig(run.config));
      if (!run.stored) {
        setNote(null);
        setView({ kind: "legacy", run });
        return;
      }
      const loaded = await loadSavedRunAction(run.id);
      if (!loaded.ok) return setError(loaded.message);
      if (!loaded.stored) {
        setNote(null);
        setView({ kind: "legacy", run: loaded.run });
        return;
      }
      setNote(loaded.stored.note);
      setView({ kind: "saved", run: loaded.run, result: loaded.stored, reproduction: null });
    });

  /** Calculates a saved run again from its saved prices, with its original engine, and shows whether it matches. */
  async function reproduce(run: SavedRun) {
    setView((v) => (v.kind === "saved" && v.run.id === run.id ? { ...v, reproduction: "running" } : v));
    let outcome: ReproduceResult;
    try {
      outcome = await reproduceSavedRunAction(run.id);
    } catch {
      outcome = { ok: false, message: "Couldn't reach the server. Check your connection and try again." };
    }
    setView((v) => (v.kind === "saved" && v.run.id === run.id ? { ...v, reproduction: outcome } : v));
  }

  // Opened from a share link (/backtest#run=…), on arrival or when a link is
  // pasted into the address bar: load and run those settings.
  useEffect(() => {
    function openFromLink() {
      if (!location.hash.startsWith("#run=")) return;
      const shared = parseShareFragment(location.hash, isKnown);
      if (shared) openConfig(shared);
      else setError("That share link isn't valid, so it couldn't be opened.");
    }
    const arrival = setTimeout(openFromLink, 0); // after the first render, like any other event
    window.addEventListener("hashchange", openFromLink);
    return () => {
      clearTimeout(arrival);
      window.removeEventListener("hashchange", openFromLink);
    };
    // openConfig and isKnown only read state through setters and the account's stock list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runSweep(axes: Axis[], measure: Measure) {
    if (!sweepBase) return;
    setNote(null);
    setView({ kind: "sweep", measure });
    sweep.start({ base: sweepBase, axes });
  }

  function compare() {
    setNote(null);
    const runs = (saved.runs ?? []).filter((r) => selected.includes(r.id));
    void busy(async () => {
      const results = await compareRunsAction(runs.map((r) => r.config));
      if (!Array.isArray(results)) return setError(results.message);
      const failed = results.find((r) => !r.ok);
      if (failed && !failed.ok) return setError(failed.message);
      setView({ kind: "compare", runs, outcomes: results.flatMap((r) => (r.ok ? [r.outcome] : [])) });
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      {/*
       * The controls as tabs, with the results always beside (or, on phones,
       * below) them. Not in the address: the #fragment holds shared runs.
       */}
      <Tabs
        className="-mt-2 lg:col-span-4"
        label="Backtest tools"
        sync={false}
        sticky={false}
        tabs={[
          {
            id: "settings",
            label: "Settings",
            content: (
              <Card aria-labelledby="settings">
                <h2 id="settings" className="mb-4 text-lg font-semibold tracking-tight">
                  Settings
                </h2>
                <BacktestForm form={form} onChange={setForm} onRun={run} stocks={listings} openTickers={openTickers} firstDate={firstDate} lastDate={lastDate} running={running} error={error} />
              </Card>
            ),
          },
          {
            id: "sweep",
            label: "Sweep",
            content: <SweepPanel base={sweepBase} state={sweep.state} onRun={runSweep} onCancel={sweep.cancel} />,
            empty: "Pick a strategy with numbers to vary (like the moving averages' lengths) in Settings, and sweep them here.",
          },
          {
            id: "saved",
            label: saved.runs?.length ? `Saved (${saved.runs.length})` : "Saved",
            content: (
              <SavedRuns
                runs={saved.runs}
                signedIn={saved.signedIn}
                selected={selected}
                onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
                onCompare={compare}
                onOpen={open}
                onDelete={(r) => {
                  setSelected((s) => s.filter((x) => x !== r.id));
                  void saved.remove(r.id);
                }}
              />
            ),
          },
        ]}
      />

      <div className="lg:col-span-8">
        {/* aria-live: the results are announced when a run finishes. */}
        <Card aria-labelledby="results" aria-live="polite" aria-busy={running}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="results" ref={resultsHeading} tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none">
              {view.kind === "compare" ? "Comparison" : view.kind === "sweep" ? "Sweep" : "Results"}
            </h2>
            {view.kind === "result" && (
              <div className="flex flex-wrap items-center gap-2">
                <CopyLink key={`link-${JSON.stringify(view.config)}`} config={view.config} />
                <SaveRun key={JSON.stringify(view.config)} view={view} save={saved.save} canSave={saved.runs !== null} />
              </div>
            )}
          </div>
          <div className="mt-3">
            {(view.kind === "result" || view.kind === "saved") && note && <p className="mb-3 text-sm text-muted">{note}</p>}
            {view.kind === "result" && (
              <>
                <BacktestResults config={view.config} outcome={view.outcome} extras={view.extras} />
                <RunProvenance provenance={view.provenance} />
              </>
            )}
            {view.kind === "saved" && (
              <>
                <SavedRunBar view={view} onRerun={() => openConfig(view.run.config)} onReproduce={() => reproduce(view.run)} />
                <BacktestResults config={view.run.config} outcome={view.result.outcome} extras={view.result.extras} />
                <RunProvenance provenance={view.result.provenance} saved={view.run} />
              </>
            )}
            {view.kind === "legacy" && (
              <div className="py-12 text-center text-sm">
                <p className="font-medium">{view.run.name}</p>
                <p className="mx-auto mt-2 max-w-md text-muted">
                  Saved {formatDate(view.run.createdAt)}, before MarketLab kept results and the prices they came from, so only its settings were saved and it can&apos;t be
                  reproduced exactly. Its settings are in the form.
                </p>
                <button
                  type="button"
                  onClick={() => openConfig(view.run.config)}
                  className="mt-4 rounded-full bg-accent-fill px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Run with current prices
                </button>
              </div>
            )}
            {view.kind === "compare" && <RunComparison runs={view.runs} outcomes={view.outcomes} />}
            {view.kind === "sweep" &&
              (sweep.state.status === "done" ? (
                <>
                  <SweepResults result={sweep.state.result} measure={view.measure} onOpen={openConfig} />
                  <WalkForwardFromSweep base={sweepBase} result={sweep.state.result} />
                </>
              ) : (
                <p className="py-16 text-center text-sm text-muted">
                  {sweep.state.status === "running"
                    ? `Running ${sweep.state.total} backtests on the server…`
                    : sweep.state.status === "error"
                      ? sweep.state.message
                      : "The sweep was cancelled."}
                </p>
              ))}
            {view.kind === "empty" && (
              <p className="py-16 text-center text-sm text-muted">Choose your settings and run a backtest to see how the strategy would have done.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * "Save" next to the results: a name field (prefilled) and a button.
 * Keyed by the config, so it resets for each new run.
 */
function SaveRun({
  view,
  save,
  canSave,
}: {
  view: { config: BacktestConfig; outcome: BacktestOutcome };
  save: ReturnType<typeof useSavedRuns>["save"];
  canSave: boolean;
}) {
  const [name, setName] = useState(`${STRATEGY_NAMES[view.config.strategy.kind]} · ${holdingsLabel(view.config)}`);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  if (status?.ok) return <p role="status" className="text-sm text-gain">{status.text}</p>;

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const result = await save(name, view.config);
        setPending(false);
        setStatus(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.message });
      }}
    >
      <label htmlFor="run-name" className="sr-only">
        Name for this run
      </label>
      <input
        id="run-name"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        className="h-9 w-56 rounded-lg border border-border bg-transparent px-3 text-base outline-none focus-visible:border-accent sm:text-sm"
      />
      <button
        type="submit"
        disabled={pending || !canSave || !name.trim()}
        className="h-9 rounded-full bg-accent-fill px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
      >
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

/**
 * Copies a link that opens this backtest for anyone: the settings are in the
 * link itself (lib/backtest/share.ts), so nothing is saved anywhere.
 */
function CopyLink({ config }: { config: BacktestConfig }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <button
      type="button"
      onClick={async () => {
        const url = `${location.origin}/backtest#${shareFragment(config)}`;
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        } catch {
          // Clipboard blocked: put the link in the address bar instead, to copy from there.
          history.replaceState(null, "", url);
          setCopied(false);
        }
      }}
      className="h-9 rounded-full px-4 text-sm font-medium text-accent transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {copied === null ? "Copy link" : copied ? "Link copied" : "Link is in the address bar"}
    </button>
  );
}

/** Above a saved result: what it is, and the two ways to calculate it again. */
function SavedRunBar({ view, onRerun, onReproduce }: { view: Extract<View, { kind: "saved" }>; onRerun: () => void; onReproduce: () => void }) {
  const r = view.reproduction;
  const engine = view.result.provenance.engine;
  return (
    <div className="mb-4 rounded-xl border border-accent/20 bg-accent/5 px-3.5 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <span className="font-medium">{view.run.name}</span>: the result as saved on {formatDate(view.run.createdAt)}, not re-run.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onReproduce}
            disabled={r === "running"}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
          >
            {r === "running" ? "Reproducing…" : "Reproduce from saved inputs"}
          </button>
          <button
            type="button"
            onClick={onRerun}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent"
          >
            Re-run with current prices
          </button>
        </div>
      </div>
      {r && r !== "running" && (
        <p role="status" className={`mt-2 text-xs ${!r.ok || !r.comparison.matches ? "text-loss" : "text-gain"}`}>
          {!r.ok
            ? r.message
            : r.comparison.matches
              ? `Reproduced from the saved prices (dataset ${view.result.provenance.dataset.datasetVersion}) with the Python engine ${r.reproduced.provenance.engine.version}: the same result ✓${r.comparison.largestDifference > 0 ? ` (largest difference ${r.comparison.largestDifference.toExponential(1)})` : ", identical"}${engine.name === "typescript" ? `, though this run was saved by the TypeScript engine ${engine.version}, since retired` : ""}.`
              : engine.name === "typescript"
                ? `Reproduced with the Python engine ${r.reproduced.provenance.engine.version}; this run was saved by the TypeScript engine ${engine.version}, since retired, and the results differ: ${r.comparison.differences.join("; ")}.`
                : r.reproduced.provenance.engine.version !== engine.version
                ? `Reproduced with engine ${r.reproduced.provenance.engine.version}, which differs from the ${engine.version} this run was saved with: ${r.comparison.differences.join("; ")}.`
                : `Reproduced, but the result differs: ${r.comparison.differences.join("; ")}.`}
        </p>
      )}
    </div>
  );
}

/** A walk-forward test of the swept crossover pairs, when both averages were varied. */
function WalkForwardFromSweep({ base, result }: { base: BacktestConfig | null; result: SweepResult }) {
  if (base?.strategy.kind !== "moving-average") return null;
  const axis = (id: string) => result.axes.find((a) => a.param.id === id)?.values;
  const fast = axis("fast");
  const slow = axis("slow");
  if (!fast || !slow) return null;
  const range = (values: number[]) => ({ from: values[0], to: values[values.length - 1], step: values.length > 1 ? values[1] - values[0] : 1 });
  return <WalkForward base={base} fast={range(fast)} slow={range(slow)} />;
}
