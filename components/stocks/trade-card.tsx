"use client";

import { useId, useState, type FormEvent } from "react";
import { useAccount, type Journal } from "@/components/account/account-provider";
import { JournalFields } from "@/components/account/journal-fields";
import { BookSwitcher } from "@/components/account/book-switcher";
import { Card } from "@/components/ui/card";
import { Explain } from "@/components/ui/explain";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { bracketProblem, describeBracket, describeOrder, placePendingOrder as previewPending, type NewOrder } from "@/lib/orders";
import { buyingPower, placeOrder as previewOrder, roundCents, SHORT_MARGIN, type Bracket, type Order, type PendingOrder, type Trail } from "@/lib/trading";
import type { StockQuote } from "@/lib/types";

type Status = { tone: "success" | "error"; text: string } | null;
type Side = Order["side"] | "short";
type Kind = "market" | PendingOrder["type"];

const KINDS: { value: Kind; label: string; help: string }[] = [
  { value: "market", label: "Market", help: "Fills now, at today's price." },
  { value: "limit", label: "Limit", help: "Buys at or below your price, or sells at or above it." },
  { value: "stop", label: "Stop", help: "Once the price passes your level: sells if it falls to it, or buys if it rises to it." },
  { value: "trailing", label: "Trailing stop", help: "A stop that follows the price: it stays a set distance from the best close since you placed it, and never moves back." },
];

const SIDES: { value: Side; label: string }[] = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "short", label: "Short" },
];

const field =
  "h-10 min-w-0 rounded-lg border border-border bg-transparent px-3 text-base tabular-nums outline-none transition-colors focus-visible:border-accent aria-invalid:border-loss";

/** A number typed in a field, or undefined while it's empty. */
const typed = (text: string) => (text.trim() === "" ? undefined : Number(text));

/**
 * Buy, sell or sell short this stock. A market order fills at today's price;
 * a limit, stop or trailing stop order waits for a close that reaches its
 * price (lib/orders.ts). An order that opens a position can carry a
 * stop-loss and a take-profit (a bracket), and the sizing helper works out
 * how many shares risk a set amount at that stop. As you type, the order is
 * run through the same rules that will apply it (without saving), so the
 * preview and any error match what happens when you submit.
 *
 * The page passes the quote in, so this works for any stock, not just the
 * ones whose prices the whole app already has.
 */
