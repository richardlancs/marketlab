import { syncPrices } from "@/lib/analytics/server";
import { parseGoalPlan, PLAN_LIMITS } from "@/lib/analytics/plan";
import { post, pythonConfigured } from "@/lib/backtest/python-client";
import { currentBook } from "@/lib/books";
import { accounts } from "@/lib/db";
import { getStockDetail, priceSource } from "@/lib/market";
import { currentOwner } from "@/lib/owner";
import { allow } from "@/lib/rate-limit";
import { visitorAccount } from "@/lib/visitor-account";

/**
 * POST /api/portfolio/plan { monthly, years, target, inflation }: the goal
 * planner for this visitor's portfolio (signed in or a guest), calculated
 * by the analytics service (services/analytics/analytics/plan.py). Only the
 * plan's settings come from the request; the holdings and cash are read
 * here, on the server.
 */
export async function POST(request: Request) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const monthly = Number(input?.monthly ?? 0);
  const years = Number(input?.years ?? 10);
  const target = input?.target === null || input?.target === undefined || input?.target === "" ? null : Number(input.target);
  const inflation = input?.inflation === true;
  if (!Number.isFinite(monthly) || Math.abs(monthly) > PLAN_LIMITS.maxMonthly) return json({ error: `Monthly amounts can be up to ${PLAN_LIMITS.maxMonthly.toLocaleString()} dollars either way.` }, 400);
  if (!Number.isInteger(years) || years < 1 || years > PLAN_LIMITS.maxYears) return json({ error: `Plan between 1 and ${PLAN_LIMITS.maxYears} years.` }, 400);
  if (target !== null && (!Number.isFinite(target) || target <= 0 || target > 1e12)) return json({ error: "The target should be a positive amount." }, 400);
  if (!pythonConfigured()) return json({ error: "The goal planner needs the analytics service, which isn't running." }, 503);
  if (!(await allow("portfolio-analysis", 20, 60))) return json({ error: "You're planning a lot. Wait a minute and try again." }, 429);

  const owner = await currentOwner({ create: false });
  const book = await currentBook(owner);
  const account = (owner && (await accounts.load(book?.accountId ?? owner.id))) || (await visitorAccount());
  const held = account.holdings.filter((h) => h.shares > 0);
  const details = await Promise.all(held.map((h) => getStockDetail(h.symbol)));
  const holdings = held.flatMap((h, i) => {
    const detail = details[i];
    return detail?.status === "ok" ? [{ symbol: h.symbol, value: h.shares * detail.stock.price }] : [];
  });

  try {
    if (holdings.length) await syncPrices(holdings.map((h) => h.symbol));
    const data = await post("/v1/analytics/plan", { source: priceSource(), holdings, cash: account.cash, monthly, years, target, inflation }, "Goal plan");
    const plan = parseGoalPlan(data.plan);
    if (!plan) return json({ error: "The plan came back in a form MarketLab couldn't read." }, 502);
    return json({ plan });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The goal planner failed. Try again in a minute." }, 503);
  }
}
