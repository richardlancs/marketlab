"use client";

import { useId } from "react";
import { NOTE_LENGTH, REASON_NAMES, TRADE_REASONS, type TradeReason } from "@/lib/trading";
import type { Journal } from "./account-provider";

/**
 * A trade's optional "why": one reason (a chip; choosing it again clears it)
 * and a short note. Used by the trade card and to edit a past trade. Private
 * to the trader; the portfolio's Review tab groups round trips by reason.
 */
export function JournalFields({ value, onChange }: { value: Journal; onChange: (next: Journal) => void }) {
  const id = useId();
  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="text-xs text-muted">Reason</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {TRADE_REASONS.map((reason: TradeReason) => {
            const on = value.reason === reason;
            return (
              <button
                key={reason}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...value, reason: on ? undefined : reason })}
                className={`tap h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  on ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted hover:bg-foreground/5"
                }`}
              >
                {REASON_NAMES[reason]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${id}-note`} className="text-xs text-muted">
          Note
        </label>
        <textarea
          id={`${id}-note`}
          rows={2}
          maxLength={NOTE_LENGTH}
          value={value.note ?? ""}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          placeholder="What do you expect to happen, and what would change your mind?"
          // 16px text: smaller makes iPhones zoom in on focus.
          className="mt-1 w-full resize-y rounded-lg border border-border bg-transparent px-3 py-2 text-base outline-none transition-colors focus-visible:border-accent sm:text-sm"
        />
        <p className="text-right text-xs text-muted tabular-nums">
          {(value.note ?? "").length}/{NOTE_LENGTH}
        </p>
      </div>
    </div>
  );
}
