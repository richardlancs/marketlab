/**
 * Paper options: the rules for buying and selling contracts from the options
 * lab's simulated chain (services/analytics/analytics/options.py). Pure
 * functions, like lib/trading.ts.
 *
 * - A contract is European, for 100 shares, and settled in cash at expiry:
 *   at the expiry day's close it pays what it's worth then (a call the
 *   close above the strike, a put the strike above the close, else nothing).
 * - You can buy calls and puts, and sell ones you own. You can also write
 *   (sell to open) two kinds, and nothing riskier:
 *   - a covered call: 100 shares you own per contract are set aside, and
 *     can't be sold while it's open;
 *   - a cash-secured put: the strike × 100 per contract is set aside in cash.
 * - Trades are at the chain's price at the latest close, less or plus a
 *   half-spread (OPTION_SPREAD), so a round trip costs something, as it would.
 */
import { buyingPower, callReserve, roundCents, type Account, type OptionContract, type OptionPosition, type Trade, type TradeResult } from "./trading";

/** Half the bid-ask spread, as a share of the premium, and at least this much a share. */
export const OPTION_SPREAD = 0.02;
export const MIN_OPTION_SPREAD = 0.05;
/** The most option positions at once, and contracts in one order. */
export const MAX_OPTION_POSITIONS = 10;
export const MAX_CONTRACTS = 100;

/** A chain's expiry date (YYYY-MM-DD) as the account stores it: noon UTC that day, so that day's close is the first at or after it. */
export const expiryTime = (date: string) => Date.parse(`${date}T12:00:00Z`);

/** A contract's id in an account: one position per stock, kind, strike and expiry. */
export const contractId = (symbol: string, c: OptionContract) => `${symbol}:${c.kind}:${c.strike}:${c.expiry}`;

/** What one share of the option is worth at expiry for this close. */
export function optionValue(c: Pick<OptionContract, "kind" | "strike">, close: number): number {
  return roundCents(Math.max(0, c.kind === "call" ? close - c.strike : c.strike - close));
}

/** The price you'd trade at: the chain's price, plus half the spread to buy, less it to sell (never below a cent). */
export function tradePrice(mid: number, side: "buy" | "sell"): number {
  const half = Math.max(MIN_OPTION_SPREAD, mid * OPTION_SPREAD);
  return roundCents(side === "buy" ? mid + half : Math.max(0.01, mid - half));
}

export interface OptionOrder {
  symbol: string;
  contract: OptionContract;
  side: "buy" | "sell";
  contracts: number;
  /** The premium per share it fills at (from tradePrice). */
  price: number;
  id: string;
  time: number;
  /** The latest close: a contract that has expired by then can't be traded. */
  asOf: number;
  note?: string;
}

const fail = (message: string): TradeResult => ({ ok: false, error: "invalid-shares", message });

