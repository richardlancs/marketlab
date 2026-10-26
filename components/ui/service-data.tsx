"use client";

import { useEffect, useState } from "react";

/** How long to wait before trying a failed request again by itself: the analytics service may be waking from idle. */
const AUTO_RETRY_MS = 4000;

export type ServiceState<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: T };

/**
 * Loads JSON from one of MarketLab's analytics routes, which call the Python
 * service. `request` is null until there's something to ask (no holdings
 * yet); a new request (compared as JSON) loads again, keeping the last good
 * answer on screen meanwhile. A failure is tried again once by itself after
 * a few seconds, and `retry` tries again on request.
 */
export function useServiceData<T>(request: { url: string; body?: unknown } | null): ServiceState<T> & { retry: () => void } {
  const key = request ? JSON.stringify(request) : null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; state: ServiceState<T> } | null>(null);

  useEffect(() => {
    if (key === null) return;
    const { url, body } = JSON.parse(key) as { url: string; body?: unknown };
    let cancelled = false;
    const load = (isRetry: boolean): Promise<void> =>
      fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" })
        .then(async (response) => {
          const data = await response.json().catch(() => null);
          if (!response.ok) throw new Error(data?.error ?? "Couldn't load this. Check your connection and try again.");
          if (!cancelled) setResult({ key, attempt, state: { status: "ok", data: data as T } });
        })
        .catch(async (error: Error) => {
          if (cancelled) return;
          if (!isRetry) {
            await new Promise((resolve) => setTimeout(resolve, AUTO_RETRY_MS));
            if (!cancelled) return load(true);
            return;
          }
          setResult({ key, attempt, state: { status: "error", message: error.message } });
        });
    void load(false);
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const retry = () => setAttempt((n) => n + 1);
  if (result && result.key === key && result.attempt === attempt) return { ...result.state, retry };
  // While a new request loads, keep showing the last good answer.
  if (result?.state.status === "ok") return { ...result.state, retry };
  return { status: "loading", retry };
}

/** A failed analytics request: the reason, and a button to try again. */
export function ServiceError({ message, onRetry, className = "mt-3" }: { message: string; onRetry: () => void; className?: string }) {
  return (
    <div role="alert" className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted ${className}`}>
      <p>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="tap rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent"
      >
        Try again
      </button>
    </div>
  );
}
