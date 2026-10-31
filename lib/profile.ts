/**
 * The rules for what a person can set on their profile and which of their
 * data they can erase, shared by the account page (components/account/settings)
 * and the Server Actions that enforce them (lib/profile-actions.ts). No
 * database or server code here, so the browser can check as you type and the
 * server checks again: anyone can call an action without the page.
 */

/** The longest name, in characters. */
export const NAME_LENGTH = 50;

/**
 * A name as it will be saved: whitespace collapsed and trimmed, or null if
 * it's empty, too long, or holds control or invisible formatting characters
 * (which could make one name look like another).
 */
export function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!name || [...name].length > NAME_LENGTH) return null;
  if (/[\p{Cc}\p{Cf}]/u.test(name)) return null;
  return name;
}

/** The biggest picture the server accepts. The browser makes a 256 × 256 one of about 10–40 KB. */
export const AVATAR_BYTES = 200 * 1024;
/** The size the browser crops pictures to, in pixels. */
export const AVATAR_SIZE = 256;

export type AvatarType = "image/webp" | "image/jpeg" | "image/png";

/**
 * What kind of image `bytes` are, from their first bytes, or null if they're
 * not a WebP, JPEG or PNG. The file's name and the type the browser claims
 * are never trusted; SVG, which can hold scripts, is never accepted.
 */
export function sniffImage(bytes: Uint8Array): AvatarType | null {
  const starts = (sig: number[], at = 0) => bytes.length >= at + sig.length && sig.every((b, i) => bytes[at + i] === b);
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"; // "RIFF" … "WEBP"
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}

/** Where a user's own picture is served, with its version so a new one is never hidden by a cached old one. */
export const AVATAR_PATH = "/api/account/avatar";
export const avatarUrl = (version: string) => `${AVATAR_PATH}?v=${version}`;

/**
 * Whether `image` (the session's user.image) is a picture this site serves.
 * Anything else (an address someone stored some other way) is never shown:
 * the page would otherwise load it from another site.
 */
export const isOwnAvatar = (image: string | null | undefined): image is string => !!image && /^\/api\/account\/avatar\?v=[0-9a-f]{8,64}$/.test(image);

/** The kinds of data a person can erase without deleting their account (lib/db/personal-data.ts). */
export const DATA_KINDS = ["portfolio", "watchlist", "backtests", "lessons", "community", "notifications", "picture"] as const;
export type DataKind = (typeof DATA_KINDS)[number];

/** What each kind holds, as the account page lists it. */
export const DATA_KIND_INFO: Record<DataKind, { label: string; detail: string }> = {
  portfolio: {
    label: "Practice portfolio",
    detail: "Cash, holdings, trades and their notes, orders, options, dividends and the daily value history. You start again with the starter portfolio, and leave the all-time leaderboard.",
  },
  watchlist: { label: "Watchlist and alerts", detail: "The stocks you follow and your price and indicator alerts." },
  backtests: { label: "Saved backtests", detail: "Saved backtests, historical screens and machine-learning runs." },
  lessons: { label: "Lesson progress", detail: "Quiz answers, scores and passed lessons." },
  community: {
    label: "Leaderboard and competitions",
    detail: "Your all-time leaderboard entry, every season entry with its portfolio and standings, and your badges.",
  },
  notifications: { label: "Notification settings", detail: "Alert emails (turned off) and every device signed up for push alerts." },
  picture: { label: "Profile picture", detail: "The picture on your account." },
};

/** Guests have no profile picture, leaderboard entries or alert emails. */
export const GUEST_DATA_KINDS: readonly DataKind[] = ["portfolio", "watchlist", "backtests", "lessons", "notifications"];

/** `value` as a list of known kinds without repeats, or null if it isn't one. */
export function parseDataKinds(value: unknown): DataKind[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > DATA_KINDS.length) return null;
  if (!value.every((v): v is DataKind => typeof v === "string" && (DATA_KINDS as readonly string[]).includes(v))) return null;
  return [...new Set(value)];
}

/** What a person types to confirm deleting their account. */
export const DELETE_PHRASE = "delete my account";
export const isDeletePhrase = (value: unknown) => typeof value === "string" && value.trim().toLowerCase() === DELETE_PHRASE;

/**
 * How recently someone without a password (a Google-only account) must have
 * signed in to delete their account: proof it's them, not someone at a
 * computer they left signed in.
 */
export const RECENT_SIGN_IN = 10 * 60 * 1000;
