"use client";

import { useId, useState, type FormEvent } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { placeOrder as previewOrder, roundCents, type Order } from "@/lib/trading";

type Status = { tone: "success" | "error"; text: string } | null;

/**
 * Buy or sell this stock at today's price. As you type, the order is run
 * through the same rules that will apply it (without saving), so the preview
 * and any error match exactly what happens when you submit.
 */
export function TradeCard({ symbol }: { symbol: string }) {
  const { account, quotes, placeOrder } = useAccount();
  const [side, setSide] = useState<Order["side"]>("buy");
  const [sharesText, setSharesText] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);
  const hintId = useId();

  const price = quotes[symbol].price;
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

  const held = account.holdings.find((h) => h.symbol === symbol)?.shares ?? 0;
  const shares = Number(sharesText);
  const total = roundCents(shares * price);
  // A dry run of the real rules. The ID and time don't matter for a preview.
  const preview = sharesText === "" ? null : previewOrder(account, { symbol, side, shares, price, id: "preview", time: 0 });
  const error = preview && !preview.ok ? preview.message : null;

  // The most shares this order could be for: what the cash buys, or what you own.
  let max = side === "buy" ? Math.floor(account.cash / price) : held;
  while (side === "buy" && max > 0 && roundCents(max * price) > account.cash) max--; // guard against rounding up past the cash

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!preview?.ok || pending) return;
    setPending(true);
    const result = await placeOrder(symbol, side, shares);
    setPending(false);
    if (result.ok) {
      const verb = side === "buy" ? "Bought" : "Sold";
      setStatus({ tone: "success", text: `${verb} ${shares} ${shares === 1 ? "share" : "shares"} of ${symbol} for ${formatCurrency(total)}.` });
      setSharesText("");
    } else {
      setStatus({ tone: "error", text: result.message });
    }
  }

  return (
    <Card aria-labelledby="trade">
      <h2 id="trade" className="text-lg font-semibold tracking-tight">
        Trade
      </h2>

      <form onSubmit={submit} className="mt-3 space-y-4" noValidate>
        {/* Real radio buttons, styled as a segmented control: arrow keys and screen readers work as expected. */}
        <fieldset className="grid grid-cols-2 gap-1 rounded-full bg-foreground/5 p-1 text-sm font-medium">
          <legend className="sr-only">Order type</legend>
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
                  setStatus(null);
                }}
                className="sr-only"
              />
              {option === "buy" ? "Buy" : "Sell"}
            </label>
          ))}
        </fieldset>

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
                setStatus(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={hintId}
              // 16px text (text-base): smaller makes iPhones zoom in on focus.
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 text-base tabular-nums outline-none transition-colors focus-visible:border-accent aria-invalid:border-loss"
            />
            <button
              type="button"
              disabled={max === 0}
              onClick={() => {
                setSharesText(String(max));
                setStatus(null);
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

        <dl className="space-y-1.5 border-t border-border pt-3 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-muted">Price</dt>
            <dd>{formatCurrency(price)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{side === "buy" ? "Estimated cost" : "Estimated proceeds"}</dt>
            <dd className="font-medium">{preview?.ok ? formatCurrency(total) : "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Cash after</dt>
            <dd>{preview?.ok ? formatCurrency(preview.account.cash) : "—"}</dd>
          </div>
        </dl>

        <button
          type="submit"
          disabled={!preview?.ok || pending}
          className={`h-10 w-full rounded-full text-sm font-medium text-white transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 ${
            side === "buy" ? "bg-accent" : "bg-loss"
          } enabled:hover:opacity-90`}
        >
          {preview?.ok ? `${side === "buy" ? "Buy" : "Sell"} ${shares} ${symbol} · ${formatCurrency(total)}` : side === "buy" ? "Buy" : "Sell"}
        </button>

        {/* role="status" announces the result to screen readers without moving focus. */}
        <p role="status" className={`min-h-5 text-sm ${status?.tone === "error" ? "text-loss" : "text-gain"}`}>
          {status?.text}
        </p>
      </form>
    </Card>
  );
}
