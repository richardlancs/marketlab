/**
 * Custom strategies built from rules, like "buy when RSI(14) is below 30 and
 * the price is above its 200-day average; sell when RSI(14) is above 70".
 * This module defines, validates and describes them, and calculates the
 * indicators (for the rule builder and the Learn demos); the Python analytics
 * service runs the strategies.
 *
 * A rule is plain data (JSON), read by the fixed set of functions below. It is
 * never turned into code, so a saved or shared config can't run anything: the
 * only things it can do are the kinds listed here. Everything is validated
 * like the rest of a config, because saved runs come back from storage.
 */

export type Indicator =
  | { kind: "price" }
  | { kind: "sma"; days: number }
  | { kind: "ema"; days: number }
  | { kind: "rsi"; days: number }
  /** MACD (12/26-day EMAs) and its 9-day signal line: compared with each other. */
  | { kind: "macd" }
  | { kind: "macd-signal" }
  /** Bollinger Bands: the `days`-day average plus or minus 2 standard deviations. */
  | { kind: "bollinger-upper"; days: number }
  | { kind: "bollinger-lower"; days: number }
  /**
   * The Chandelier Exit, a trailing stop: the highest high of the last `days`
   * days minus `multiple` × the average true range (ATR) over them. "Price is
   * below the chandelier" means it fell that far from its recent top.
   */
  | { kind: "chandelier"; days: number; multiple: number }
  /** The day's trading volume, and its `days`-day average (shares). */
  | { kind: "volume" }
  | { kind: "volume-average"; days: number }
  /** A constant, only for comparing with RSI (0 to 100). */
  | { kind: "value"; value: number };

export type Operator = "above" | "below" | "crosses-above" | "crosses-below";

export interface Condition {
  left: Indicator;
  op: Operator;
  right: Indicator;
}

export interface RuleSet {
  /** "all": every condition must hold; "any": at least one. */
  combine: "all" | "any";
  conditions: Condition[];
}

export const RULE_LIMITS = { maxConditions: 4, minDays: 2, maxAverageDays: 250, maxRsiDays: 100, minMultiple: 0.5, maxMultiple: 10 };

export const OPERATOR_NAMES: Record<Operator, string> = {
  above: "is above",
  below: "is below",
  "crosses-above": "crosses above",
  "crosses-below": "crosses below",
};

export type Unit = "dollars" | "score" | "macd" | "shares";

/** Prices, averages, bands and stops are in dollars; RSI is a 0–100 score; MACD is its own scale; volume is shares. Only like can be compared with like. */
export const unitOf = (indicator: Pick<Indicator, "kind">): Unit =>
  indicator.kind === "rsi" || indicator.kind === "value"
    ? "score"
    : indicator.kind === "macd" || indicator.kind === "macd-signal"
      ? "macd"
      : indicator.kind === "volume" || indicator.kind === "volume-average"
        ? "shares"
        : "dollars";

/** Whether the indicator needs each day's high, low or volume (not just the close). */
export const needsBars = (indicator: Pick<Indicator, "kind">) => indicator.kind === "chandelier" || indicator.kind === "volume" || indicator.kind === "volume-average";
export const ruleSetNeedsBars = (rules: RuleSet) => rules.conditions.some((c) => needsBars(c.left) || needsBars(c.right));

export function indicatorName(indicator: Indicator): string {
  switch (indicator.kind) {
    case "price":
      return "price";
    case "sma":
      return `${indicator.days}-day average`;
    case "ema":
      return `${indicator.days}-day EMA`;
    case "rsi":
      return `RSI(${indicator.days})`;
    case "macd":
      return "MACD";
    case "macd-signal":
      return "MACD signal";
    case "bollinger-upper":
      return `upper Bollinger band (${indicator.days})`;
    case "bollinger-lower":
      return `lower Bollinger band (${indicator.days})`;
    case "chandelier":
      return `chandelier stop (${indicator.days} days, ${indicator.multiple}× ATR)`;
    case "volume":
      return "volume";
    case "volume-average":
      return `${indicator.days}-day average volume`;
    case "value":
      return String(indicator.value);
  }
}

/** "RSI(14) is below 30 and price is above 200-day average". */
export const describeRuleSet = (rules: RuleSet) =>
  rules.conditions.map((c) => `${indicatorName(c.left)} ${OPERATOR_NAMES[c.op]} ${indicatorName(c.right)}`).join(rules.combine === "all" ? " and " : " or ");

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isDays = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= RULE_LIMITS.minDays && (v as number) <= max;

