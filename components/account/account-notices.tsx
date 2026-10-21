"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { useAccount } from "./account-provider";
import { VerifyEmailNotice } from "./verify-email-notice";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Messages about the account itself, under the header:
 * - after signing in, when this browser's guest and the account both had a
 *   portfolio of their own, the choice of which one to keep;
 * - confirming your email address, until it's confirmed;
 * - problems reaching the server.
 */
export function AccountNotices({ emailVerification }: { emailVerification: boolean }) {
  const { account, pendingGuest, resolvePendingGuest, error, dismissError } = useAccount();
  const [pending, setPending] = useState<"use-guest" | "keep-account" | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  if (!pendingGuest && !error) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 pt-4 empty:hidden sm:px-6 lg:px-8">
        <VerifyEmailNotice enabled={emailVerification} />
      </div>
    );
  }

  async function choose(choice: "use-guest" | "keep-account") {
    setPending(choice);
    setImportError(null);
    const outcome = await resolvePendingGuest(choice);
    setPending(null);
    if (!outcome.ok) setImportError(outcome.message);
  }

  const describe = (a: NonNullable<typeof account>) =>
    `${plural(a.holdings.length, "holding")}, ${formatCurrency(a.cash)} cash, ${plural(a.watchlist.length, "watched stock")} and ${plural(a.trades.length, "trade")}`;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-2 px-4 pt-4 sm:px-6 lg:px-8">
      <VerifyEmailNotice enabled={emailVerification} />
      {pendingGuest && (
        <section
          aria-labelledby="import-title"
          className="animate-fade-up rounded-2xl border border-accent/30 bg-accent/[0.06] p-5 sm:flex sm:items-center sm:gap-6"
        >
          <div className="flex-1">
            <h2 id="import-title" className="font-semibold">
              Which portfolio should your account keep?
            </h2>
            <p className="mt-1 text-sm text-muted">
              Before signing in you used a guest portfolio here ({describe(pendingGuest)}). Your account already has its own
              {account ? ` (${describe(account)})` : ""}. Your lesson progress and saved backtests from both have been combined.
            </p>
            {importError && (
              <p role="alert" className="mt-2 text-sm text-loss">
                {importError}
              </p>
            )}
          </div>
          <div className="mt-4 flex shrink-0 gap-2 sm:mt-0">
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => choose("use-guest")}
              className="rounded-full bg-accent-fill px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {pending === "use-guest" ? "Switching…" : "Use the guest one"}
            </button>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => choose("keep-account")}
              className="rounded-full px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {pending === "keep-account" ? "Keeping…" : "Keep my account’s"}
            </button>
          </div>
        </section>
      )}

      {error && (
        <div role="alert" className="mt-2 flex items-center gap-3 rounded-xl border border-loss/30 bg-loss/[0.06] px-4 py-3 text-sm first:mt-0">
          <p className="flex-1">{error}</p>
          <button
            type="button"
            onClick={dismissError}
            className="rounded-full px-2 py-1 text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
