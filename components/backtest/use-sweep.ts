"use client";

import { useEffect, useRef, useState } from "react";
import type { BacktestConfig } from "@/lib/backtest/config";
import { prepareSweep, runPoint, type Axis, type SweepResult } from "@/lib/backtest/sweep";
import type { PricePoint } from "@/lib/types";

export type SweepState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done"; result: SweepResult }
  | { status: "error"; message: string };

interface Job {
  base: BacktestConfig;
  axes: Axis[];
  history: Record<string, PricePoint[]>;
  market: PricePoint[];
}

/**
 * Runs sweeps in a Web Worker (lib/backtest/sweep.worker.ts). If a worker
 * can't be started, the same code runs on the main thread instead, in small
 * batches with a pause between them so the page stays responsive.
 */
export function useSweep() {
  const [state, setState] = useState<SweepState>({ status: "idle" });
  const cancelRef = useRef<() => void>(() => {});
  useEffect(() => () => cancelRef.current(), []); // stop on unmount

  function finish(result: SweepResult | { error: string }) {
    setState("error" in result ? { status: "error", message: result.error } : { status: "done", result });
  }

  /** The fallback: a batch of runs, then a pause so the page can respond, then the next batch. */
  function runOnMainThread(job: Job) {
    const sweep = prepareSweep(job.base, job.axes, job.history, job.market);
    if ("error" in sweep) return finish(sweep);
    let cancelled = false;
    cancelRef.current = () => {
      cancelled = true;
    };
    const total = sweep.points.length;
    let done = 0;
    const batch = () => {
      if (cancelled) return;
      for (const end = Math.min(total, done + 10); done < end; done++) runPoint(sweep.points[done], job.history);
      if (done < total) {
        setState({ status: "running", done, total });
        setTimeout(batch, 0);
      } else finish(sweep);
    };
    setState({ status: "running", done: 0, total });
    setTimeout(batch, 0);
  }

  /** Starts a sweep (cancelling any running one). Call from an event handler. */
  function start(job: Job) {
    cancelRef.current();
    let worker: Worker;
    try {
      // The `new URL(…, import.meta.url)` form lets the bundler find and build the worker file.
      worker = new Worker(new URL("../../lib/backtest/sweep.worker.ts", import.meta.url), { type: "module" });
    } catch {
      runOnMainThread(job);
      return;
    }
    cancelRef.current = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<{ type: "progress"; done: number; total: number } | { type: "done"; result: SweepResult | { error: string } }>) => {
      const message = event.data;
      if (message.type === "progress") setState({ status: "running", done: message.done, total: message.total });
      else {
        worker.terminate();
        finish(message.result);
      }
    };
    worker.onerror = (event) => {
      // The worker couldn't load (or crashed): do the work here instead.
      event.preventDefault();
      worker.terminate();
      runOnMainThread(job);
    };
    setState({ status: "running", done: 0, total: 0 });
    worker.postMessage(job);
  }

  function cancel() {
    cancelRef.current();
    setState({ status: "idle" });
  }

  return { state, start, cancel, reset: () => setState({ status: "idle" }) };
}
