import { post, PythonEngineError, pythonConfigured } from "@/lib/backtest/python-client";
import { allow } from "@/lib/rate-limit";

/** What each action is called on the analytics service (services/analytics/analytics/options.py), which validates the inputs. */
const ACTIONS = { price: "v1/options/price", "implied-volatility": "v1/options/implied-volatility", payoff: "v1/options/payoff" } as const;

/**
 * POST /api/options/price | implied-volatility | payoff: the options lab's
 * calculator, implied-volatility solver and strategy payoffs. Nothing here
 * is about anyone's account: it's arithmetic on the numbers sent.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/options/[action]">) {
  const { action } = await ctx.params;
  const path = ACTIONS[action as keyof typeof ACTIONS];
  if (!path) return Response.json({ error: "Unknown options action." }, { status: 404 });
  if (!pythonConfigured()) return Response.json({ error: "The options lab needs the analytics service, which isn't running." }, { status: 503 });
  if (!(await allow("options", 120, 60))) return Response.json({ error: "That's a lot of calculations. Wait a minute and try again." }, { status: 429 });
  const body = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) return Response.json({ error: "Send the numbers as JSON." }, { status: 400 });
  try {
    return Response.json(await post(path, body, `Options ${action}`));
  } catch (error) {
    const message = error instanceof PythonEngineError ? error.message.replace(/^The analytics service refused these settings: /, "") : "That couldn't be calculated. Try again in a minute.";
    return Response.json({ error: message }, { status: 422 });
  }
}