export function TradeCard({ quote }: { quote: StockQuote }) {
  const { account, book, quotes, placeOrder, placePendingOrder } = useAccount();
  const [side, setSide] = useState<Side>("buy");
  const [kind, setKind] = useState<Kind>("market");
  const [sharesText, setSharesText] = useState("");
  const [priceText, setPriceText] = useState("");
  const [duration, setDuration] = useState<PendingOrder["duration"]>("gtc");
  const [trailKind, setTrailKind] = useState<Trail["kind"]>("percent");
  const [trailText, setTrailText] = useState("5");
  const [stopText, setStopText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [riskText, setRiskText] = useState("");
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
  const orderSide: Order["side"] = side === "buy" ? "buy" : "sell";
  const short = side === "short";
  const covering = side === "buy" && held < 0;
  // A trailing stop protects a position: selling one you own, or buying back a short.
  const canTrail = (side === "sell" && held > 0) || covering;
  const effectiveKind: Kind = kind === "trailing" && !canTrail ? "market" : kind;
  // Only an order that opens a position can carry a bracket.
  const canBracket = ((side === "buy" && held >= 0) || short) && effectiveKind !== "trailing";
  const shares = Number(sharesText);
  const orderPrice = effectiveKind === "market" || effectiveKind === "trailing" ? price : Number(priceText);
  const total = roundCents(shares * orderPrice);
  const why: Journal = { ...(journal.reason && { reason: journal.reason }), ...(journal.note?.trim() && { note: journal.note.trim() }) };
  const trail: Trail | undefined = effectiveKind === "trailing" ? { kind: trailKind, value: Number(trailText) } : undefined;
  const stop = canBracket ? typed(stopText) : undefined;
  const target = canBracket ? typed(targetText) : undefined;
  const bracket: Bracket | undefined = stop !== undefined || target !== undefined ? { ...(stop !== undefined && { stop }), ...(target !== undefined && { target }) } : undefined;
  const pendingInput: NewOrder = {
    symbol,
    side: orderSide,
    type: effectiveKind === "market" ? "limit" : effectiveKind,
    shares,
    price: orderPrice,
    duration,
    ...(short && { short }),
    ...(trail && { trail }),
    ...(bracket && { bracket }),
    ...why,
  };
  const marks = Object.fromEntries(Object.values({ ...quotes, [symbol]: quote }).map((q) => [q.symbol, q.price]));
  // A dry run of the real rules. The ID and time don't matter for a preview.
  const preview =
    sharesText === "" || (effectiveKind !== "market" && effectiveKind !== "trailing" && priceText === "")
      ? null
      : effectiveKind === "market"
        ? (() => {
            const problem = bracketProblem(bracket, short, price);
            return problem ? ({ ok: false, message: problem } as const) : previewOrder(account, { symbol, side: orderSide, shares, price, id: "preview", time: 0, ...(short && { short }) }, marks);
          })()
        : previewPending(account, pendingInput, "preview", 0, price);
  const error = preview && !preview.ok ? preview.message : null;

  // The most shares this order could be for: what the buying power covers, what you own, or what's short.
  const power = buyingPower(account, marks);
  let max = covering ? -held : side === "buy" ? (orderPrice > 0 ? Math.floor(power / orderPrice) : 0) : short ? (orderPrice > 0 && held <= 0 ? Math.floor(power / (orderPrice * (SHORT_MARGIN - 1))) : 0) : Math.max(0, held);
  while (side === "buy" && !covering && max > 0 && roundCents(max * orderPrice) > power) max--; // guard against rounding up past the cash

  // Position sizing: shares that lose about the amount at risk if the stop-loss fills.
  const risk = typed(riskText);
  const perShare = stop !== undefined ? Math.abs(orderPrice - stop) : undefined;
  const sized = risk !== undefined && risk > 0 && perShare ? Math.min(Math.floor(risk / perShare), max) : undefined;

  const hint = (() => {
    if (error) return error;
    if (covering) return `You're short ${-held} ${-held === 1 ? "share" : "shares"}: buying covers them`;
    if (side === "buy") return power < account.cash ? `${formatCurrency(power)} buying power (some cash is set aside for shorts or puts)` : `${formatCurrency(account.cash)} cash available`;
    if (short) return held > 0 ? `You own ${held} ${held === 1 ? "share" : "shares"}: sell those before selling short` : `${formatCurrency(power)} buying power; a short sets aside half its value again`;
    return held < 0 ? `You're short ${-held}: choose Buy to cover` : `You own ${held} ${held === 1 ? "share" : "shares"}`;
  })();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!preview?.ok || pending) return;
    setPending(true);
    const result =
      effectiveKind === "market" ? await placeOrder(quote, orderSide, shares, why, { ...(short && { short }), ...(bracket && { bracket }) }) : await placePendingOrder(pendingInput, price);
    setPending(false);
    if (!result.ok) return setStatus({ tone: "error", text: result.message });
    const verb = covering ? "Bought back" : side === "buy" ? "Bought" : short ? "Sold short" : "Sold";
    setStatus({
      tone: "success",
      text:
        effectiveKind === "market"
          ? `${verb} ${shares} ${shares === 1 ? "share" : "shares"} of ${symbol} for ${formatCurrency(total)}${bracket ? `${describeBracket(bracket, formatCurrency)} placed` : ""}.`
          : `Order placed: ${describeOrder({ ...pendingInput, price: preview.ok && "order" in preview ? preview.order.price : orderPrice }, formatCurrency)}. It's checked at each day's close.`,
    });
    setSharesText("");
    setStopText("");
    setTargetText("");
    setJournal({});
  }

  const submitLabel = !preview?.ok
    ? SIDES.find((s) => s.value === side)!.label
    : effectiveKind === "market"
      ? `${covering ? "Buy back" : side === "buy" ? "Buy" : short ? "Sell short" : "Sell"} ${shares} ${symbol} · ${formatCurrency(total)}`
      : `Place ${KINDS.find((k) => k.value === effectiveKind)!.label.toLowerCase()} order`;

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
        <fieldset className="grid grid-cols-3 gap-1 rounded-full bg-foreground/5 p-1 text-sm font-medium">
          <legend className="sr-only">Buy, sell or sell short</legend>
          {SIDES.map((option) => (
            <label
              key={option.value}
              className="cursor-pointer rounded-full py-1.5 text-center text-muted transition-colors has-checked:bg-surface has-checked:text-foreground has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-accent"
            >
              <input
                type="radio"
                name="side"
                value={option.value}
                checked={side === option.value}
                onChange={() => {
                  setSide(option.value);
                  reset();
                }}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        {short && (
          <p className="-mt-2 flex items-start gap-1.5 text-xs text-muted">
            <span>Sell borrowed shares now and buy them back later: you gain if the price falls. Shorts pay a borrow fee and any dividends.</span>
            <Explain term="shortSelling" className="mt-px" />
          </p>
        )}

        <div>
          <label htmlFor={`${hintId}-kind`} className="text-xs text-muted">
            Order type
          </label>
          <select
            id={`${hintId}-kind`}
            value={effectiveKind}
            onChange={(e) => {
              const next = e.target.value as Kind;
              setKind(next);
              if ((next === "limit" || next === "stop") && priceText === "") setPriceText(price.toFixed(2));
              reset();
            }}
            aria-describedby={`${hintId}-kind-help`}
            className={`${field} mt-1 w-full`}
          >
            {KINDS.filter((k) => k.value !== "trailing" || canTrail).map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <p id={`${hintId}-kind-help`} className="mt-1 flex items-start gap-1.5 text-xs text-muted">
            <span>{KINDS.find((k) => k.value === effectiveKind)?.help}</span>
            {effectiveKind !== "market" && <Explain term={effectiveKind === "limit" ? "limitOrder" : effectiveKind === "trailing" ? "trailingStop" : "stopOrder"} className="mt-px" />}
          </p>
        </div>

        {(effectiveKind === "limit" || effectiveKind === "stop" || effectiveKind === "trailing") && (
          <div className="grid grid-cols-2 gap-2">
            {effectiveKind === "trailing" ? (
              <div>
                <label htmlFor={`${hintId}-trail`} className="text-xs text-muted">
                  Trail by
                </label>
                <div className="mt-1 flex gap-1">
                  <input
                    id={`${hintId}-trail`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={trailKind === "percent" ? "0.5" : "0.01"}
                    value={trailText}
                    onChange={(e) => {
                      setTrailText(e.target.value);
                      reset();
                    }}
                    className={`${field} w-full`}
                  />
                  <select aria-label="Trail in" value={trailKind} onChange={(e) => setTrailKind(e.target.value as Trail["kind"])} className={`${field} w-16 px-2`}>
                    <option value="percent">%</option>
                    <option value="amount">$</option>
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor={`${hintId}-price`} className="text-xs text-muted">
                  {effectiveKind === "limit" ? "Limit price" : "Stop price"}
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
            )}
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
            {hint}
          </p>
        </div>

        {canBracket && (
          <details className="group rounded-lg border border-border px-3 py-2" open={!!(stopText || targetText)}>
            <summary className="tap cursor-pointer text-sm font-medium">
              Protect it <span className="font-normal text-muted">Optional: a stop-loss, a take-profit, and sizing by risk</span>
            </summary>
            <div className="mt-3 space-y-3">
              <p className="flex items-start gap-1.5 text-xs text-muted">
                <span>
                  When this order fills, both are placed as orders at each close. Whichever fills first cancels the other.
                </span>
                <Explain term="bracketOrder" className="mt-px" />
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["stop", "Stop-loss", stopText, setStopText],
                    ["target", "Take-profit", targetText, setTargetText],
                  ] as const
                ).map(([key, label, text, set]) => (
                  <div key={key}>
                    <label htmlFor={`${hintId}-${key}`} className="text-xs text-muted">
                      {label}
                    </label>
                    <input
                      id={`${hintId}-${key}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      placeholder={(short === (key === "stop") ? price * 1.1 : price * 0.9).toFixed(2)}
                      value={text}
                      onChange={(e) => {
                        set(e.target.value);
                        reset();
                      }}
                      className={`${field} mt-1 w-full`}
                    />
                  </div>
                ))}
              </div>
              <div>
                {/* The ⓘ sits beside the label, not in it: its hidden explanation would become part of the field's name. */}
                <div className="flex items-center gap-1.5">
                  <label htmlFor={`${hintId}-risk`} className="text-xs text-muted">
                    Risk at most ($)
                  </label>
                  <Explain term="positionSizing" />
                </div>
                <div className="mt-1 flex gap-2">
                  <input
                    id={`${hintId}-risk`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="1"
                    placeholder={String(Math.round(Math.max(0, account.cash) * 0.01))}
                    value={riskText}
                    onChange={(e) => setRiskText(e.target.value)}
                    aria-describedby={`${hintId}-risk-help`}
                    className={`${field} flex-1`}
                  />
                  <button
                    type="button"
                    disabled={!sized}
                    onClick={() => {
                      setSharesText(String(sized));
                      reset();
                    }}
                    className="h-10 rounded-lg px-3 text-sm font-medium text-accent transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent disabled:text-muted disabled:hover:bg-transparent"
                  >
                    {sized ? `Use ${sized}` : "Size it"}
                  </button>
                </div>
                <p id={`${hintId}-risk-help`} className="mt-1 text-xs text-muted">
                  {perShare
                    ? `${formatCurrency(perShare)} a share from ${effectiveKind === "market" ? "today's price" : "your price"} to the stop${sized !== undefined ? `: ${sized} shares lose about ${formatCurrency(sized * perShare)} if it fills at that level` : ""}. A stop fills at the close, which can be worse after a jump.`
                    : "Set a stop-loss, then the most you'd lose if it fills: this works out the shares. Many traders risk about 1% of their account on a trade."}
                </p>
              </div>
            </div>
          </details>
        )}

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
          {effectiveKind === "market" && (
            <div className="flex justify-between">
              <dt className="text-muted">Cash after</dt>
              <dd>{preview?.ok && "trade" in preview ? formatCurrency(preview.account.cash) : "—"}</dd>
            </div>
          )}
          {short && preview?.ok && (
            <div className="flex justify-between">
              <dt className="text-muted">Set aside while short</dt>
              <dd>{formatCurrency(roundCents(total * SHORT_MARGIN))}</dd>
            </div>
          )}
        </dl>
        {effectiveKind !== "market" && preview?.ok && "order" in preview && (
          <p className="text-xs text-muted">
            {describeOrder({ ...pendingInput, price: preview.order.price }, formatCurrency)}. It fills at that close, which can be better than your price, or worse after a jump in price.
          </p>
        )}

        <button
          type="submit"
          disabled={!preview?.ok || pending}
          className={`h-10 w-full rounded-full text-sm font-medium text-white transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 ${
            side === "buy" ? "bg-accent-fill" : "bg-loss-fill"
          } enabled:hover:opacity-90`}
        >
          {submitLabel}
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