export function parseIndicator(value: unknown): Indicator | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "price":
      return { kind: "price" };
    case "sma":
    case "ema":
      return isDays(value.days, RULE_LIMITS.maxAverageDays) ? { kind: value.kind, days: value.days } : null;
    case "rsi":
      return isDays(value.days, RULE_LIMITS.maxRsiDays) ? { kind: "rsi", days: value.days } : null;
    case "macd":
    case "macd-signal":
      return { kind: value.kind };
    case "bollinger-upper":
    case "bollinger-lower":
    case "volume-average":
      return isDays(value.days, RULE_LIMITS.maxAverageDays) ? { kind: value.kind, days: value.days } : null;
    case "chandelier":
      return isDays(value.days, RULE_LIMITS.maxRsiDays) && typeof value.multiple === "number" && value.multiple >= RULE_LIMITS.minMultiple && value.multiple <= RULE_LIMITS.maxMultiple
        ? { kind: "chandelier", days: value.days, multiple: value.multiple }
        : null;
    case "volume":
      return { kind: "volume" };
    case "value":
      return typeof value.value === "number" && value.value >= 0 && value.value <= 100 ? { kind: "value", value: value.value } : null;
    default:
      return null;
  }
}

const OPERATORS: readonly Operator[] = ["above", "below", "crosses-above", "crosses-below"];

export function parseCondition(value: unknown): Condition | null {
  if (!isRecord(value) || !OPERATORS.includes(value.op as Operator)) return null;
  const left = parseIndicator(value.left);
  const right = parseIndicator(value.right);
  // A constant only ever sits on the right ("RSI is below 30"), and both sides must be in the same unit.
  if (!left || !right || left.kind === "value" || unitOf(left) !== unitOf(right)) return null;
  return { left, op: value.op as Operator, right };
}

export function parseRuleSet(value: unknown): RuleSet | null {
  if (!isRecord(value) || (value.combine !== "all" && value.combine !== "any") || !Array.isArray(value.conditions)) return null;
  if (value.conditions.length < 1 || value.conditions.length > RULE_LIMITS.maxConditions) return null;
  const conditions: Condition[] = [];
  for (const c of value.conditions) {
    const parsed = parseCondition(c);
    if (!parsed) return null;
    conditions.push(parsed);
  }
  return { combine: value.combine, conditions };
}

// ---------------------------------------------------------------------------
// Indicators, computed one close at a time
// ---------------------------------------------------------------------------

/**
 * A running indicator: feed it closes in order, and after each one it returns
 * its value so far (NaN while it doesn't have enough history yet). Running
 * totals keep a whole backtest at one step per day, instead of re-adding up
 * to 250 closes every day.
 */
export interface Bar {
  close: number;
  high: number;
  low: number;
  volume: number;
}
type Stream = (bar: Bar) => number;
/** A stream on closes alone, as most indicators are. */
const onClose =
  (step: (close: number) => number): Stream =>
  (bar) =>
    step(bar.close);

function smaStream(days: number): (value: number) => number {
  const window: number[] = [];
  let sum = 0;
  return (close) => {
    window.push(close);
    sum += close;
    if (window.length > days) sum -= window.shift() as number;
    return window.length === days ? sum / days : Number.NaN;
  };
}

/** Exponential moving average, started from the simple average of the first `days` closes. */
function emaStream(days: number): (value: number) => number {
  const alpha = 2 / (days + 1);
  const start = smaStream(days);
  let ema = Number.NaN;
  return (close) => {
    if (Number.isNaN(ema)) {
      ema = start(close);
      return ema;
    }
    ema = alpha * close + (1 - alpha) * ema;
    return ema;
  };
}

/**
 * Relative Strength Index with Wilder's smoothing: 100 − 100 / (1 + average
 * gain / average loss) over `days` daily changes. Only gains: 100. Flat: 50.
 */
function rsiStream(days: number): (close: number) => number {
  let previous = Number.NaN;
  let count = 0;
  let gain = 0;
  let loss = 0;
  return (close) => {
    if (!Number.isNaN(previous)) {
      const change = close - previous;
      const up = Math.max(change, 0);
      const down = Math.max(-change, 0);
      count++;
      if (count <= days) {
        gain += up / days;
        loss += down / days;
      } else {
        gain = (gain * (days - 1) + up) / days;
        loss = (loss * (days - 1) + down) / days;
      }
    }
    previous = close;
    if (count < days) return Number.NaN;
    if (loss === 0) return gain === 0 ? 50 : 100;
    return 100 - 100 / (1 + gain / loss);
  };
}

/** The MACD line: the 12-day EMA minus the 26-day EMA (both fed every close). */
function macdStream(): (close: number) => number {
  const fast = emaStream(12);
  const slow = emaStream(26);
  return (close) => {
    const a = fast(close);
    const b = slow(close);
    return a - b;
  };
}

