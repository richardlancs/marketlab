/**
 * The trading calendar: which days the market is open, and which day's close
 * is the latest one. Days are represented as timestamps at 00:00 UTC.
 * Holidays are ignored (real data sources simply have no bar for them).
 */

export const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/**
 * A bar's `time` is its day plus this: 20:00 UTC, the 4 PM New York close in
 * summer (and 3 PM in winter, still the same calendar day in New York). Using
 * a time during the New York day keeps dates from shifting when formatted in
 * New York time, which 00:00 UTC would (it's the evening before there).
 */
export const CLOSE_OFFSET = 20 * HOUR;

export const isTradingDay = (day: number) => {
  const weekday = new Date(day).getUTCDay(); // 0 = Sunday, 6 = Saturday
  return weekday !== 0 && weekday !== 6;
};

const newYorkParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  hourCycle: "h23",
});

/**
 * The exact moment of the 4 PM New York close on `day` (00:00 UTC): 20:00 UTC
 * in summer (daylight saving time), 21:00 UTC in winter.
 */
export function newYorkClose(day: number): number {
  const at = day + CLOSE_OFFSET;
  const hour = Number(newYorkParts.formatToParts(at).find((p) => p.type === "hour")?.value);
  return at + (16 - hour) * HOUR;
}

/**
 * The latest trading day whose close has happened by `now`: today once it's
 * 4 PM or later in New York on a weekday, otherwise the previous weekday.
 */
export function latestClosedTradingDay(now: number): number {
  const parts = Object.fromEntries(newYorkParts.formatToParts(now).map((p) => [p.type, p.value]));
  let day = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  if (!isTradingDay(day) || Number(parts.hour) < 16) day -= DAY;
  while (!isTradingDay(day)) day -= DAY;
  return day;
}

/** The `count` trading days ending at `lastDay` (included), oldest first. */
export function tradingDaysEndingAt(lastDay: number, count: number): number[] {
  const days: number[] = [];
  for (let day = lastDay; days.length < count; day -= DAY) {
    if (isTradingDay(day)) days.unshift(day);
  }
  return days;
}

/** Trading days after `firstDay` (excluded) up to `lastDay` (included), oldest first. */
export function tradingDaysAfter(firstDay: number, lastDay: number): number[] {
  const days: number[] = [];
  for (let day = firstDay + DAY; day <= lastDay; day += DAY) {
    if (isTradingDay(day)) days.push(day);
  }
  return days;
}
