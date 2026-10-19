/**
 * Plain-English explanations of the terms MarketLab uses. One place for all
 * of them, so the ⓘ buttons next to numbers and the /learn page always say
 * the same thing. Each has a one-line definition and a short "why it
 * matters", with an example where one helps.
 */

export interface Term {
  title: string;
  /** One sentence: what it is. */
  short: string;
  /** A few sentences: how to read it, and why it matters. */
  more: string;
  group: "Measuring results" | "Orders and trading" | "Strategies" | "Company numbers";
}

export const GLOSSARY = {
  totalReturn: {
    title: "Total return",
    short: "How much the money grew or shrank over the whole period, as a percentage.",
    more: "$10,000 that became $12,000 is a +20% total return. It says nothing about how long it took, or how bumpy the ride was: compare it with the annual return and the drawdown.",
    group: "Measuring results",
  },
  cagr: {
    title: "Annual return (CAGR)",
    short: "The steady yearly growth that would end at the same value: the compound annual growth rate.",
    more: "It makes periods of different lengths comparable. +50% over 5 years is about +8.4% a year, because each year grows on the last. Real years are never that smooth.",
    group: "Measuring results",
  },
  maxDrawdown: {
    title: "Max drawdown",
    short: "The biggest fall from a high point to a later low, before a new high.",
    more: "A −30% drawdown means that at the worst moment you'd have watched 30% disappear from the peak. It's a good guide to how painful a strategy is to stick with, which matters as much as its return.",
    group: "Measuring results",
  },
  volatility: {
    title: "Volatility",
    short: "How much the value swings from day to day, scaled to a year.",
    more: "It's the standard deviation of daily returns × √252 (trading days in a year). A broad index is often around 15%; a single tech stock can be 40% or more. Higher volatility means a wider range of outcomes, good and bad.",
    group: "Measuring results",
  },
  sharpe: {
    title: "Sharpe ratio",
    short: "Return per unit of volatility: how much you were paid for the bumps.",
    more: "Average daily return ÷ its standard deviation, scaled to a year (here with a 0% risk-free rate). Around 1 is good over long periods; two strategies with the same return can have very different Sharpe ratios.",
    group: "Measuring results",
  },
  exposure: {
    title: "Time invested",
    short: "The share of days with money in the market rather than all in cash.",
    more: "A strategy that's out of the market half the time can't earn the market's return on those days, but it also avoids its falls.",
    group: "Measuring results",
  },
  benchmark: {
    title: "Benchmark",
    short: "What a result is compared with: buying and holding the same stocks, or an index like the S&P 500.",
    more: "A strategy that made +40% while simply holding made +60% did worse than doing nothing. The benchmark is the honest yardstick.",
    group: "Measuring results",
  },
  overfitting: {
    title: "Overfitting",
    short: "Tuning settings until they fit past ups and downs that won't repeat.",
    more: "Try enough settings and one will look brilliant by luck. The test is whether neighboring settings also do well, and whether it holds up on a period you didn't tune it on.",
    group: "Strategies",
  },
  sma: {
    title: "Moving average (SMA)",
    short: "The average closing price over the last N days, recalculated each day.",
    more: "It smooths out daily noise. A price above its 200-day average is often read as an uptrend; a short average crossing above a long one is a classic \"golden cross\" buy signal.",
    group: "Strategies",
  },
  ema: {
    title: "Exponential average (EMA)",
    short: "A moving average that gives recent days more weight.",
    more: "It reacts faster than a simple average of the same length, so it turns sooner, including on false alarms.",
    group: "Strategies",
  },
  rsi: {
    title: "RSI",
    short: "The Relative Strength Index: a 0–100 score of how strongly the price has been rising versus falling lately (usually over 14 days).",
    more: "Above 70 is often called overbought and below 30 oversold, but a strong trend can stay there a long time. It's a measure of momentum, not a promise of a turn.",
    group: "Strategies",
  },
  limitOrder: {
    title: "Limit order",
    short: "Buy at or below a price, or sell at or above one.",
    more: "You choose the worst price you'll accept, at the cost of maybe never filling. Here orders are checked at each day's close, and fill at that close.",
    group: "Orders and trading",
  },
  stopOrder: {
    title: "Stop order",
    short: "Sell once the price falls to a level (a stop-loss), or buy once it rises to one.",
    more: "A stop decides when to act, not the price: after a sudden drop it fills at the next price available, which can be well below the stop.",
    group: "Orders and trading",
  },
  dividend: {
    title: "Dividend",
    short: "Cash a company pays its shareholders, usually every quarter.",
    more: "You get it for shares held before the ex-dividend date. The share price usually drops by about the dividend that day, so it's part of your return, not free money.",
    group: "Orders and trading",
  },
  split: {
    title: "Stock split",
    short: "A company divides each share into several cheaper ones: in a 2-for-1 split, 10 shares at $200 become 20 at $100.",
    more: "Your holding is worth the same before and after. Here, any fraction of a share is paid out in cash.",
    group: "Orders and trading",
  },
  adjustedPrice: {
    title: "Adjusted price",
    short: "Past prices rescaled for later splits and dividends, so a whole history compares like for like.",
    more: "Charts and backtests use adjusted prices, so a split doesn't look like a crash. Trades use the price as it actually traded.",
    group: "Orders and trading",
  },
  peRatio: {
    title: "P/E ratio",
    short: "Price ÷ earnings per share: how many dollars investors pay for each dollar of yearly profit.",
    more: "A P/E of 30 means paying 30 years of today's profit. High P/Es usually mean investors expect fast growth; they also leave less room for disappointment.",
    group: "Company numbers",
  },
  marketCap: {
    title: "Market cap",
    short: "What the whole company is worth on the stock market: share price × number of shares.",
    more: "It's the fair way to compare company sizes: a $50 stock can be a bigger company than a $500 one.",
    group: "Company numbers",
  },
} as const satisfies Record<string, Term>;

export type TermKey = keyof typeof GLOSSARY;

export const TERM_KEYS = Object.keys(GLOSSARY) as TermKey[];
