"use client";

import { useId, useState, type FormEvent } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { describeAlert } from "@/lib/alerts";
import type { AlertCondition, PriceAlert } from "@/lib/trading";

const field =
  "h-10 min-w-0 rounded-lg border border-border bg-transparent px-3 text-base tabular-nums outline-none transition-colors focus-visible:border-accent sm:text-sm";

type Kind = "price" | "rsi" | "sma-cross" | "move" | "range-52w";

const KINDS: { kind: Kind; label: string }[] = [
  { kind: "price", label: "Price" },
  { kind: "rsi", label: "RSI" },
  { kind: "sma-cross", label: "Average cross" },
  { kind: "move", label: "Big move" },
  { kind: "range-52w", label: "52-week high/low" },
];

/** "Alert me when KO closes above $70", or when an indicator says so, on a stock's page, with that stock's alerts below. */
export function AlertCard({ symbol, price }: { symbol: string; price: number }) {
  const { account, addAlert, removeAlert } = useAccount();
  const [kind, setKind] = useState<Kind>("price");
  const [direction, setDirection] = useState<PriceAlert["direction"]>("above");
  const [priceText, setPriceText] = useState(() => (Math.round(price * 1.05 * 100) / 100).toFixed(2));
  const [level, setLevel] = useState("70");
  const [days, setDays] = useState("200");
  const [percent, setPercent] = useState("5");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const id = useId();
  if (!account) return null;
  const alerts = (account.alerts ?? []).filter((a) => a.symbol === symbol);

  const condition = (): AlertCondition | undefined => {
    switch (kind) {
      case "rsi":
        return { kind: "rsi", days: 14, level: Number(level) };
      case "sma-cross":
        return { kind: "sma-cross", days: Number(days) };
      case "move":
        return { kind: "move", percent: Number(percent) };
      case "range-52w":
        return { kind: "range-52w" };
      default:
        return undefined;
    }
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const c = condition();
    const result = await addAlert({ symbol, direction, price: c ? price : Number(priceText), ...(c && { condition: c }) });
    setStatus(result.ok ? { ok: true, text: "Alert set. It's checked at each day's close." } : { ok: false, text: result.message });
  }

  const directionLabels: Record<Kind, [string, string]> = {
    price: ["closes at or above", "closes at or below"],
    rsi: ["RSI(14) rises above", "RSI(14) falls below"],
    "sma-cross": ["closes above its", "closes below its"],
    move: ["rises", "falls"],
    "range-52w": ["makes a new 52-week high", "makes a new 52-week low"],
  };

  return (
    <Card aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
        Alert
      </h2>
      <div role="radiogroup" aria-label="Alert type" className="mt-3 flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="radio"
            aria-checked={kind === k.kind}
            onClick={() => {
              setKind(k.kind);
              setStatus(null);
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${kind === k.kind ? "bg-accent-fill text-white" : "bg-foreground/[0.06] text-muted hover:text-foreground"}`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <form onSubmit={submit} noValidate className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          Tell me when {symbol}
          <select
            value={direction}
            onChange={(e) => {
              const next = e.target.value as PriceAlert["direction"];
              setDirection(next);
              if (kind === "price") setPriceText((Math.round(price * (next === "above" ? 1.05 : 0.95) * 100) / 100).toFixed(2));
              if (kind === "rsi") setLevel(next === "above" ? "70" : "30");
            }}
            className={`${field} mt-1 block`}
          >
            <option value="above">{directionLabels[kind][0]}</option>
            <option value="below">{directionLabels[kind][1]}</option>
          </select>
        </label>
        {kind === "price" && (
          <label className="text-xs text-muted">
            Price ($)
            <input type="number" inputMode="decimal" min={0} step="0.01" value={priceText} onChange={(e) => setPriceText(e.target.value)} className={`${field} mt-1 block w-28`} />
          </label>
        )}
        {kind === "rsi" && (
          <label className="text-xs text-muted">
            Level (0–100)
            <input type="number" inputMode="decimal" min={1} max={99} value={level} onChange={(e) => setLevel(e.target.value)} className={`${field} mt-1 block w-24`} />
          </label>
        )}
        {kind === "sma-cross" && (
          <label className="text-xs text-muted">
            Average (days)
            <input type="number" inputMode="numeric" min={5} max={250} value={days} onChange={(e) => setDays(e.target.value)} className={`${field} mt-1 block w-24`} />
          </label>
        )}
        {kind === "move" && (
          <label className="text-xs text-muted">
            By at least (%) in a day
            <input type="number" inputMode="decimal" min={0.5} max={50} step="0.5" value={percent} onChange={(e) => setPercent(e.target.value)} className={`${field} mt-1 block w-24`} />
          </label>
        )}
        <button
          type="submit"
          className="h-10 rounded-full bg-accent-fill px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Set alert
        </button>
      </form>
      <p role="status" className={`mt-2 min-h-4 text-xs ${status?.ok === false ? "text-loss" : "text-muted"}`}>
        {status?.text ?? (kind === "price" ? "" : "Checked on each day's close, using prices adjusted for splits.")}
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
            {describeAlert(a)}
            <span className={`block text-xs ${a.triggeredAt ? "text-accent" : "text-muted"}`}>
              {a.triggeredAt && a.triggerPrice
                ? `Triggered ${formatDate(a.triggeredAt)}: closed at ${formatCurrency(a.triggerPrice)}`
                : `Waiting · set ${formatDate(a.createdAt)}`}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            aria-label={`Remove alert: ${a.symbol} ${describeAlert(a)}`}
            className="shrink-0 rounded-full px-3 py-1 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-loss focus-visible:outline-2 focus-visible:outline-accent"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
