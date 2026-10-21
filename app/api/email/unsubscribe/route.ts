import { verifyUnsubscribeToken } from "@/lib/alert-digest";
import { alertEmails } from "@/lib/db";

/**
 * /api/email/unsubscribe?u=<user>&t=<token>: stops alert emails. The token is
 * signed for that user (lib/alert-digest.ts), so nobody can turn off someone
 * else's emails.
 *
 * - GET (the link in an email) shows a page with a button, so link scanners
 *   that open every link don't unsubscribe anyone.
 * - POST (that button, or a mail app's one-click unsubscribe, RFC 8058) does it.
 */
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} — MarketLab</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;line-height:1.5;color:#1d1d1f}button{font:inherit;background:#0071e3;color:#fff;border:0;border-radius:999px;padding:.6rem 1.2rem;cursor:pointer}a{color:#0071e3}</style>
</head><body><h1>${escape(title)}</h1>${body}</body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function check(request: Request): string | null {
  const params = new URL(request.url).searchParams;
  const userId = params.get("u") ?? "";
  const token = params.get("t") ?? "";
  const secret = process.env.BETTER_AUTH_SECRET;
  return secret && userId && verifyUnsubscribeToken(userId, token, secret) ? userId : null;
}

const INVALID = () => page("This link doesn't work", `<p>It may be incomplete. You can turn alert emails off on your <a href="/watchlist">watchlist page</a>.</p>`, 400);

export async function GET(request: Request) {
  if (!check(request)) return INVALID();
  const action = new URL(request.url);
  return page(
    "Stop alert emails?",
    `<p>You'll stop getting emails when your MarketLab alerts trigger. Alerts still show in the app.</p><form method="post" action="${escape(action.pathname + action.search)}"><button type="submit">Stop alert emails</button></form>`,
  );
}

export async function POST(request: Request) {
  const userId = check(request);
  if (!userId) return INVALID();
  await alertEmails.setEnabled(userId, false);
  return page("You're unsubscribed", `<p>No more alert emails. You can turn them back on any time on your <a href="/watchlist">watchlist page</a>.</p>`);
}
