"use client";

import { useRef, useState } from "react";
import { runSweepAction } from "@/lib/backtest-actions";
import type { BacktestConfig } from "@/lib/backtest/config";
import { buildGrid, type Axis, type SweepResult } from "@/lib/backtest/sweep";

export type SweepState =
  | { status: "idle" }
  | { status: "running"; total: number }
  | { status: "done"; result: SweepResult }
  | { status: "error"; message: string };

/**
 * Runs parameter sweeps on the server (runSweepAction), next to the prices,
 * so the browser neither downloads them nor spends its time on up to 200
 * backtests. The grid is checked here first, so mistakes show at once and
 * the "Running…" line can say how many runs there are.
 */
export function useSweep() {
  const [state, setState] = useState<SweepState>({ status: "idle" });
  // Each sweep gets a number; a reply for an older (cancelled or replaced) sweep is ignored.
  const latest = useRef(0);

  /** Starts a sweep (replacing any running one). Call from an event handler. */
  function start({ base, axes }: { base: BacktestConfig; axes: Axis[] }) {
    const grid = buildGrid(base, axes);
    if ("error" in grid) return setState({ status: "error", message: grid.error });
    const id = ++latest.current;
    setState({ status: "running", total: grid.points.length });
    runSweepAction(base, axes)
      .then((outcome) => {
        if (id !== latest.current) return;
        setState(outcome.ok ? { status: "done", result: outcome.result } : { status: "error", message: outcome.message });
      })
      .catch(() => id === latest.current && setState({ status: "error", message: "Couldn't reach the server. Check your connection and try again." }));
  }

  /** Stops waiting for the running sweep. (The server may finish it anyway; its result is then ready, cached, if asked again.) */
  function cancel() {
    latest.current++;
    setState({ status: "idle" });
  }

  return { state, start, cancel, reset: () => setState({ status: "idle" }) };
}
