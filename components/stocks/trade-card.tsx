"use client";

import { useId, useState, type FormEvent } from "react";
import { useAccount, type Journal } from "@/components/account/account-provider";
import { JournalFields } from "@/components/account/journal-fields";
import { BookSwitcher } from "@/components/account/book-switcher";
import { Card } from "@/components/ui/card";
import { Explain } from "@/components/ui/explain";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { describeOrder, placePendingOrder as previewPending, type NewOrder } from "@/lib/orders";
import { placeOrder as previewOrder, roundCents, type Order, type PendingOrder } from "@/lib/trading";
import type { StockQuote } from "@/lib/types";

type Status = { tone: "success" | "error"; text: string } | null;
type Kind = "market" | PendingOrder["type"];

const KINDS: { value: Kind; label: string; help: string }[] = [
  { value: "market", label: "Market", help: "Fills now, at today's price." },
  { value: "limit", label: "Limit", help: "Buys at or below your price, or sells at or above it." },
  { value: "stop", label: "Stop", help: "Once the price passes your level: sells if it falls to it, or buys if it rises to it." },
];

const field =
  "h-10 min-w-0 rounded-lg border border-border bg-transparent px-3 text-base tabular-nums outline-none transition-colors focus-visible:border-accent aria-invalid:border-loss";

/**
 * Buy or sell this stock. A market order fills at today's price; a limit or
 * stop order waits for a close that reaches its price (lib/orders.ts). As you
 * type, the order is run through the same rules that will apply it (without
 * saving), so the preview and any error match what happens when you submit.
 *
 * The page passes the quote in, so this works for any stock, not just the
 * ones whose prices the whole app already has.
 */
