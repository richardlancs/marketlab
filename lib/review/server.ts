/**
 * The trade review's server side (lib/review): reads the visitor's account
 * here, never from the request, and sends it with its stocks' closes to the
 * analytics service (services/analytics/analytics/review.py). Server-only.
 */
import "server-only";
import { ensureFactors, syncPrices } from "../analytics/server";
import { currentBook } from "../books";
import { accounts } from "../db";
import { post, PythonEngineError } from "../backtest/python-client";
import { getMarket, getStockDetail, priceSource } from "../market";
import { CATALOG } from "../market/catalog";
import { currentOwner } from "../owner";
import { analyticsAccount, relevantSymbols, stopFills } from "../portfolio-history";
import { visitorAccount } from "../visitor-account";
import { parseAccountLuck, parseReview, type AccountLuck, type ReviewResult } from "./types";

/** The luck check reads every catalog stock's prices and runs 2,000 random traders. */
const LUCK_TIMEOUT_MS = 30_000;

type Outcome<T> = { ok: true; result: T } | { ok: false; message: string };
const failed = (error: unknown): { ok: false; message: string } => ({ ok: false, message: error instanceof PythonEngineError ? error.message : "The review couldn't run. Try again in a minute." });
const unreadable = { ok: false as const, message: "The review came back in a form MarketLab couldn't read." };

/** The request body both endpoints share: the account (practice or season book), its stocks' closes as traded, and the S&P 500. */
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
    account: analyticsAccount(account),
    history,
    index: { times: index.history.map((p) => p.time), prices: index.history.map((p) => p.price) },
    stops: stopFills(account).slice(0, 100),
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

export async function loadAccountLuck(): Promise<Outcome<AccountLuck>> {
  try {
    const { body } = await reviewBody();
    // Random pickers choose from the whole catalog, so its prices must be stored.
    await ensureFactors();
    const data = await post("/v1/portfolio/luck", { ...body, universe: CATALOG.map((s) => s.symbol) }, "Luck check", LUCK_TIMEOUT_MS);
    const result = parseAccountLuck(data.result);
    return result ? { ok: true, result } : unreadable;
  } catch (error) {
    return failed(error);
  }
}