/** Fills an option order, or explains why it can't be filled. */
export function placeOptionOrder(account: Account, order: OptionOrder): TradeResult {
  const { symbol, contract, side, contracts, price } = order;
  if (!Number.isInteger(contracts) || contracts <= 0 || contracts > MAX_CONTRACTS) return fail(`Enter a whole number of contracts from 1 to ${MAX_CONTRACTS}.`);
  if (!Number.isFinite(price) || price <= 0) return fail("This option has no valid price.");
  if ((contract.kind !== "call" && contract.kind !== "put") || !(contract.strike > 0)) return fail("That option isn't valid.");
  if (contract.expiry <= order.asOf) return fail("That option has expired.");

  const id = contractId(symbol, contract);
  const options = account.options ?? [];
  const position = options.find((o) => o.id === id);
  const held = position?.contracts ?? 0;
  const total = roundCents(contracts * 100 * price);
  const trade = (realizedGain?: number): Trade => ({
    id: order.id,
    symbol,
    side,
    shares: contracts,
    price,
    time: order.time,
    option: { kind: contract.kind, strike: contract.strike, expiry: contract.expiry },
    ...(realizedGain !== undefined && { realizedGain }),
    ...(order.note && { note: order.note }),
  });
  const withPosition = (contractsAfter: number, averagePremium: number): OptionPosition[] =>
    contractsAfter === 0
      ? options.filter((o) => o.id !== id)
      : position
        ? options.map((o) => (o.id === id ? { ...o, contracts: contractsAfter, averagePremium } : o))
        : [...options, { id, symbol, ...contract, contracts: contractsAfter, averagePremium }];

  if (side === "buy" && held < 0) {
    // Buying back an option you wrote.
    if (contracts > -held) return fail(`You wrote ${-held} of these: buy up to ${-held} to close them.`);
    if (total > account.cash) return fail("You don't have enough cash to buy these back.");
    const t = trade(roundCents(contracts * 100 * (position!.averagePremium - price)));
    return { ok: true, trade: t, account: { ...account, cash: roundCents(account.cash - total), options: withPosition(held + contracts, position!.averagePremium), trades: [t, ...account.trades] } };
  }
  if (side === "buy") {
    if (!position && options.length >= MAX_OPTION_POSITIONS) return fail(`You can hold up to ${MAX_OPTION_POSITIONS} option positions. Close one to make room.`);
    if (total > buyingPower(account)) return fail("You don't have enough buying power for these contracts.");
    const average = (held * (position?.averagePremium ?? 0) + contracts * price) / (held + contracts);
    const t = trade();
    return { ok: true, trade: t, account: { ...account, cash: roundCents(account.cash - total), options: withPosition(held + contracts, average), trades: [t, ...account.trades] } };
  }
  if (held > 0) {
    // Selling options you own.
    if (contracts > held) return fail(`You own ${held} of these: sell up to ${held}.`);
    const t = trade(roundCents(contracts * 100 * (price - position!.averagePremium)));
    return { ok: true, trade: t, account: { ...account, cash: roundCents(account.cash + total), options: withPosition(held - contracts, position!.averagePremium), trades: [t, ...account.trades] } };
  }

  // Writing: covered calls and cash-secured puts only.
  if (!position && options.length >= MAX_OPTION_POSITIONS) return fail(`You can hold up to ${MAX_OPTION_POSITIONS} option positions. Close one to make room.`);
  const average = (-held * (position?.averagePremium ?? 0) + contracts * price) / (-held + contracts);
  const after: Account = { ...account, cash: roundCents(account.cash + total), options: withPosition(held - contracts, average) };
  if (contract.kind === "call") {
    const shares = account.holdings.find((h) => h.symbol === symbol)?.shares ?? 0;
    const free = shares - callReserve(account, symbol);
    if (free < contracts * 100) return fail(`A covered call needs 100 shares you own per contract, not already covering calls: you have ${Math.max(0, free)} ${symbol} free.`);
  } else if (buyingPower(after) < 0) {
    return fail(`A cash-secured put sets aside the strike × 100 per contract (${formatMoney(contracts * 100 * contract.strike)}), and you don't have enough buying power.`);
  }
  const t = trade();
  return { ok: true, trade: t, account: { ...after, trades: [t, ...account.trades] } };
}

/**
 * Settles a position at expiry (or when a split it can't follow ends it) at
 * what it's worth for `close`: an owned option is sold for it, a written one
 * bought back for it, as a trade at that price, so history and the review see
 * it like any other.
 */
export function settleOption(account: Account, position: OptionPosition, close: number, time: number): Account {
  const value = optionValue(position, close);
  const contracts = Math.abs(position.contracts);
  const owned = position.contracts > 0;
  const cash = roundCents((owned ? 1 : -1) * contracts * 100 * value);
  const trade: Trade = {
    // Unique across every account (trade ids are), so random rather than built from the contract.
    id: crypto.randomUUID(),
    symbol: position.symbol,
    side: owned ? "sell" : "buy",
    shares: contracts,
    price: value,
    time,
    option: { kind: position.kind, strike: position.strike, expiry: position.expiry },
    realizedGain: roundCents(contracts * 100 * (owned ? value - position.averagePremium : position.averagePremium - value)),
    note: value > 0 ? "Settled in cash at expiry." : "Expired worthless.",
  };
  return { ...account, cash: roundCents(account.cash + cash), options: (account.options ?? []).filter((o) => o.id !== position.id), trades: [trade, ...account.trades] };
}

const formatMoney = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