export function TradeCard({ quote }: { quote: StockQuote }) {
  const { account, book, placeOrder, placePendingOrder } = useAccount();
  const [side, setSide] = useState<Order["side"]>("buy");
  const [kind, setKind] = useState<Kind>("market");
  const [sharesText, setSharesText] = useState("");
  const [priceText, setPriceText] = useState("");
  const [duration, setDuration] = useState<PendingOrder["duration"]>("gtc");
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);
  const [journal, setJournal] = useState<Journal>({});
  const hintId = useId();
  const { symbol, price } = quote;

  if (!account) {
    return (
      <Card aria-labelledby="trade" aria-busy>
        <h2 id="trade" className="text-lg font-semibold tracking-tight">
          Trade
        </h2>
        <span className="sr-only">Loading…</span>
        <Skeleton className="mt-3 h-40" />
      </Card>
    );
  }

  const reset = () => setStatus(null);
  const held = account.holdings.find((h) => h.symbol === symbol)?.shares ?? 0;
  const shares = Number(sharesText);
  const orderPrice = kind === "market" ? price : Number(priceText);
  const total = roundCents(shares * orderPrice);
  const why: Journal = { ...(journal.reason && { reason: journal.reason }), ...(journal.note?.trim() && { note: journal.note.trim() }) };
  const pendingInput: NewOrder = { symbol, side, type: kind === "market" ? "limit" : kind, shares, price: orderPrice, duration, ...why };
  // A dry run of the real rules. The ID and time don't matter for a preview.
  const preview =
    sharesText === "" || (kind !== "market" && priceText === "")
      ? null
      : kind === "market"
        ? previewOrder(account, { symbol, side, shares, price, id: "preview", time: 0 })
        : previewPending(account, pendingInput, "preview", 0);
  const error = preview && !preview.ok ? preview.message : null;

  // The most shares this order could be for: what the cash buys, or what you own.
  let max = side === "buy" ? (orderPrice > 0 ? Math.floor(account.cash / orderPrice) : 0) : held;
  while (side === "buy" && max > 0 && roundCents(max * orderPrice) > account.cash) max--; // guard against rounding up past the cash

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!preview?.ok || pending) return;
    setPending(true);
    const result = kind === "market" ? await placeOrder(quote, side, shares, why) : await placePendingOrder(pendingInput);
    setPending(false);
    if (!result.ok) return setStatus({ tone: "error", text: result.message });
    const verb = side === "buy" ? "Bought" : "Sold";
    setStatus({
      tone: "success",
      text:
        kind === "market"
          ? `${verb} ${shares} ${shares === 1 ? "share" : "shares"} of ${symbol} for ${formatCurrency(total)}.`
          : `Order placed: ${describeOrder(pendingInput, formatCurrency)}. It's checked at each day's close.`,
    });
    setSharesText("");
    setJournal({});
  }

  return (
    <Card aria-labelledby="trade">
      <h2 id="trade" className="text-lg font-semibold tracking-tight">
        Trade
      </h2>
      <BookSwitcher className="mt-3" />

      {book.readOnly ? (
        <p className="mt-3 text-sm text-muted">This season is over, so its portfolio can&apos;t trade. Switch to your practice portfolio to trade.</p>
      ) : (
      <form onSubmit={submit} className="mt-3 space-y-4" noValidate>
        {/* Real radio buttons, styled as a segmented control: arrow keys and screen readers work as expected. */}
        <fieldset className="grid grid-cols-2 gap-1 rounded-full bg-foreground/5 p-1 text-sm font-medium">
          <legend className="sr-only">Buy or sell</legend>
          {(["buy", "sell"] as const).map((option) => (
            <label
              key={option}
              className="cursor-pointer rounded-full py-1.5 text-center text-muted transition-colors has-checked:bg-surface has-checked:text-foreground has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-accent"
            >
              <input
                type="radio"
                name="side"
                value={option}
                checked={side === option}
                onChange={() => {
                  setSide(option);
                  reset();
                }}
                className="sr-only"
              />
              {option === "buy" ? "Buy" : "Sell"}
            </label>
          ))}
        </fieldset>

        <div>
          <label htmlFor={`${hintId}-kind`} className="text-xs text-muted">
            Order type
          </label>
          <select
            id={`${hintId}-kind`}
            value={kind}
            onChange={(e) => {
              const next = e.target.value as Kind;
              setKind(next);
              if (next !== "market" && priceText === "") setPriceText(price.toFixed(2));
              reset();
            }}
            aria-describedby={`${hintId}-kind-help`}
            className={`${field} mt-1 w-full`}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <p id={`${hintId}-kind-help`} className="mt-1 flex items-start gap-1.5 text-xs text-muted">
            <span>{KINDS.find((k) => k.value === kind)?.help}</span>
            {kind !== "market" && <Explain term={kind === "limit" ? "limitOrder" : "stopOrder"} className="mt-px" />}
          </p>
        </div>

        {kind !== "market" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${hintId}-price`} className="text-xs text-muted">
                {kind === "limit" ? "Limit price" : "Stop price"}
              </label>
              <input
                id={`${hintId}-price`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={priceText}
                onChange={(e) => {
                  setPriceText(e.target.value);
                  reset();
                }}
                className={`${field} mt-1 w-full`}
              />
            </div>
            <div>
              <label htmlFor={`${hintId}-duration`} className="text-xs text-muted">
                Lasts
              </label>
              <select
                id={`${hintId}-duration`}
                value={duration}
                onChange={(e) => setDuration(e.target.value as PendingOrder["duration"])}
                className={`${field} mt-1 w-full`}
              >
                <option value="gtc">Until cancelled (90 days)</option>
                <option value="day">Next close only</option>
              </select>
            </div>
          </div>
        )}

        <div>
          <label htmlFor={`${hintId}-shares`} className="text-xs text-muted">
            Shares
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id={`${hintId}-shares`}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              placeholder="0"
              value={sharesText}
              onChange={(event) => {
                setSharesText(event.target.value);
                reset();
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={hintId}
              // 16px text (text-base): smaller makes iPhones zoom in on focus.
              className={`${field} flex-1`}
            />
            <button
              type="button"
              disabled={max === 0}
              onClick={() => {
                setSharesText(String(max));
                reset();
              }}
              className="h-10 rounded-lg px-3 text-sm font-medium text-accent transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent disabled:text-muted disabled:hover:bg-transparent"
            >
              Max
            </button>
          </div>
          <p id={hintId} className={`mt-1.5 text-xs ${error ? "text-loss" : "text-muted"}`}>
            {error ?? (side === "buy" ? `${formatCurrency(account.cash)} cash available` : `You own ${held} ${held === 1 ? "share" : "shares"}`)}
          </p>
        </div>

        <details className="group rounded-lg border border-border px-3 py-2" open={!!(journal.reason || journal.note)}>
          <summary className="tap cursor-pointer text-sm font-medium">
            Why? <span className="font-normal text-muted">Optional, private: your Review tab learns from it</span>
          </summary>
          <div className="mt-3">
            <JournalFields value={journal} onChange={setJournal} />
          </div>
        </details>

        <dl className="space-y-1.5 border-t border-border pt-3 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-muted">Today&apos;s price</dt>
            <dd>{formatCurrency(price)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{side === "buy" ? "Estimated cost" : "Estimated proceeds"}</dt>
            <dd className="font-medium">{preview?.ok ? formatCurrency(total) : "—"}</dd>
          </div>
          {kind === "market" && (
            <div className="flex justify-between">
              <dt className="text-muted">Cash after</dt>
              <dd>{preview?.ok && "trade" in preview ? formatCurrency(preview.account.cash) : "—"}</dd>
            </div>
          )}
        </dl>
        {kind !== "market" && preview?.ok && (
          <p className="text-xs text-muted">
            {describeOrder(pendingInput, formatCurrency)}. It fills at that close, which can be better than your price, or worse after a jump in price.
          </p>
        )}

        <button
          type="submit"
          disabled={!preview?.ok || pending}
          className={`h-10 w-full rounded-full text-sm font-medium text-white transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 ${
            side === "buy" ? "bg-accent-fill" : "bg-loss-fill"
          } enabled:hover:opacity-90`}
        >
          {!preview?.ok
            ? side === "buy"
              ? "Buy"
              : "Sell"
            : kind === "market"
              ? `${side === "buy" ? "Buy" : "Sell"} ${shares} ${symbol} · ${formatCurrency(total)}`
              : `Place ${kind} order`}
        </button>

        {/* role="status" announces the result to screen readers without moving focus. */}
        <p role="status" className={`min-h-5 text-sm ${status?.tone === "error" ? "text-loss" : "text-gain"}`}>
          {status?.text}
        </p>
      </form>
      )}
    </Card>
  );
}
