import { accounts } from "@/lib/db";
import { getMarket, getStockDetail } from "@/lib/market";
import { currentBook } from "@/lib/books";
import { currentOwner } from "@/lib/owner";
import { analyticsAccount, relevantSymbols } from "@/lib/portfolio-history";
import { PythonEngineError, post, SERVICE_DOWN } from "@/lib/backtest/python-client";
import { sliceTimeframe } from "@/lib/chart";
import { TIMEFRAMES, type Timeframe } from "@/lib/types";
import { visitorAccount } from "@/lib/visitor-account";

/**
 * GET /api/portfolio/performance?index=SPX&range=1Y: how this visitor's
 * portfolio (signed in or a guest) has done over the range, next to an
 * index: each day's value and both sides' measures, calculated by the
 * analytics service (services/analytics/analytics/performance.py).
 *
 * The prices are picked here, next to the data, from the server's hourly
 * cache (no data-source requests): the closes as traded of every stock the
 * account has held, and the index's days in the range. The browser gets a few
 * hundred numbers for the range it shows.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const range = (TIMEFRAMES as readonly string[]).includes(params.get("range") ?? "") ? (params.get("range") as Timeframe) : "1Y";
  const [owner, market] = await Promise.all([currentOwner({ create: false }), getMarket()]);
  const index = market.indices.find((i) => i.symbol === params.get("index")) ?? market.indices[0];
  // The portfolio being traded in: practice, or a season's (lib/books.ts).
  const book = await currentBook(owner);
  const account = (owner && (await accounts.load(book?.accountId ?? owner.id))) || (await visitorAccount());

  const symbols = relevantSymbols(account);
  const details = await Promise.all(symbols.map(getStockDetail));
  const history: Record<string, { times: number[]; prices: number[] }> = {};
  details.forEach((detail, i) => {
    if (detail?.status === "ok") history[symbols[i]] = { times: detail.stock.raw.map((p) => p.time), prices: detail.stock.raw.map((p) => p.price) };
  });
  const days = sliceTimeframe(index.history, range);

  let result: Record<string, unknown>;
  try {
    result = await post(
      "v1/portfolio/performance",
      {
        account: analyticsAccount(account),
        history,
        index: { times: days.map((p) => p.time), prices: days.map((p) => p.price) },
        // Whose nightly snapshots to use for past closes (verified here: the session or guest cookie).
        ...(owner && { ownerId: book?.accountId ?? owner.id }),
      },
      "Performance",
    );
  } catch (error) {
    return Response.json({ error: error instanceof PythonEngineError ? error.message : SERVICE_DOWN }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }

  return Response.json(
    { indices: market.indices.map(({ symbol, name }) => ({ symbol, name })), index: { symbol: index.symbol, name: index.name }, range, ...result },
    // Private, per-visitor data: never stored by a browser or CDN cache.
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
