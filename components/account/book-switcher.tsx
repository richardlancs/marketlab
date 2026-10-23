"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useAccount } from "./account-provider";

/**
 * Chooses which portfolio to trade in and look at: the practice portfolio,
 * or a season's (lib/books.ts). Shown only to people who've joined a season.
 */
export function BookSwitcher({ className = "" }: { className?: string }) {
  const { book, books, chooseBook } = useAccount();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (books.length < 2) return null;

  return (
    <div className={className}>
      <div role="radiogroup" aria-label="Portfolio" className="flex gap-1 overflow-x-auto rounded-full bg-foreground/[0.06] p-1 [scrollbar-width:none]">
        {books.map((b) => {
          const on = b.id === book.id;
          return (
            <button
              key={b.id ?? "practice"}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={pending}
              onClick={() =>
                !on &&
                start(async () => {
                  const result = await chooseBook(b.id);
                  setMessage(result.ok ? null : result.message);
                })
              }
              className={`min-h-9 shrink-0 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-accent ${on ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              {b.label}
              {b.readOnly && <span className="text-muted"> · ended</span>}
            </button>
          );
        })}
      </div>
      {book.seasonId && (
        <p className="mt-2 text-xs text-muted">
          {book.readOnly ? "This season is over: its portfolio is shown as it finished. " : "You're trading in your season portfolio. "}
          <Link href={`/leaderboard/season/${book.seasonId}`} className="tap text-accent hover:underline">
            See the standings
          </Link>
        </p>
      )}
      {message && (
        <p role="alert" className="mt-2 text-xs text-loss">
          {message}
        </p>
      )}
    </div>
  );
}
