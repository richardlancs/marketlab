/**
 * Display formatting. The locale and time zone are fixed rather than taken
 * from the user's machine: the server and browser must produce the exact same
 * text, or React reports a hydration mismatch. Market times are shown in New
 * York time, as they are on most US finance sites.
 *
 * Intl formatters are relatively expensive to create, so each is built once.
 */
const LOCALE = "en-US";
const MARKET_TIME_ZONE = "America/New_York";

const currency = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "USD" });
const compactCurrency = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});
const number = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const axisNumber = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const compactNumber = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });
const signedNumber = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const signedPercent = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const signedCurrency = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "USD", signDisplay: "exceptZero" });
const percent = new Intl.NumberFormat(LOCALE, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat(LOCALE, { timeZone: MARKET_TIME_ZONE, month: "short", day: "numeric", year: "numeric" });
const shortDate = new Intl.DateTimeFormat(LOCALE, { timeZone: MARKET_TIME_ZONE, month: "short", day: "numeric" });
const time = new Intl.DateTimeFormat(LOCALE, { timeZone: MARKET_TIME_ZONE, hour: "numeric", minute: "2-digit" });

/** 1234.5 → "$1,234.50" */
export const formatCurrency = (value: number) => currency.format(value);

/** 1234.5 → "+$1,234.50", -20 → "-$20.00" (for gains and losses in dollars) */
export const formatSignedCurrency = (value: number) => signedCurrency.format(value);

/** 2_890_000_000_000 → "$2.89T" (for market caps and large totals) */
export const formatCompactCurrency = (value: number) => compactCurrency.format(value);

/** 6712.4 → "6,712.40" (for index levels, which aren't dollar amounts) */
export const formatNumber = (value: number) => number.format(value);

/** 247.5 → "247.5", 22600 → "22,600" (for chart axis labels: no forced decimals) */
export const formatAxisValue = (value: number) => axisNumber.format(value);

/** 52_300_000 → "52.3M" (for volume) */
export const formatCompactNumber = (value: number) => compactNumber.format(value);

/** 3.2 → "+3.20", -1.5 → "-1.50", 0 → "0.00" */
export const formatChange = (value: number) => signedNumber.format(value);

/** A fraction: 0.0123 → "+1.23%" */
export const formatPercent = (fraction: number) => signedPercent.format(fraction);

/** A fraction without a sign, for sizes rather than changes: 0.25 → "25.0%" */
export const formatShare = (fraction: number) => percent.format(fraction);

/** A timestamp → "Oct 16, 2026" (New York time) */
export const formatDate = (timestamp: number) => date.format(timestamp);

/** A timestamp → "Oct 16" (New York time) */
export const formatShortDate = (timestamp: number) => shortDate.format(timestamp);

/** A timestamp → "9:30 AM" (New York time) */
export const formatTime = (timestamp: number) => time.format(timestamp);
