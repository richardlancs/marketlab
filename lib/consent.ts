/**
 * Cookie and tracking choices (the banner and /privacy/cookies). MarketLab's
 * cookies are all needed for it to work (signing in, the guest portfolio,
 * which portfolio you trade in), so they're always on. The one optional
 * thing is analytics: Vercel Web Analytics and Speed Insights, which set no
 * cookies but do measure visits, so they load only after a yes.
 *
 * The choice is kept in a small cookie the page's scripts can read (it holds
 * nothing about the person), for 180 days; then, or when the version below
 * changes because something new needs asking, the banner asks again.
 *
 * Shared by the browser and the tests: no React or server code here.
 */

export const CONSENT_COOKIE = "marketlab_consent";
/** Raise this when there's something new to ask about, so everyone is asked again. */
export const CONSENT_VERSION = 1;
export const CONSENT_DAYS = 180;

export interface Consent {
  analytics: boolean;
  /** When it was chosen (ms). */
  at: number;
}

/** The cookie's value for a choice: "v1.analytics.1793491200000" or "v1.essential.…". */
export const serializeConsent = (c: Consent) => `v${CONSENT_VERSION}.${c.analytics ? "analytics" : "essential"}.${Math.floor(c.at)}`;

/**
 * The choice in a cookie value, or null if there's none, it's malformed, or
 * from an older version. Given `now`, also null once it's expired (the
 * cookie's own lifetime should already have removed it) or dated in the future.
 */
export function parseConsent(value: string | null | undefined, now?: number): Consent | null {
  const match = /^v(\d+)\.(analytics|essential)\.(\d{1,16})$/.exec(value ?? "");
  if (!match || Number(match[1]) !== CONSENT_VERSION) return null;
  const at = Number(match[3]);
  if (now !== undefined && (at > now + 86_400_000 || now - at > CONSENT_DAYS * 86_400_000)) return null;
  return { analytics: match[2] === "analytics", at };
}

/** A cookie's value in a `document.cookie` string. */
export function cookieValue(cookieString: string, name: string): string | null {
  for (const part of cookieString.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Whether analytics may run: only with a saved yes. Without a choice it
 * doesn't; and the browser's Global Privacy Control signal counts as a no
 * until the person says otherwise on the settings page.
 */
export const analyticsAllowed = (consent: Consent | null) => consent?.analytics === true;

/** Whether to show the banner: analytics exists on this site, nothing is chosen yet, and the browser hasn't already said no (GPC). */
export const shouldAsk = ({ available, consent, gpc }: { available: boolean; consent: Consent | null; gpc: boolean }) => available && !consent && !gpc;

/** Everything MarketLab keeps in your browser, for the cookie settings page. */
export interface StorageItem {
  name: string;
  kind: "Cookie" | "Local storage" | "Session storage" | "Browser feature";
  purpose: string;
  lasts: string;
}

export const ESSENTIAL_STORAGE: StorageItem[] = [
  { name: "better-auth.session_token", kind: "Cookie", purpose: "Keeps you signed in. Hidden from the page's scripts (httpOnly). On the live site its name starts with __Secure-.", lasts: "7 days, renewed while you use the site; deleted when you sign out" },
  { name: "better-auth.state", kind: "Cookie", purpose: "Checks that a Google sign-in that comes back is the one you started.", lasts: "5 minutes, during a Google sign-in" },
  { name: "marketlab_guest", kind: "Cookie", purpose: "Remembers your guest portfolio if you use MarketLab without an account: a random ID, nothing else. Hidden from scripts.", lasts: "400 days; the guest's data is deleted after 180 days unused" },
  { name: "marketlab_book", kind: "Cookie", purpose: "Remembers which portfolio you're trading in: practice or a competition season. Hidden from scripts.", lasts: "400 days, or until you switch back to practice" },
  { name: CONSENT_COOKIE, kind: "Cookie", purpose: "Remembers your choice on this page.", lasts: `${CONSENT_DAYS} days` },
  { name: "marketlab_learner", kind: "Cookie", purpose: "Lesson progress from an older version of MarketLab. No longer set: moved to your account or guest, then deleted, on your next visit.", lasts: "Until your next visit" },
];

export const PREFERENCE_STORAGE: StorageItem[] = [
  { name: "theme, undertone", kind: "Local storage", purpose: "The colour theme you picked.", lasts: "Until you clear it" },
  { name: "marketlab:range", kind: "Local storage", purpose: "The chart period you picked for the small trend charts.", lasts: "Until you clear it" },
  { name: "marketlab:account, marketlab:backtests, learn-progress", kind: "Local storage", purpose: "Portfolios, saved backtests and lesson progress kept in the browser by older versions of MarketLab. Only there if you used one; moved to your account (or guest) when it can be without overwriting anything, then deleted.", lasts: "Until moved" },
  { name: "marketlab:import-tried", kind: "Session storage", purpose: "Makes sure that move is tried only once per visit.", lasts: "Until you close the tab" },
  { name: "Push subscription", kind: "Browser feature", purpose: "Only if you turn on alerts on this device: lets your browser receive MarketLab's notifications.", lasts: "Until you turn them off" },
];

/**
 * The preferences "Clear preferences saved in this browser" removes. Not the
 * older versions' portfolios, backtests and lessons, which may still be
 * waiting to move to the account: clearing them would lose them.
 */
export const PREFERENCE_KEYS = ["theme", "undertone", "marketlab:range"] as const;
