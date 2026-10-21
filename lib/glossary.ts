/**
 * Plain-English explanations of the terms MarketLab uses. One place for all
 * of them, so the ⓘ buttons next to numbers, the /learn page and each
 * lesson's opening line always say the same thing. Each has a one-line
 * definition and a short "why it matters", with an example where one helps.
 *
 * The order here is the suggested learning path: /learn lists the terms in
 * this order, and each lesson's "Next" link follows it.
 */

export const GROUPS = ["Investing basics", "Measuring results", "Orders and trading", "Company numbers", "Indicators", "Strategies"] as const;

export interface Term {
  title: string;
  /** One sentence: what it is. */
  short: string;
  /** A few sentences: how to read it, and why it matters. */
  more: string;
  group: (typeof GROUPS)[number];
}

export const GLOSSARY = {
  compounding: {
    title: "Compounding",
    short: "Growth on top of growth: each year's gains start earning gains of their own.",
    more: "$10,000 growing 7% a year becomes about $19,700 after 10 years, not $17,000, because every year's 7% applies to a bigger amount. Time is what makes it powerful, which is why starting early matters so much.",
    group: "Investing basics",
  },
  diversification: {
    title: "Diversification",
    short: "Spreading money across many investments so no single one can sink the whole.",
    more: "Stocks don't all fall at once or for the same reasons, so a mix swings less than its parts. It lowers the risk of one company's bad news without giving up the market's average return.",
    group: "Investing basics",
  },
  etf: {
    title: "ETFs and index funds",
    short: "Funds that buy a whole basket of stocks, often a full index like the S&P 500, in one share.",
    more: "One purchase spreads your money over hundreds of companies, for a small yearly fee. They're the simplest way to get the market's return, which most professional stock pickers fail to beat after costs.",
    group: "Investing basics",
  },
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
  volatility: {
    title: "Volatility",
    short: "How much the value swings from day to day, scaled to a year.",
    more: "It's the standard deviation of daily returns × √252 (trading days in a year). A broad index is often around 15%; a single tech stock can be 40% or more. Higher volatility means a wider range of outcomes, good and bad.",
    group: "Measuring results",
  },
  maxDrawdown: {
    title: "Max drawdown",
    short: "The biggest fall from a high point to a later low, before a new high.",
    more: "A −30% drawdown means that at the worst moment you'd have watched 30% disappear from the peak. It's a good guide to how painful a strategy is to stick with, which matters as much as its return.",
    group: "Measuring results",
  },
  valueAtRisk: {
    title: "Value at Risk",
    short: "A bad-day loss: the one-day fall that was only exceeded on the worst 5% of days.",
    more: "A one-day 95% VaR of 2% means that over the past year, only about 1 day in 20 lost more than 2%. Expected shortfall goes further: the average loss on those worst days. Neither is a limit; the worst days can be much worse.",
    group: "Measuring results",
  },
  sharpe: {
    title: "Sharpe ratio",
    short: "Return per unit of volatility: how much you were paid for the bumps.",
    more: "Average daily return ÷ its standard deviation, scaled to a year (here with a 0% risk-free rate). Around 1 is good over long periods; two strategies with the same return can have very different Sharpe ratios.",
    group: "Measuring results",
  },
  correlation: {
    title: "Correlation",
    short: "How closely two investments' daily returns move together, on a scale from −1 to 1.",
    more: "1 means they rise and fall in lockstep, 0 means no link, and below 0 means they tend to move opposite ways. The lower the correlation between holdings, the more they smooth each other out, which is what makes diversification work.",
    group: "Measuring results",
  },
  beta: {
    title: "Beta",
    short: "How much a stock tends to move when the whole market moves.",
    more: "A beta of 1.5 means it has typically moved about 1.5% for every 1% the market moved, up or down. Below 1 is calmer than the market. It measures market-linked swings only, not a company's own surprises.",
    group: "Measuring results",
  },
  benchmark: {
    title: "Benchmark",
    short: "What a result is compared with: buying and holding the same stocks, or an index like the S&P 500.",
    more: "A strategy that made +40% while simply holding made +60% did worse than doing nothing. The benchmark is the honest yardstick.",
    group: "Measuring results",
  },
  exposure: {
    title: "Time invested",
    short: "The share of days with money in the market rather than all in cash.",
    more: "A strategy that's out of the market half the time can't earn the market's return on those days, but it also avoids its falls.",
    group: "Measuring results",
  },
  monteCarlo: {
    title: "Monte Carlo simulation",
    short: "Running thousands of possible futures, built from past returns, to see the range of outcomes.",
    more: "Instead of one guess, it shows a spread: a middle path, the outcomes most paths land between, and how often money is lost. It's only as good as the past it's built from, so treat it as a picture of uncertainty, not a forecast.",
    group: "Measuring results",
  },
  marketOrder: {
    title: "Market order",
    short: "Buy or sell right away, at whatever the current price is.",
    more: "It's the simplest order and always fills, but you don't choose the price. Here a market order fills at the latest close straight away.",
    group: "Orders and trading",
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
  tradingCosts: {
    title: "Trading costs",
    short: "What each trade costs on top of the price: commissions, and slippage from not getting quite the price you saw.",
    more: "Small costs add up fast for strategies that trade often. A backtest without them flatters any strategy that buys and sells a lot.",
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
  marketCap: {
    title: "Market cap",
    short: "What the whole company is worth on the stock market: share price × number of shares.",
    more: "It's the fair way to compare company sizes: a $50 stock can be a bigger company than a $500 one.",
    group: "Company numbers",
  },
  peRatio: {
    title: "P/E ratio",
    short: "Price ÷ earnings per share: how many dollars investors pay for each dollar of yearly profit.",
    more: "A P/E of 30 means paying 30 years of today's profit. High P/Es usually mean investors expect fast growth; they also leave less room for disappointment.",
    group: "Company numbers",
  },
  dividendYield: {
    title: "Dividend yield",
    short: "A year of dividends as a percentage of the share price.",
    more: "A $100 stock paying $3 a year yields 3%. A very high yield can be a warning rather than a bargain: it often means the price fell because investors doubt the dividend will last.",
    group: "Company numbers",
  },
  sma: {
    title: "Moving average (SMA)",
    short: "The average closing price over the last N days, recalculated each day.",
    more: "It smooths out daily noise. A price above its 200-day average is often read as an uptrend; a short average crossing above a long one is a classic \"golden cross\" buy signal.",
    group: "Indicators",
  },
  ema: {
    title: "Exponential average (EMA)",
    short: "A moving average that gives recent days more weight.",
    more: "It reacts faster than a simple average of the same length, so it turns sooner, including on false alarms.",
    group: "Indicators",
  },
  rsi: {
    title: "RSI",
    short: "The Relative Strength Index: a 0–100 score of how strongly the price has been rising versus falling lately (usually over 14 days).",
    more: "Above 70 is often called overbought and below 30 oversold, but a strong trend can stay there a long time. It's a measure of momentum, not a promise of a turn.",
    group: "Indicators",
  },
  macd: {
    title: "MACD",
    short: "Moving Average Convergence Divergence: the gap between a 12-day and a 26-day exponential average, compared with its own 9-day average.",
    more: "When the gap is above zero, the short-term trend is running ahead of the longer one. Traders watch for the MACD line crossing its signal line as a sign that momentum is turning. Like every trend tool, it lags and gives false signals in choppy markets.",
    group: "Indicators",
  },
  bollingerBands: {
    title: "Bollinger Bands",
    short: "Two lines drawn 2 standard deviations above and below a 20-day average, so they widen when prices swing more.",
    more: "A close near the upper band is high compared with the last month's range, and one near the lower band is low. Narrow bands mean a calm stretch, which often comes before a bigger move, in either direction.",
    group: "Indicators",
  },
  buyAndHold: {
    title: "Buy and hold",
    short: "Buy good investments and keep them for years, whatever the market does in between.",
    more: "It trades almost never, so costs and taxes stay low, and it never misses the market's best days. The hard part is sitting through the falls. It's the benchmark most other strategies fail to beat.",
    group: "Strategies",
  },
  dollarCostAveraging: {
    title: "Dollar-cost averaging",
    short: "Investing a fixed amount at regular intervals instead of all at once.",
    more: "The same dollars buy more shares when prices are low and fewer when they're high. Investing a lump sum at once usually ends higher, because markets rise more often than they fall, but spreading it out softens the regret of buying right before a drop.",
    group: "Strategies",
  },
  rebalancing: {
    title: "Rebalancing",
    short: "Selling some of what grew and buying what shrank, to get back to the mix you chose.",
    more: "Left alone, the winners take over a portfolio and its risk drifts upward. Rebalancing on a schedule keeps the risk where you set it, and quietly makes you sell high and buy low.",
    group: "Strategies",
  },
  maCrossover: {
    title: "Moving-average crossover",
    short: "A trend-following strategy: hold a stock while its short average is above its long one, and step aside when it falls below.",
    more: "It aims to ride long uptrends and dodge long downtrends. The price is lag and whipsaws: it always buys after a rise has started and sells after a fall has begun, and choppy markets trigger false signals.",
    group: "Strategies",
  },
  momentum: {
    title: "Momentum rotation",
    short: "Each month, hold the few stocks that have risen the most over the last several months, and switch as the leaders change.",
    more: "It bets that recent winners keep winning for a while, which has often held on average but fails sharply when the market turns. An \"only hold stocks that rose\" rule, called dual momentum, moves to cash when nothing is rising.",
    group: "Strategies",
  },
  riskParity: {
    title: "Risk parity",
    short: "Weighting holdings by how calm they are, so each adds about the same amount of risk.",
    more: "A stock half as volatile gets twice the weight. Compared with equal weights, it leans toward steadier holdings, so no single wild one dominates the swings. It aims for balanced risk, not the highest return.",
    group: "Strategies",
  },
  overfitting: {
    title: "Overfitting",
    short: "Tuning settings until they fit past ups and downs that won't repeat.",
    more: "Try enough settings and one will look brilliant by luck. The test is whether neighboring settings also do well, and whether it holds up on a period you didn't tune it on.",
    group: "Strategies",
  },
} as const satisfies Record<string, Term>;

export type TermKey = keyof typeof GLOSSARY;

/** Every term, in learning-path order. */
export const TERM_KEYS = Object.keys(GLOSSARY) as TermKey[];
