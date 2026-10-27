/**
 * The trade review's server side (lib/review): reads the visitor's account
 * here, never from the request, and sends it with its stocks' closes to the
 * analytics service (services/analytics/analytics/review.py). Server-only.
 */
import "server-only";
import { syncPrices } from "../analytics/server";
import { currentBook } from "../books";
import { accounts } from "../db";
import { post, PythonEngineError } from "../backtest/python-client";
import { getMarket, getStockDetail, priceSource } from "../market";
import { currentOwner } from "../owner";
import { relevantSymbols } from "../portfolio-history";
import { visitorAccount } from "../visitor-account";
import { parseReview, type ReviewResult } from "./types";

type Outcome<T> = { ok: true; result: T } | { ok: false; message: string };
const failed = (error: unknown): { ok: false; message: string } => ({ ok: false, message: error instanceof PythonEngineError ? error.message : "The review couldn't run. Try again in a minute." });
const unreadable = { ok: false as const, message: "The review came back in a form MarketLab couldn't read." };

/** The request body: the account (practice or season book), its stocks' closes as traded, and the S&P 500. */
async function reviewBody() {
  const owner = await currentOwner({ create: false });
  // The portfolio being traded in: practice, or a season's (lib/books.ts).
  const book = await currentBook(owner);
  const [account, market] = await Promise.all([owner ? accounts.load(book?.accountId ?? owner.id) : null, getMarket()]).then(async ([a, m]) => [a ?? (await visitorAccount()), m] as const);
  const index = market.indices.find((i) => i.symbol === "SPX") ?? market.indices[0];
  const symbols = relevantSymbols(account);
  const details = await Promise.all(symbols.map(getStockDetail));
  const history: Record<string, { times: number[]; prices: number[] }> = {};
  details.forEach((detail, i) => {
    if (detail?.status === "ok") history[symbols[i]] = { times: detail.stock.raw.map((p) => p.time), prices: detail.stock.raw.map((p) => p.price) };
  });
  const body = {
    source: priceSource(),
    account: {
      cash: account.cash,
      holdings: account.holdings.map(({ symbol, shares, averageCost }) => ({ symbol, shares, averageCost })),
      trades: account.trades.map(({ time, symbol, side, shares, price, realizedGain, reason }) => ({ time, symbol, side, shares, price, realizedGain: realizedGain ?? null, reason: reason ?? null })),
      events: (account.events ?? []).map(({ time, kind, symbol, shares, cash, sharesAfter }) => ({ time, kind, symbol, shares, cash, sharesAfter: sharesAfter ?? null })),
    },
    history,
    index: { times: index.history.map((p) => p.time), prices: index.history.map((p) => p.price) },
  };
  return { body, symbols };
}

export async function loadReview(): Promise<Outcome<ReviewResult>> {
  try {
    const { body, symbols } = await reviewBody();
    if (body.account.trades.length === 0) return { ok: true, result: { status: "no-trades" } };
    await syncPrices(["SPX", ...symbols]);
    const data = await post("/v1/portfolio/review", body, "Trade review");
    const result = parseReview(data.review);
    return result ? { ok: true, result } : unreadable;
  } catch (error) {
    return failed(error);
  }
}
