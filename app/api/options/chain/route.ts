import { pythonConfigured } from "@/lib/backtest/python-client";
import { catalogEntry } from "@/lib/market/catalog";
import { getChain } from "@/lib/options/server";

/** GET /api/options/chain?symbol=AAPL: a stock's simulated option chain (lib/options/server.ts). */
export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "";
  if (!catalogEntry(symbol)) return Response.json({ error: "Choose one of MarketLab's stocks." }, { status: 400 });
  if (!pythonConfigured()) return Response.json({ error: "The options lab needs the analytics service, which isn't running." }, { status: 503 });
  const result = await getChain(symbol);
  return result.ok ? Response.json({ chain: result.chain }) : Response.json({ error: result.message }, { status: 503 });
}
