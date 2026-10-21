"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { NAME_LIMITS } from "@/lib/leaderboard";
import { joinLeaderboardAction, leaveLeaderboardAction, myLeaderboardEntryAction, type Entry } from "@/lib/leaderboard-actions";

/**
 * Joining or leaving the public leaderboard, on the portfolio page. Opt-in,
 * signed-in users only, under a display name (never the email).
 */
export function LeaderboardCard() {
  const { mode } = useAccount();
  // undefined: still loading; null: not on the board.
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (mode !== "signed-in") return;
    let cancelled = false;
    myLeaderboardEntryAction().then(
      (result) => !cancelled && setEntry(result.ok ? result.entry : null),
      () => !cancelled && setEntry(null),
    );
    return () => {
      cancelled = true;
    };
  }, [mode]);

  async function join(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await joinLeaderboardAction(name);
    setPending(false);
    if (result.ok) setEntry(result.entry);
    setMessage(result.ok ? null : result.message);
  }

  return (
    <Card aria-labelledby="leaderboard">
      <h2 id="leaderboard" className="text-lg font-semibold tracking-tight">
        Leaderboard
      </h2>
      {mode !== "signed-in" ? (
        <p className="mt-2 text-sm text-muted">
          <Link href="/sign-in" className="text-accent hover:underline">
            Sign in
          </Link>{" "}
          to put your portfolio on the{" "}
          <Link href="/leaderboard" className="text-accent hover:underline">
            leaderboard
          </Link>
          .
        </p>
      ) : entry === undefined ? (
        <p className="mt-2 text-sm text-muted">Loading…</p>
      ) : entry ? (
        <div className="mt-2 text-sm">
          <p>
            You&apos;re on the{" "}
            <Link href="/leaderboard" className="text-accent hover:underline">
              leaderboard
            </Link>{" "}
            as <span className="font-semibold">{entry.displayName}</span>, since {formatDate(entry.joinedAt)}.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              const result = await leaveLeaderboardAction();
              setPending(false);
              if (result.ok) setEntry(null);
            }}
            className="mt-3 text-sm text-muted transition-colors hover:text-loss focus-visible:outline-2 focus-visible:outline-accent"
          >
            Leave the leaderboard
          </button>
        </div>
      ) : (
        <form onSubmit={join} noValidate className="mt-2 space-y-2 text-sm">
          <p className="text-muted">Show how your simulated portfolio does from today, under a display name. Your email is never shown.</p>
          <label className="block text-xs text-muted">
            Display name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_LIMITS.max}
              autoComplete="nickname"
              className="mt-1 block h-10 w-full rounded-lg border border-border bg-transparent px-3 text-base outline-none focus-visible:border-accent sm:text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={pending || name.trim().length < NAME_LIMITS.min}
            className="h-9 rounded-full bg-accent-fill px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {pending ? "Joining…" : "Join"}
          </button>
          <p role="alert" className="min-h-4 text-xs text-loss">
            {message}
          </p>
        </form>
      )}
    </Card>
  );
}
