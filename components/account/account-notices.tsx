"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { useAccount } from "./account-provider";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Messages about the account itself, under the header:
 * - after a first sign-in, the offer to import this browser's guest data;
 * - problems reaching the server.
 */
export function AccountNotices() {
  const { importOffer, resolveImport, error, dismissError } = useAccount();
  const [pending, setPending] = useState<"import" | "fresh" | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  if (!importOffer && !error) return null;

  async function choose(choice: "import" | "fresh") {
    setPending(choice);
    setImportError(null);
    const outcome = await resolveImport(choice);
    setPending(null);
    if (!outcome.ok) setImportError(outcome.message);
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
      {importOffer && (
        <section
          aria-labelledby="import-title"
          className="animate-fade-up rounded-2xl border border-accent/30 bg-accent/[0.06] p-5 sm:flex sm:items-center sm:gap-6"
        >
          <div className="flex-1">
            <h2 id="import-title" className="font-semibold">
              Bring your guest portfolio into your account?
            </h2>
            <p className="mt-1 text-sm text-muted">
              This browser has {plural(importOffer.holdings.length, "holding")}, {formatCurrency(importOffer.cash)} cash,{" "}
              {plural(importOffer.watchlist.length, "watched stock")} and {plural(importOffer.trades.length, "trade")}. Import them, or start
              your account with the standard starting portfolio.
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
              onClick={() => choose("import")}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {pending === "import" ? "Importing…" : "Import"}
            </button>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => choose("fresh")}
              className="rounded-full px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {pending === "fresh" ? "Setting up…" : "Start fresh"}
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
