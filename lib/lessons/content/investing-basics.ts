import type { TermKey } from "../../glossary";
import { backtestLink } from "../links";
import type { Lesson } from "../types";

export const INVESTING_BASICS_LESSONS: Partial<Record<TermKey, Lesson>> = {
  compounding: {
    why: [
      "Most people picture growth as a straight line: earn 7% a year for ten years and you've made 70%. Investments don't work like that. Each year's gain is added to the pile, and next year's 7% is worked out on the bigger pile. The extra is small at first and enormous later, so the line bends upward.",
      "That bend is why time matters more than almost anything else in investing. Someone who starts ten years earlier with the same money and the same return doesn't end up a little ahead; they can end up with about twice as much. It's also why fees, taxes and debt, which compound too, deserve more attention than their small percentages suggest.",
    ],
    how: {
      paragraphs: [
        "With simple growth, you earn the same dollar amount every year, because the percentage is always applied to what you started with. With compound growth, the percentage is applied to the current value, which already includes earlier gains. Gains earn gains, and those gains earn gains of their own.",
        "For stocks, compounding happens when you leave the money invested: price gains stay in, and [[dividend|dividends]] are reinvested to buy more shares. Spending the gains each year turns compound growth back into simple growth.",
        "A handy shortcut is the rule of 72: divide 72 by the yearly return to get roughly how many years it takes to double. At 7% that's about 10 years; at 4%, about 18. It works well for returns between about 4% and 12%.",
      ],
      formula: {
        expression: "Final value = starting amount × (1 + yearly return) ^ number of years",
        reading: "Multiply by one plus the return once for every year; the power is what makes growth build on growth.",
      },
    },
    example: {
      setup: "Two friends each invest $5,000 once and earn 7% a year until age 65. One invests at 25, the other at 35. Neither adds another dollar.",
      steps: [
        "The early starter has 40 years of growth: 1.07 ^ 40 ≈ 14.97, so $5,000 × 14.97 ≈ $74,872.",
        "The later starter has 30 years: 1.07 ^ 30 ≈ 7.61, so $5,000 × 7.61 ≈ $38,061.",
        "Compare simple growth: 7% of $5,000 is $350 a year, so 40 years would add $14,000, ending at $19,000.",
      ],
      result: "Ten extra years nearly doubled the result, $74,872 against $38,061, and compounding turned $5,000 into almost four times what simple growth would have.",
    },
    demo: "growth",
    reading: [
      { label: "Early years", meaning: "Growth looks slow and almost linear. Most of the value is still the money you put in." },
      { label: "Later years", meaning: "Growth on earlier growth starts to dominate. At 7%, the last 10 of 40 years add more dollars than the first 30 combined." },
      { label: "Doubling time", meaning: "72 ÷ yearly return. At 7%, money doubles about every 10 years; at 10%, about every 7." },
      { label: "Small differences", meaning: "One or two percentage points a year, from returns, fees or taxes, become large gaps over decades." },
    ],
    realWorld: [
      "Retirement planning is built on compounding. That's why advisers stress starting early, even with small amounts, and why employer retirement accounts that let money grow untaxed for decades are so valuable: taxes paid every year would slow the compounding.",
      "It works against you just as well. Credit card debt at around 20% a year roughly doubles in under four years if it isn't paid down, and a fund that charges 1% a year more than another takes a growing bite over decades, because the fee is charged on an ever larger balance.",
      "Real returns are never a steady 7%. Stocks rise some years and fall in others, and a big fall interrupts the compounding: after a −50% year you need +100% just to get back. The smooth curve is what a [[cagr|compound annual growth rate]] describes after the fact, not the path you'll actually ride.",
    ],
    mistakes: [
      "Expecting quick results. Compounding does little in the first few years and most of its work in the last ones, so people who give up early never see it.",
      "Taking money out in a downturn. Selling after a fall locks in the loss and leaves less to compound when prices recover.",
      "Ignoring costs because they look small. A 1% yearly fee sounds tiny but compounds just like returns do, in the wrong direction.",
      "Forgetting inflation. A 7% return with 3% inflation grows your buying power by only about 4% a year.",
    ],
    inMarketLab: [
      {
        label: "Five years of buy and hold",
        href: backtestLink({ kind: "buy-and-hold" }, ["KO", "JPM", "MSFT"]),
        text: "This backtest holds three stocks for five years. Look at the growth line and the annual return: gains stay invested, so each year builds on the last.",
      },
      { label: "Portfolio", href: "/portfolio", text: "Your portfolio's value over time shows compounding at work, with dividends paid into your cash ready to reinvest." },
    ],
    related: ["cagr", "totalReturn", "dividend", "buyAndHold"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What makes compound growth different from simple growth?",
        choices: [
          "It only applies to bonds",
          "It guarantees a higher return every year",
          "Each year's gain is worked out on a value that already includes earlier gains",
          "It adds the same dollar amount every year",
        ],
        answer: 2,
        explanation: "Compounding applies the percentage to the growing total, so gains earn gains. Adding the same dollars every year is simple growth.",
      },
      {
        kind: "Using it",
        prompt: "Using the rule of 72, roughly how long does money take to double at 8% a year?",
        choices: ["About 9 years", "About 6 years", "About 12 years", "About 16 years"],
        answer: 0,
        explanation: "72 ÷ 8 = 9 years. The exact answer, 1.08 ^ 9 ≈ 2.0, confirms it.",
      },
      {
        kind: "Using it",
        prompt: "$1,000 grows 10% a year for two years. What is it worth?",
        choices: ["$1,200", "$1,210", "$1,100", "$1,221"],
        answer: 1,
        explanation: "Year one: $1,000 × 1.10 = $1,100. Year two: $1,100 × 1.10 = $1,210. The extra $10 is the first year's gain earning its own 10%.",
      },
      {
        kind: "Real world",
        prompt: "Two funds track the same index; one charges 0.05% a year and the other 1%. Why does the gap matter more than it looks?",
        choices: [
          "It doesn't: 0.95% is too small to notice",
          "The cheaper fund will always take less risk",
          "Fees are only charged in the first year",
          "The fee is taken every year from a growing balance, so its cost compounds over decades",
        ],
        answer: 3,
        explanation: "A fee works like a negative return. Over 30 years, a 1% yearly fee can leave you with roughly a quarter less than the cheap fund.",
      },
    ],
  },

  diversification: {
    why: [
      "Any single company can have a terrible year: a failed product, a scandal, a lawsuit, a new competitor. If all your money is in that company, its bad year is your bad year. Spread the same money over dozens of companies and one disaster becomes a small dent.",
      "The surprising part is that this costs you very little. Each stock's expected return stays about the same, but their ups and downs partly cancel out, so the mix is calmer than almost any of its parts. That's why diversification is often called the only free lunch in investing.",
    ],
    how: {
      paragraphs: [
        "A stock's risk has two parts. Company risk comes from things that only affect that company or its industry. Market risk comes from things that hit almost everything at once, like a recession or a jump in interest rates. Diversification shrinks the first kind; it can't remove the second. A stock's [[beta]] measures how much of the second kind it carries.",
        "The key is that stocks don't move in lockstep. When two investments are unrelated, the swings of a 50/50 mix are smaller than the average of their swings. For two unrelated stocks with the same [[volatility]], the mix's volatility is about 30% lower. Stocks in the same industry tend to move together, so owning ten tech stocks spreads risk much less than owning ten stocks from ten different industries.",
        "Holding more stocks helps a lot at first and less with each addition. Going from one stock to 20 removes much of the company risk; going from 200 to 400 barely changes anything. Funds that hold a whole index, like [[etf|ETFs and index funds]], take this to its practical limit.",
        "So count bets, not tickers. Holdings that rise and fall on the same days act like one bet, however many there are. MarketLab sums this up as the effective number of independent bets: eight holdings whose every pair has a [[correlation]] of about 0.5 behave like about 3 independent bets, while eight unrelated ones would count as nearly 8, and eight in perfect lockstep as just 1. (For the curious, it's worked out from the correlation matrix's eigenvalues: their sum squared, divided by the sum of their squares.)",
      ],
    },
    example: {
      setup: "You have $10,000. One company you like loses 60% of its value in a year, while the other stocks you might have bought rise 8% on average.",
      steps: [
        "All in that one stock: $10,000 × 0.40 = $4,000. You lost $6,000, or 60%.",
        "Spread equally over 20 stocks: $500 each. The bad one falls to $500 × 0.40 = $200.",
        "The other 19 grow to 19 × $500 × 1.08 = $10,260.",
        "Together: $10,260 + $200 = $10,460.",
      ],
      result: "Concentrated, the bad news cost you 60%. Diversified, the same bad news cost $300 on one holding and the whole portfolio still gained 4.6%.",
    },
    demo: "diversification",
    reading: [
      { label: "One stock", meaning: "Your result depends on one company's fortunes. A single bad event can wipe out years of gains." },
      { label: "A handful in one industry", meaning: "Better, but they share the same risks. A bad year for the industry hits them all." },
      { label: "20 to 30 across industries", meaning: "Much of the company-specific risk is gone. What's left is mostly the market's own ups and downs." },
      { label: "A broad index fund", meaning: "Hundreds of companies in one purchase. You get close to the market's return and its risk, and little else." },
      { label: "Far fewer effective bets than holdings", meaning: "Several holdings move as one. The correlation map groups them together and names the most correlated pairs, so you can see where the overlap is." },
    ],
    realWorld: [
      "When Enron collapsed in 2001, many of its employees had most of their retirement savings in Enron stock. They lost their jobs and their savings at the same time. It's a standard warning against putting too much in any one company, especially your own employer.",
      "Diversification has limits in a crash. In 2008 and in early 2020, most stocks fell together, so a diversified portfolio still dropped sharply. It protected against single-company disasters, not against the whole market falling. That's why many investors also hold some bonds or cash, which tend to behave differently from stocks.",
      "Large pension funds and endowments diversify across stocks, bonds, countries and other assets, and professional managers usually limit how much any one position can be. Index funds made the same breadth available to anyone for the price of a single share.",
    ],
    mistakes: [
      "Counting tickers instead of risks. Five tech stocks, or three funds that all track the S&P 500, are far less diversified than they look.",
      "Expecting it to prevent losses. A diversified portfolio still falls when the whole market falls; it just avoids the extra damage of one company failing.",
      "Over-concentrating in what you know: your employer, your country or a favorite sector.",
      "Letting it drift. Winners grow into a bigger share of the portfolio over time. [[rebalancing|Rebalancing]] brings the mix back.",
    ],
    inMarketLab: [
      { label: "Portfolio", href: "/portfolio", text: "The by-sector breakdown shows at a glance whether most of your money sits in one industry." },
      { label: "Correlation map", href: "/portfolio#risk", text: "Under Risk analysis, the Risk tab's correlation map clusters holdings that move together, names the most correlated pairs and says how many independent bets your holdings behave like. The Watchlist page shows the same for the stocks you follow." },
      {
        label: "Five stocks, five industries",
        href: backtestLink({ kind: "buy-and-hold" }, ["AAPL", "JPM", "KO", "XOM", "UNH"], { benchmark: "market" }),
        text: "This backtest holds five stocks from different industries against the S&P 500. Compare its volatility and drawdown with a backtest of any one of them alone.",
      },
    ],
    related: ["etf", "volatility", "correlation", "rebalancing"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "Which kind of risk can diversification largely remove?",
        choices: [
          "Risk specific to one company or industry",
          "The risk of the whole market falling",
          "Inflation risk",
          "All investment risk",
        ],
        answer: 0,
        explanation: "Company risk averages out across many holdings. Market-wide risk hits nearly everything at once, so spreading out can't remove it.",
      },
      {
        kind: "Using it",
        prompt: "You split $10,000 equally across 10 stocks. One goes to zero and the rest are flat. How much did the portfolio lose?",
        choices: ["100%", "50%", "10%", "1%"],
        answer: 2,
        explanation: "Each holding is $1,000, a tenth of the portfolio. Losing all of one costs $1,000, or 10%.",
      },
      {
        kind: "Using it",
        prompt: "Which portfolio is most diversified?",
        choices: [
          "Five large technology stocks",
          "Three different funds that all track the S&P 500",
          "Your employer's stock, held in your retirement account",
          "Twenty stocks spread across ten industries",
        ],
        answer: 3,
        explanation: "Spreading across industries matters more than the number of tickers. Five tech stocks share risks, and three S&P 500 funds hold the same companies.",
      },
      {
        kind: "Using it",
        prompt: "You own 10 stocks, and the correlation map says they behave like about 2 independent bets. What does that tell you?",
        choices: [
          "Two of the stocks are worthless",
          "Most of the holdings move together, so the portfolio is far less spread out than 10 tickers suggests",
          "You should sell 8 stocks",
          "The portfolio has no risk",
        ],
        answer: 1,
        explanation: "Closely correlated holdings rise and fall together, so they count as roughly one bet each group. Adding stocks that move differently would raise the number.",
      },
      {
        kind: "Real world",
        prompt: "In a market crash like 2008, what does a diversified stock portfolio usually do?",
        choices: [
          "It falls too, because most stocks drop together in a crash",
          "It rises, because losses cancel out",
          "It stays flat",
          "It's protected from all losses",
        ],
        answer: 0,
        explanation: "In broad crashes stocks tend to fall together. Diversification protects against one company's disaster, not the whole market's.",
      },
    ],
  },

  etf: {
    why: [
      "Picking individual stocks takes time, research and nerve, and most people who try, including professionals, end up doing worse than the market. A fund that simply owns the whole market sidesteps that problem: you can't pick the wrong company if you own them all.",
      "Index funds and ETFs made this cheap and easy. With one purchase you get [[diversification]] across hundreds of companies, for a yearly fee that can be a small fraction of a percent. For many long-term investors, they're the core of the portfolio.",
    ],
    how: {
      paragraphs: [
        "An index is a list of companies with a rule for how much of each to hold. The S&P 500 holds about 500 large US companies, weighted by [[marketCap|market cap]], so the biggest companies count the most. An index fund buys the companies in the list in the same proportions, so its value rises and falls with the index, minus its costs.",
        "The yearly fee is the expense ratio, taken out of the fund's value a little at a time. Large index funds charge as little as a few hundredths of a percent; actively managed funds, where a manager picks stocks, often charge several times more.",
        "ETF stands for exchange-traded fund: it trades on a stock exchange like a share, at a market price that changes during the day. A traditional mutual fund is bought and sold directly from the fund company once a day, at that day's closing value. Many ETFs track an index, and many index funds are mutual funds; the index is about what the fund holds, the ETF label is about how you buy it.",
      ],
      formula: {
        expression: "Your return ≈ index return − expense ratio",
        reading: "An index fund aims to deliver what the index did, less its yearly fee and a little tracking error.",
      },
    },
    example: {
      setup: "You invest $10,000 for 30 years in a fund tracking an index that returns 7% a year. One fund charges 0.05% a year; another charges 1%.",
      steps: [
        "Cheap fund: 7% − 0.05% = 6.95% a year. $10,000 × 1.0695 ^ 30 ≈ $75,063.",
        "Expensive fund: 7% − 1% = 6% a year. $10,000 × 1.06 ^ 30 ≈ $57,435.",
        "Difference: $75,063 − $57,435 = $17,628.",
      ],
      result: "Both funds held the same stocks, but the 1% fee cost $17,628, almost a quarter of the cheap fund's final value, because the fee compounds year after year.",
    },
    reading: [
      { label: "Expense ratio under 0.1%", meaning: "Typical of large index funds. The fee barely dents your return." },
      { label: "Around 0.5% to 1%", meaning: "Common for actively managed funds. The manager has to beat the index by that much every year just to keep up." },
      { label: "Broad index", meaning: "Hundreds or thousands of companies, like the S&P 500 or a total-market fund. Wide diversification in one share." },
      { label: "Narrow or themed fund", meaning: "One sector, country or trend. Still a basket, but a concentrated one, with much more risk than a broad index." },
    ],
    realWorld: [
      "John Bogle's Vanguard launched the first index mutual fund for ordinary investors in 1976, and it was widely mocked at the time. The first US ETF, the SPDR S&P 500 fund (ticker SPY), followed in 1993. Index funds now hold trillions of dollars, and SPY is one of the most traded securities in the world.",
      "Regular studies, such as S&P's SPIVA reports, have found that most actively managed US stock funds trail their index over periods of ten years or more, after fees. Some managers beat the market in a given year, but few do it consistently, and it's hard to tell them apart in advance.",
      "Many workplace retirement plans now offer index funds or target-date funds built from them, and many advisers suggest a broad, low-cost index fund as the core of a long-term portfolio. That isn't a promise of good returns: an index fund falls when the market falls, as S&P 500 funds did by more than half from late 2007 to early 2009.",
    ],
    mistakes: [
      "Assuming every ETF is diversified. A fund holding 30 companies in one industry is far riskier than a broad index fund.",
      "Overlooking fees. Two funds tracking the same index can charge very different amounts, and the difference compounds.",
      "Buying several funds that hold the same stocks. Three S&P 500 funds give the same diversification as one.",
      "Trading ETFs often because they're easy to trade. Frequent buying and selling adds [[tradingCosts|costs]] and tends to hurt returns.",
    ],
    inMarketLab: [
      { label: "Dashboard", href: "/", text: "The market indices on the dashboard are shown through the funds that track them: SPY for the S&P 500, QQQ for the Nasdaq and DIA for the Dow." },
      {
        label: "Against the market",
        href: backtestLink({ kind: "buy-and-hold" }, ["NVDA", "TSLA"], { benchmark: "market" }),
        text: "Backtests can compare any strategy with the S&P 500. This one holds two volatile stocks against it: notice how much wider their swings are than the index's.",
      },
      { label: "Portfolio", href: "/portfolio", text: "Your portfolio's performance chart compares you with the S&P 500, Nasdaq or Dow, the return an index fund would have given you." },
    ],
    related: ["diversification", "benchmark", "buyAndHold", "marketCap"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is an expense ratio?",
        choices: [
          "The fund's return minus the index's return",
          "The yearly fee a fund charges, as a percentage of your investment",
          "The share of the fund held in cash",
          "The commission you pay each time you trade",
        ],
        answer: 1,
        explanation: "It's the fund's yearly running cost, taken from its value. A 0.05% expense ratio costs $5 a year on $10,000.",
      },
      {
        kind: "Using it",
        prompt: "An index returns 8% in a year. An index fund tracking it has a 0.2% expense ratio. Roughly what does the fund return?",
        choices: ["8.2%", "6%", "8%", "7.8%"],
        answer: 3,
        explanation: "The fund delivers about the index's return minus its fee: 8% − 0.2% = 7.8%.",
      },
      {
        kind: "Terminology",
        prompt: "What's the main difference between an ETF and a traditional mutual fund?",
        choices: [
          "ETFs trade on an exchange during the day; mutual funds are bought from the fund company at the day's closing value",
          "Only ETFs can track an index",
          "Mutual funds can't hold stocks",
          "ETFs never charge fees",
        ],
        answer: 0,
        explanation: "The difference is how you buy and sell them. Both can track an index, and both charge an expense ratio.",
      },
      {
        kind: "Real world",
        prompt: "What have long-term studies generally found about actively managed stock funds?",
        choices: [
          "Most beat their index every year",
          "Most trail their index over ten years or more, after fees",
          "They always have lower fees than index funds",
          "They never lose money in a crash",
        ],
        answer: 1,
        explanation: "Reports like SPIVA find most active funds fall behind their index over long periods, largely because of their higher costs.",
      },
    ],
  },
};
