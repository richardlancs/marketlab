"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { runConfig, STRATEGY_NAMES, summarize, type BacktestConfig, type BacktestOutcome, type SavedRun } from "@/lib/backtest/config";
import type { PricePoint } from "@/lib/types";
import { BacktestForm, defaultForm, formFromConfig, toConfig, type FormState, type StockOption } from "./backtest-form";
import { BacktestResults, holdingsLabel } from "./backtest-results";
import { RunComparison } from "./run-comparison";
import { SavedRuns } from "./saved-runs";
import { useSavedRuns } from "./use-saved-runs";

interface History {
  history: Record<string, PricePoint[]>;
  market: PricePoint[];
}

type View =
  | { kind: "empty" }
  | { kind: "result"; config: BacktestConfig; outcome: BacktestOutcome }
  | { kind: "compare"; runs: SavedRun[]; outcomes: BacktestOutcome[] };

/**
 * The backtest page's interactive part: the settings form, saved runs, and
 * the results of the last run or comparison. Prices come from /api/history;
 * backtests themselves run right here in the browser (they take milliseconds).
 */
export function BacktestWorkbench({ stocks, firstDate, lastDate }: { stocks: StockOption[]; firstDate: number; lastDate: number }) {
  const symbols = stocks.map((s) => s.symbol);
  const [form, setForm] = useState<FormState>(() => defaultForm(lastDate));
  const [view, setView] = useState<View>({ kind: "empty" });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const saved = useSavedRuns(symbols);
  // Prices already fetched, by symbol, so re-running with other settings is instant.
  const cache = useRef<History>({ history: {}, market: [] });

  async function load(needed: string[]): Promise<History> {
    const missing = needed.filter((s) => !cache.current.history[s]);
    if (missing.length > 0 || cache.current.market.length === 0) {
      const query = (missing.length ? missing : needed).map((s) => `symbol=${encodeURIComponent(s)}`).join("&");
      const response = await fetch(`/api/history?${query}`);
      if (!response.ok) throw new Error("Couldn't load prices. Check your connection and try again.");
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
      setView({ kind: "result", config, outcome: runConfig(config, history, market) });
    });

  function run() {
    const parsed = toConfig(form, symbols);
    if ("error" in parsed) setError(parsed.error);
    else void runWith(parsed.config);
  }

  function open(run: SavedRun) {
    setForm(formFromConfig(run.config));
    void runWith(run.config);
  }

  function compare() {
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
          <BacktestForm form={form} onChange={setForm} onRun={run} stocks={stocks} firstDate={firstDate} lastDate={lastDate} running={running} error={error} />
        </Card>
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
              {view.kind === "compare" ? "Comparison" : "Results"}
            </h2>
            {view.kind === "result" && <SaveRun key={JSON.stringify(view.config)} view={view} save={saved.save} canSave={saved.runs !== null} />}
          </div>
          <div className="mt-3">
            {view.kind === "result" && <BacktestResults config={view.config} outcome={view.outcome} />}
            {view.kind === "compare" && <RunComparison runs={view.runs} outcomes={view.outcomes} />}
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
