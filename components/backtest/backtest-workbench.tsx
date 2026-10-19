"use client";

import { useRef, useState } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { runConfig, STRATEGY_NAMES, summarize, type BacktestConfig, type BacktestOutcome, type SavedRun } from "@/lib/backtest/config";
import { formatDate } from "@/lib/format";
import { isSymbolFormat } from "@/lib/market/symbols";
import type { PricePoint } from "@/lib/types";
import { BacktestForm, defaultForm, formFromConfig, toConfig, type FormState } from "./backtest-form";
import { BacktestResults, holdingsLabel } from "./backtest-results";
import { RunComparison } from "./run-comparison";
import { SavedRuns } from "./saved-runs";
import { SweepPanel, SweepResults, type Measure } from "./sweep-panel";
import { useSavedRuns } from "./use-saved-runs";
import { useSweep } from "./use-sweep";
import type { Axis } from "@/lib/backtest/sweep";

interface History {
  history: Record<string, PricePoint[]>;
  market: PricePoint[];
}

type View =
  | { kind: "empty" }
  | { kind: "result"; config: BacktestConfig; outcome: BacktestOutcome }
  | { kind: "compare"; runs: SavedRun[]; outcomes: BacktestOutcome[] }
  | { kind: "sweep"; measure: Measure };

/**
 * The backtest page's interactive part: the settings form, saved runs, and
 * the results of the last run or comparison. Prices come from /api/history;
 * backtests themselves run right here in the browser (they take milliseconds).
 * The stocks to pick from are the catalog's, from the account provider; with
 * real data any other ticker can be typed too.
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
  const saved = useSavedRuns();
  const sweep = useSweep();
  // The form as a config, for the sweep panel (null while the form has a mistake).
  const parsedForm = toConfig(form, isKnown);
  const sweepBase = "config" in parsedForm ? parsedForm.config : null;
  // Prices already fetched, by symbol, so re-running with other settings is instant.
  const cache = useRef<History>({ history: {}, market: [] });

  async function load(needed: string[]): Promise<History> {
    const missing = needed.filter((s) => !cache.current.history[s]);
    if (missing.length > 0 || cache.current.market.length === 0) {
      const query = (missing.length ? missing : needed).map((s) => `symbol=${encodeURIComponent(s)}`).join("&");
      const response = await fetch(`/api/history?${query}`);
      if (!response.ok) {
        // The route explains unknown stocks and unavailable prices; anything else is likely the connection.
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Couldn't load prices. Check your connection and try again.");
      }
      const data: History = await response.json();
      cache.current = { history: { ...cache.current.history, ...data.history }, market: data.market };
    }
    return cache.current;
  }

  /** Runs `work` with the loading state and error handling every action shares. */
  async function busy(work: () => Promise<void>) {
    setRunning(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong running the backtest.");
    } finally {
      setRunning(false);
    }
  }

  const runWith = (config: BacktestConfig) =>
    busy(async () => {
      const { history, market } = await load(config.holdings.map((h) => h.symbol));
      // A stock listed recently has a shorter history. The run then starts on
      // the first day all the stocks have prices; say so instead of leaving it
      // a mystery why the chart starts later.
      const latestStart = config.holdings
        .map((h) => ({ symbol: h.symbol, first: history[h.symbol]?.[0]?.time ?? 0 }))
        .reduce((a, b) => (b.first > a.first ? b : a));
      setNote(latestStart.first > config.start ? `${latestStart.symbol}'s prices start on ${formatDate(latestStart.first)}, so the run starts there.` : null);
      setView({ kind: "result", config, outcome: runConfig(config, history, market) });
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
  const open = (run: SavedRun) => openConfig(run.config);

  function runSweep(axes: Axis[], measure: Measure) {
    if (!sweepBase) return;
    const base = sweepBase;
    setNote(null);
    void busy(async () => {
      const { history, market } = await load(base.holdings.map((h) => h.symbol));
      setView({ kind: "sweep", measure });
      sweep.start({ base, axes, history, market });
    });
  }

  function compare() {
    setNote(null);
    const runs = (saved.runs ?? []).filter((r) => selected.includes(r.id));
    void busy(async () => {
      const { history, market } = await load([...new Set(runs.flatMap((r) => r.config.holdings.map((h) => h.symbol)))]);
      setView({ kind: "compare", runs, outcomes: runs.map((r) => runConfig(r.config, history, market)) });
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      <div className="flex flex-col gap-4 lg:col-span-4 lg:gap-6">
        <Card aria-labelledby="settings">
          <h2 id="settings" className="mb-4 text-lg font-semibold tracking-tight">
            Settings
          </h2>
          <BacktestForm form={form} onChange={setForm} onRun={run} stocks={listings} openTickers={openTickers} firstDate={firstDate} lastDate={lastDate} running={running} error={error} />
        </Card>
        <SweepPanel base={sweepBase} state={sweep.state} onRun={runSweep} onCancel={sweep.cancel} />
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
      </div>

      <div className="lg:col-span-8">
        {/* aria-live: the results are announced when a run finishes. */}
        <Card aria-labelledby="results" aria-live="polite" aria-busy={running}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="results" className="text-lg font-semibold tracking-tight">
              {view.kind === "compare" ? "Comparison" : view.kind === "sweep" ? "Sweep" : "Results"}
            </h2>
            {view.kind === "result" && <SaveRun key={JSON.stringify(view.config)} view={view} save={saved.save} canSave={saved.runs !== null} />}
          </div>
          <div className="mt-3">
            {view.kind === "result" && note && <p className="mb-3 text-sm text-muted">{note}</p>}
            {view.kind === "result" && <BacktestResults config={view.config} outcome={view.outcome} />}
            {view.kind === "compare" && <RunComparison runs={view.runs} outcomes={view.outcomes} />}
            {view.kind === "sweep" &&
              (sweep.state.status === "done" ? (
                <SweepResults result={sweep.state.result} measure={view.measure} onOpen={openConfig} />
              ) : (
                <p className="py-16 text-center text-sm text-muted">
                  {sweep.state.status === "running"
                    ? `Running ${sweep.state.done} of ${sweep.state.total || "…"} backtests…`
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
        const result = await save(name, view.config, summarize(view.outcome));
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
        className="h-9 rounded-full bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
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
