"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { analyticsAllowed, CONSENT_COOKIE, CONSENT_DAYS, cookieValue, parseConsent, serializeConsent, shouldAsk, type Consent } from "@/lib/consent";

/**
 * The cookie choice in the browser (rules in lib/consent.ts): reading and
 * saving it, the banner that asks, and the analytics that wait for a yes.
 * The choice is read after the page loads (there's no cookie on the server's
 * pre-rendered pages), so nothing here changes the page's first paint.
 */

const CHANGED = "marketlab:consent";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

/** The cookie's value if it holds a current choice, else "": a string, so React can tell when it changes. */
function readRaw() {
  const value = cookieValue(document.cookie, CONSENT_COOKIE);
  return parseConsent(value, Date.now()) ? value! : "";
}

/** The saved choice, or null; undefined on the server and before hydration. */
export function useConsent(): Consent | null | undefined {
  const raw = useSyncExternalStore(subscribe, readRaw, () => undefined);
  return raw === undefined ? undefined : parseConsent(raw);
}

/** Whether the browser sends the Global Privacy Control signal (a "don't track me" setting). */
export function useGpc(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true,
    () => false,
  );
}

/**
 * Saves a choice. Turning analytics off once its scripts have loaded reloads
 * the page: a loaded script can't be unloaded, only not loaded again.
 */
export function saveConsent(analytics: boolean) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent({ analytics, at: Date.now() })}; Max-Age=${CONSENT_DAYS * 86_400}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(CHANGED));
  // Vercel's scripts are served from /_vercel/insights/ and /_vercel/speed-insights/.
  if (!analytics && document.querySelector('script[src*="/_vercel/"]')) location.reload();
}

/** Vercel Web Analytics and Speed Insights, only on a site that has them (`available`) and only with a yes. */
export function ConsentedAnalytics({ available }: { available: boolean }) {
  const consent = useConsent();
  if (!available || !analyticsAllowed(consent ?? null)) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}

const buttonClass =
  "h-10 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Asks once about analytics, on a site that has it. Both answers are the same
 * size and weight: saying no is as easy as saying yes. It sits above the
 * phone tab bar and doesn't block the page.
 */
export function ConsentBanner({ available }: { available: boolean }) {
  const consent = useConsent();
  const gpc = useGpc();
  if (consent === undefined || !shouldAsk({ available, consent, gpc })) return null;
  return (
    <section
      aria-label="Cookie choices"
      className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl animate-fade-up rounded-2xl border border-border bg-surface p-4 text-sm shadow-2xl shadow-black/20 md:bottom-4"
    >
      <p>
        MarketLab uses cookies only to keep you signed in and remember your portfolio. With your OK, we&apos;d also measure visits and page speed with
        Vercel Analytics, which sets no cookies and never sees your name or email.{" "}
        <Link href="/privacy/cookies" className="text-accent underline-offset-2 hover:underline">
          Cookie settings
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => saveConsent(true)} className={`${buttonClass} bg-accent-fill text-white hover:opacity-90`}>
          Allow analytics
        </button>
        <button type="button" onClick={() => saveConsent(false)} className={`${buttonClass} bg-accent-fill text-white hover:opacity-90`}>
          Essential only
        </button>
      </div>
    </section>
  );
}
