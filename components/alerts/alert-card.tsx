"use client";

import { useId, useState, type FormEvent } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PriceAlert } from "@/lib/trading";

const field =
  "h-10 min-w-0 rounded-lg border border-border bg-transparent px-3 text-base tabular-nums outline-none transition-colors focus-visible:border-accent sm:text-sm";

/** "Alert me when KO closes above $70", on a stock's page, with that stock's alerts below. */
export function AlertCard({ symbol, price }: { symbol: string; price: number }) {
  const { account, addAlert, removeAlert } = useAccount();
  const [direction, setDirection] = useState<PriceAlert["direction"]>("above");
  const [priceText, setPriceText] = useState(() => (Math.round(price * 1.05 * 100) / 100).toFixed(2));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const id = useId();
  if (!account) return null;
  const alerts = (account.alerts ?? []).filter((a) => a.symbol === symbol);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await addAlert({ symbol, direction, price: Number(priceText) });
    setStatus(result.ok ? { ok: true, text: "Alert set. It's checked at each day's close." } : { ok: false, text: result.message });
  }

  return (
    <Card aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
        Price alert
      </h2>
      <form onSubmit={submit} noValidate className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          Tell me when {symbol} closes
          <select
            value={direction}
            onChange={(e) => {
              const next = e.target.value as PriceAlert["direction"];
              setDirection(next);
              setPriceText((Math.round(price * (next === "above" ? 1.05 : 0.95) * 100) / 100).toFixed(2));
            }}
            className={`${field} mt-1 block`}
          >
            <option value="above">at or above</option>
            <option value="below">at or below</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Price ($)
          <input type="number" inputMode="decimal" min={0} step="0.01" value={priceText} onChange={(e) => setPriceText(e.target.value)} className={`${field} mt-1 block w-28`} />
        </label>
        <button
          type="submit"
          className="h-10 rounded-full bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Set alert
        </button>
      </form>
      <p role="status" className={`mt-2 min-h-4 text-xs ${status?.ok === false ? "text-loss" : "text-muted"}`}>
        {status?.text}
      </p>
      {alerts.length > 0 && <AlertList alerts={alerts} onRemove={removeAlert} showSymbol={false} />}
    </Card>
  );
}

/** Alerts, triggered ones first, each with Remove. */
export function AlertList({ alerts, onRemove, showSymbol = true }: { alerts: PriceAlert[]; onRemove: (id: string) => unknown; showSymbol?: boolean }) {
  const sorted = [...alerts].sort((a, b) => (b.triggeredAt ?? 0) - (a.triggeredAt ?? 0) || b.createdAt - a.createdAt);
  return (
    <ul className="mt-2 divide-y divide-border text-sm">
      {sorted.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 py-2">
          <span>
            {showSymbol && <span className="font-semibold">{a.symbol} </span>}
            {a.direction === "above" ? "at or above" : "at or below"} {formatCurrency(a.price)}
            <span className={`block text-xs ${a.triggeredAt ? "text-accent" : "text-muted"}`}>
              {a.triggeredAt && a.triggerPrice
                ? `Triggered ${formatDate(a.triggeredAt)}: closed at ${formatCurrency(a.triggerPrice)}`
                : `Waiting · set ${formatDate(a.createdAt)}`}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            aria-label={`Remove alert: ${a.symbol} ${a.direction} ${formatCurrency(a.price)}`}
            className="shrink-0 rounded-full px-3 py-1 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-loss focus-visible:outline-2 focus-visible:outline-accent"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