/** The MACD signal line: the 9-day EMA of the MACD line, fed once the line exists. */
function macdSignalStream(): (close: number) => number {
  const line = macdStream();
  const signal = emaStream(9);
  return (close) => {
    const value = line(close);
    return Number.isNaN(value) ? Number.NaN : signal(value);
  };
}

/** A Bollinger band: the `days`-day average plus (`side` 1) or minus (−1) 2 population standard deviations, summed left to right. */
function bollingerStream(days: number, side: 1 | -1): (close: number) => number {
  const window: number[] = [];
  return (close) => {
    window.push(close);
    if (window.length > days) window.shift();
    if (window.length < days) return Number.NaN;
    let sum = 0;
    for (const x of window) sum = sum + x;
    const mean = sum / days;
    let squares = 0;
    for (const x of window) squares = squares + (x - mean) ** 2;
    return mean + side * 2 * Math.sqrt(squares / days);
  };
}

/**
 * The Chandelier Exit: the highest high of the last `days` bars minus
 * `multiple` × ATR(`days`). ATR is Wilder's average true range: the average
 * of the first `days` true ranges, then (ATR × (days − 1) + TR) / days. A
 * day's true range is the largest of high − low, |high − previous close| and
 * |low − previous close| (just high − low on the first day).
 */
function chandelierStream(days: number, multiple: number): Stream {
  const highs: number[] = [];
  let previousClose = Number.NaN;
  let count = 0;
  let atr = 0;
  return ({ high, low, close }) => {
    const range = Number.isNaN(previousClose) ? high - low : Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
    previousClose = close;
    count++;
    atr = count <= days ? atr + range / days : (atr * (days - 1) + range) / days;
    highs.push(high);
    if (highs.length > days) highs.shift();
    if (count < days) return Number.NaN;
    let top = highs[0];
    for (const h of highs) if (h > top) top = h;
    return top - multiple * atr;
  };
}

function streamFor(indicator: Indicator): Stream {
  switch (indicator.kind) {
    case "price":
      return ({ close }) => close;
    case "sma":
      return onClose(smaStream(indicator.days));
    case "ema":
      return onClose(emaStream(indicator.days));
    case "rsi":
      return onClose(rsiStream(indicator.days));
    case "macd":
      return onClose(macdStream());
    case "macd-signal":
      return onClose(macdSignalStream());
    case "bollinger-upper":
      return onClose(bollingerStream(indicator.days, 1));
    case "bollinger-lower":
      return onClose(bollingerStream(indicator.days, -1));
    case "chandelier":
      return chandelierStream(indicator.days, indicator.multiple);
    case "volume":
      return ({ volume }) => volume;
    case "volume-average": {
      const average = smaStream(indicator.days);
      return ({ volume }) => average(volume);
    }
    case "value":
      return () => indicator.value;
  }
}

/** Bars from closes alone: high and low at the close, no volume. Enough for every indicator but the chandelier and volume. */
const closeBars = (closes: readonly number[]): Bar[] => closes.map((close) => ({ close, high: close, low: close, volume: Number.NaN }));

/** The indicator's value after each close, for tests, charts and alerts. */
export const indicatorSeries = (indicator: Indicator, closes: readonly number[]): number[] => indicatorSeriesFromBars(indicator, closeBars(closes));

/** The indicator's value after each bar. */
export const indicatorSeriesFromBars = (indicator: Indicator, bars: readonly Bar[]): number[] => {
  const stream = streamFor(indicator);
  return bars.map(stream);
};

export const RULE_PRESETS: { name: string; entry: RuleSet; exit: RuleSet }[] = [
  {
    name: "RSI oversold bounce",
    entry: { combine: "all", conditions: [{ left: { kind: "rsi", days: 14 }, op: "below", right: { kind: "value", value: 30 } }] },
    exit: { combine: "all", conditions: [{ left: { kind: "rsi", days: 14 }, op: "above", right: { kind: "value", value: 70 } }] },
  },
  {
    name: "Price above 200-day average",
    entry: { combine: "all", conditions: [{ left: { kind: "price" }, op: "above", right: { kind: "sma", days: 200 } }] },
    exit: { combine: "all", conditions: [{ left: { kind: "price" }, op: "below", right: { kind: "sma", days: 200 } }] },
  },
  {
    name: "Golden cross",
    entry: { combine: "all", conditions: [{ left: { kind: "sma", days: 50 }, op: "above", right: { kind: "sma", days: 200 } }] },
    exit: { combine: "all", conditions: [{ left: { kind: "sma", days: 50 }, op: "below", right: { kind: "sma", days: 200 } }] },
  },
];
