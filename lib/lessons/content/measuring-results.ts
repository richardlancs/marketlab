import type { TermKey } from "../../glossary";
import { backtestLink } from "../links";
import type { Lesson } from "../types";

export const MEASURING_RESULTS_LESSONS: Partial<Record<TermKey, Lesson>> = {
  totalReturn: {
    why: [
      "Total return is the first number almost everyone looks at, and for good reason: it answers the simplest question there is. If you put money in at the start, how much more (or less) did you have at the end? Every other measure in this group builds on it or puts it in context.",
      "It's also easy to get wrong. Percentages don't add up the way people expect, a dollar gain means little without knowing the starting amount, and a big number can hide a long wait or a terrifying ride. Knowing exactly what total return does and doesn't tell you makes every other result easier to read.",
    ],
    how: {
      paragraphs: [
        "Take the value at the end, divide it by the value at the start, and subtract 1. Multiply by 100 for a percentage. MarketLab does exactly this with the value of a portfolio or backtest: cash plus the market value of every holding, on the first and last day.",
        "Returns from separate periods combine by multiplying, not adding. A gain of 30% turns each dollar into $1.30; a loss of 10% then turns each dollar into $0.90. Together that's 1.30 × 0.90 = 1.17, a total return of +17%, not the +20% you'd get by adding 30 and −10. This is [[compounding]] at work, and it cuts both ways.",
        "For a fund or index, total return usually means the price change plus any [[dividend|dividends]], assumed to be reinvested. A return that counts only the price change is called a price return, and over long periods the gap between the two can be large.",
      ],
      formula: {
        expression: "Total return = ending value ÷ starting value − 1",
        reading: "How many times the money grew, minus the original money, shown as a percentage.",
      },
    },
    example: {
      setup: "You invest $10,000. In the first year it rises 30%. In the second year it falls 10%.",
      steps: [
        "After year one: $10,000 × 1.30 = $13,000.",
        "After year two: $13,000 × 0.90 = $11,700. The 10% loss is 10% of the bigger amount, so it costs $1,300.",
        "Total return: $11,700 ÷ $10,000 − 1 = 0.17, or +17%.",
        "Check by multiplying the growth factors: 1.30 × 0.90 = 1.17, the same +17%.",
      ],
      result: "The total return over the two years is +17%, a gain of $1,700. Adding the yearly percentages would have said +20%, which overstates it.",
    },
    demo: "growth",
    reading: [
      { label: "Below 0%", meaning: "You ended with less than you started with. A −100% return means everything was lost." },
      { label: "0% to the market's return", meaning: "You made money, but compare it with a [[benchmark]]: simply holding an index may have done better." },
      { label: "Well above the market", meaning: "Worth checking how long it took and how much risk was taken. A big number over ten years can be weaker than a modest one over two." },
    ],
    realWorld: [
      "Funds and indexes report total return with dividends reinvested so that investors can compare like with like. The S&P 500's price-only level has grown noticeably less over the decades than its total return index, because dividends have added a meaningful share of the gain.",
      "Brokers often show a dollar gain and a percentage side by side. The percentage is what lets you compare a $500 account with a $500,000 one, but the dollar figure is what actually changes your life, so both matter.",
      "Because total return ignores time, fund reports almost always pair it with an annualized figure, the [[cagr|annual return]], for periods of more than a year.",
    ],
    mistakes: [
      "Adding percentages from different periods. A +50% year followed by a −50% year leaves you 25% down, not even.",
      "Comparing total returns over different lengths of time. +40% over eight years is weaker than +30% over three.",
      "Looking at the price change and forgetting dividends, or comparing a fund's total return with an index's price return.",
      "Judging a result by its total return alone, without its [[maxDrawdown|max drawdown]] and [[volatility]]. The same ending can come from a smooth climb or a stomach-churning one.",
    ],
    inMarketLab: [
      { label: "Portfolio", href: "/portfolio", text: "The Performance card shows your portfolio's return over the chosen range, as growth of $100 next to an index." },
      { label: "Backtest", href: "/backtest", text: "Every backtest lists the total return of the strategy and of its benchmark side by side." },
    ],
    related: ["cagr", "compounding", "benchmark", "maxDrawdown"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does total return measure?",
        choices: [
          "The average yearly growth rate",
          "How much the value swung from day to day",
          "How much the money grew or shrank over the whole period",
          "The biggest fall from a peak",
        ],
        answer: 2,
        explanation: "Total return compares the end with the start, over the whole period. The yearly rate is CAGR, the swings are volatility and the biggest fall is the max drawdown.",
      },
      {
        kind: "Using it",
        prompt: "An investment gains 20% one year and loses 20% the next. What's the total return?",
        choices: ["0%", "−4%", "+4%", "−20%"],
        answer: 1,
        explanation: "1.20 × 0.80 = 0.96, so the total return is −4%. The loss applies to a bigger amount than the gain did.",
      },
      {
        kind: "Using it",
        prompt: "$8,000 grows to $10,000. What's the total return?",
        choices: ["+20%", "+25%", "+80%", "+2,000%"],
        answer: 1,
        explanation: "$10,000 ÷ $8,000 = 1.25, minus 1 is 0.25, or +25%. The $2,000 gain is measured against the $8,000 you started with.",
      },
      {
        kind: "Real world",
        prompt: "A fund says it returned 9% a year including dividends, and you compare it with an index's price change of 7% a year. What's the catch?",
        choices: [
          "There is none: the fund clearly did better",
          "Indexes never pay dividends",
          "The comparison mixes total return with price return, so the gap may mostly be the index's dividends",
        ],
        answer: 2,
        explanation: "To compare fairly, use the index's total return too. The index's own dividends could account for much of the 2-point gap.",
      },
    ],
  },
  cagr: {
    why: [
      "A total return on its own can't tell you whether an investment was any good, because it doesn't say how long it took. +60% is excellent over three years and disappointing over twenty. To compare results from periods of different lengths, you need to turn them into a yearly rate.",
      "The compound annual growth rate, or CAGR, does that. It's the single steady yearly return that would have taken you from the starting value to the ending value in the same time. It's how funds, indexes and savings accounts are usually compared, and it's the number to hold up against your goals.",
    ],
    how: {
      paragraphs: [
        "Divide the ending value by the starting value to get the growth factor. Then take the root for the number of years, which is the same as raising it to the power of 1 ÷ years, and subtract 1. The root undoes the [[compounding]]: it finds the yearly rate that, multiplied by itself once for each year, gives the whole growth.",
        "MarketLab measures years by the calendar: the time from the first to the last day, divided by 365.25 days. So a backtest that runs for 18 months uses 1.5 years, not a count of trading days.",
        "CAGR is not the same as the average of the yearly returns. Averaging ignores the fact that each year builds on the last, so it flatters bumpy investments. A year of +50% followed by a year of −50% averages 0%, but it leaves you with 75% of your money.",
      ],
      formula: {
        expression: "CAGR = (ending value ÷ starting value)^(1 ÷ years) − 1",
        reading: "The steady yearly rate that grows the starting value into the ending value over that many years.",
      },
    },
    example: {
      setup: "$10,000 grew to $16,105 over exactly 5 years. Separately, another investment went +50% and then −50% over 2 years.",
      steps: [
        "Growth factor: $16,105 ÷ $10,000 = 1.6105, a total return of about +61%.",
        "Fifth root: 1.6105^(1 ÷ 5) = 1.10, so the CAGR is 10% a year.",
        "Check: $10,000 × 1.10 × 1.10 × 1.10 × 1.10 × 1.10 ≈ $16,105.",
        "The bumpy investment: 1.50 × 0.50 = 0.75. Its CAGR is 0.75^(1 ÷ 2) − 1 = 0.866 − 1 ≈ −13.4% a year, even though its yearly returns average 0%.",
      ],
      result: "The first investment grew at 10% a year. The second lost about 13.4% a year, which the simple average of 0% completely hides.",
    },
    demo: "growth",
    reading: [
      { label: "Below 0%", meaning: "The money shrank on average each year." },
      { label: "About 2% to 4%", meaning: "Roughly what inflation has often been in calm decades, so in real terms little was gained." },
      { label: "About 6% to 10%", meaning: "In the range that broad stock indexes have often delivered over long stretches, before inflation, though some decades were far lower." },
      { label: "Above 15%", meaning: "Exceptional if it lasts many years. Over a short period or in a backtest, it's more likely luck or [[overfitting]]." },
    ],
    realWorld: [
      "Fund fact sheets show annualized returns over 1, 3, 5 and 10 years. Anything longer than a year is a CAGR, which is why you can line up a 10-year record against a 3-year one.",
      "Companies use CAGR too: annual reports and analysts talk about revenue or earnings growing at, say, 12% a year over five years.",
      "Financial planners use it to check goals. Doubling your money in 10 years needs about 7.2% a year, because 1.072 to the tenth power is roughly 2. The \"rule of 72\" (72 ÷ rate ≈ years to double) comes from the same maths.",
    ],
    mistakes: [
      "Calling CAGR the return you got each year. It's a smoothed figure: real years might have been +30%, −15% and +12%.",
      "Annualizing a short period. +10% in three months works out to roughly +46% a year, but nobody should expect that to continue.",
      "Using an average of yearly returns instead. The average is always at least as high as the CAGR, and much higher when returns swing a lot.",
      "Forgetting the start and end dates. Starting at a market low or ending at a peak can make the same investment look far better.",
    ],
    inMarketLab: [
      { label: "Backtest", href: "/backtest", text: "The \"annual return\" in every backtest result is the CAGR, based on the calendar time between the first and last day." },
    ],
    related: ["totalReturn", "compounding", "volatility"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is the compound annual growth rate (CAGR)?",
        choices: [
          "The steady yearly return that would end at the same value",
          "The average of the yearly returns",
          "The best single year in the period",
          "The total return divided by the number of years",
        ],
        answer: 0,
        explanation: "CAGR is the smooth yearly rate that compounds into the same ending value. Simple averages and dividing by years both ignore compounding.",
      },
      {
        kind: "Using it",
        prompt: "$10,000 grows to $12,100 over exactly 2 years. What's the CAGR?",
        choices: ["10.5%", "21%", "10%", "11%"],
        answer: 2,
        explanation: "$12,100 ÷ $10,000 = 1.21, and the square root of 1.21 is 1.10. So the CAGR is 10%: 1.10 × 1.10 = 1.21.",
      },
      {
        kind: "Using it",
        prompt: "An investment's yearly returns were +40% and then −30%. Which is true?",
        choices: [
          "Its CAGR is +5%, the average",
          "Its CAGR is below 0%, because 1.40 × 0.70 = 0.98",
          "Its CAGR is +10%",
          "You can't work out a CAGR from yearly returns",
        ],
        answer: 1,
        explanation: "The average is +5%, but the money ended at 98% of the start, so the CAGR is about −1% a year.",
      },
      {
        kind: "Real world",
        prompt: "A fund advertises a 40% annualized return, based on its first four months. How should you read that?",
        choices: [
          "With caution: annualizing a few months turns a short burst into an unrealistic yearly figure",
          "As a reliable estimate of next year's return",
          "As proof the fund beats the market",
        ],
        answer: 0,
        explanation: "Short periods are noisy. A few good months scaled up to a year rarely repeat, which is why many reports only annualize periods longer than a year.",
      },
    ],
  },
  volatility: {
    why: [
      "Return tells you where an investment ended up. Volatility tells you what the trip was like. An investment that moves 0.3% on a typical day and one that moves 3% can both end the year up 10%, but holding the second means living with drops of hundreds or thousands of dollars on ordinary days.",
      "Volatility matters for more than comfort. It sets how wide the range of possible outcomes is, it's the yardstick behind the [[sharpe|Sharpe ratio]], and it shapes behavior: the bumpier the ride, the more likely people are to sell at a bad moment.",
    ],
    how: {
      paragraphs: [
        "Start with the daily returns. Find their average, then measure how far each day strays from it: square each difference, add them up, divide by the number of days minus 1, and take the square root. That's the sample standard deviation, the size of a typical day's surprise.",
        "A daily figure is hard to compare, so it's scaled to a year by multiplying by √252, about 15.9, because there are roughly 252 trading days in a year. Random swings partly cancel out, so they grow with the square root of time, not with time itself. MarketLab works it out exactly this way from daily closing values.",
        "A handy reverse rule: divide an annual volatility by about 16 to get a typical daily move. An index with 16% volatility moves roughly 1% on a typical day. As a rough guide, about two years in three tend to land within one volatility of the average year, though real markets have more extreme days than that suggests.",
      ],
      formula: {
        expression: "Volatility = standard deviation of daily returns × √252",
        reading: "The size of a typical day's swing, scaled up to a year.",
      },
    },
    example: {
      setup: "Over five days, a stock's daily returns were +1%, −1%, +2%, −2% and 0%.",
      steps: [
        "Average: (1 − 1 + 2 − 2 + 0) ÷ 5 = 0%.",
        "Squared differences from the average: 1, 1, 4, 4 and 0, which add up to 10.",
        "Divide by days minus 1: 10 ÷ 4 = 2.5. Square root: √2.5 ≈ 1.58%, the daily standard deviation.",
        "Scale to a year: 1.58% × √252 = 1.58% × 15.87 ≈ 25.1%.",
      ],
      result: "The stock's annualized volatility is about 25%, so it moves about 1.6% on a typical day, noticeably more than a broad index.",
    },
    demo: "volatility",
    reading: [
      { label: "Below 10%", meaning: "Calm. Typical of a mix that's mostly bonds, or a very steady stock fund." },
      { label: "About 15% to 20%", meaning: "Typical of a broad stock index like the S&P 500 in normal times." },
      { label: "About 25% to 40%", meaning: "Typical of a single large company. Each stock carries its own news on top of the market's moves." },
      { label: "Above 50%", meaning: "Very bumpy: small companies, young growth stocks or anything in a crisis. Swings of 5% or more a day become common." },
    ],
    realWorld: [
      "The VIX, often called the market's \"fear gauge\", is an estimate of the S&P 500's volatility over the next month, worked out from options prices. It has usually sat somewhere between about 10 and 30, and jumped above 80 during the panics of 2008 and 2020.",
      "Fund fact sheets list volatility, often called standard deviation, so investors can see how bumpy a fund has been. Some funds aim for a set level of volatility and move money between stocks and cash to hold it there.",
      "[[diversification|Diversified]] portfolios are less volatile than the stocks they hold, because different companies' surprises partly cancel out. That's one reason an index is usually calmer than almost any stock in it.",
    ],
    mistakes: [
      "Treating volatility as the whole story of risk. A stock can be calm for years and then collapse in a day; check the [[maxDrawdown|max drawdown]] too.",
      "Assuming past volatility will continue. Calm periods are often followed by stormy ones, and the reverse.",
      "Forgetting that volatility counts big jumps up just like big drops, so a stock that soared can look \"risky\".",
      "Comparing volatility worked out from different data, such as daily against monthly returns, which can give different numbers.",
    ],
    inMarketLab: [
      { label: "Portfolio", href: "/portfolio", text: "The Performance card shows your portfolio's volatility next to the index you compare it with." },
      { label: "Backtest", href: "/backtest", text: "Every backtest shows the volatility of the strategy and its benchmark. Try a single stock against five to watch diversification bring it down." },
    ],
    related: ["sharpe", "maxDrawdown", "diversification", "beta"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does volatility measure?",
        choices: [
          "How much the value has grown",
          "How much the value swings from day to day, scaled to a year",
          "How much a stock moves with the market",
        ],
        answer: 1,
        explanation: "Volatility is the standard deviation of daily returns, scaled to a year. Growth is return, and moving with the market is beta.",
      },
      {
        kind: "Using it",
        prompt: "A stock's daily returns have a standard deviation of 2%. Roughly what's its annual volatility?",
        choices: ["2%", "16%", "32%", "504%"],
        answer: 2,
        explanation: "2% × √252 ≈ 2% × 15.9 ≈ 32%. Multiplying by 252 instead would wildly overstate it, because swings partly cancel out.",
      },
      {
        kind: "Using it",
        prompt: "An index has an annual volatility of 16%. About how much does it move on a typical day?",
        choices: ["About 0.1%", "About 1%", "About 4%", "About 16%"],
        answer: 1,
        explanation: "Divide by √252, about 16: 16% ÷ 16 ≈ 1% on a typical day.",
      },
      {
        kind: "Real world",
        prompt: "The VIX index jumps from 15 to 45. What is the market telling you?",
        choices: [
          "Stocks are certain to fall further",
          "Options traders expect much bigger swings in the S&P 500 over the coming month",
          "Interest rates have tripled",
          "Trading volume has tripled",
        ],
        answer: 1,
        explanation: "The VIX reflects expected volatility, priced from options. A high reading signals fear and wide swings, in either direction, not a sure fall.",
      },
    ],
  },
  maxDrawdown: {
    why: [
      "Averages hide the worst moments, and the worst moments are what make people quit. A strategy that returns 10% a year but once fell by half is a very different thing to hold than one that returned 8% and never fell more than 15%. Many investors who own the first sell near the bottom and never see the recovery.",
      "Max drawdown answers a blunt question: if you had invested at the worst possible time, how much would you have watched disappear before things got better? It's the number to look at when asking whether you could actually stick with something.",
    ],
    how: {
      paragraphs: [
        "Walk through the values day by day, keeping track of the highest value so far. On each day, the drawdown is how far the value sits below that running peak, as a percentage of the peak. The max drawdown is the biggest of those. MarketLab works it out this way from daily closing values, so a dip during a day that recovered by the close doesn't count.",
        "Losses and gains aren't symmetrical. After a fall, you're starting from a smaller amount, so you need a bigger percentage gain just to get back to where you were. A 10% loss needs an 11.1% gain; a 20% loss needs 25%; a 50% loss needs a 100% gain; an 80% loss needs a 400% gain.",
        "That's why deep drawdowns are so costly. Recovering takes time, and the time spent getting back to even is time not spent growing.",
      ],
      formula: {
        expression: "Drawdown = 1 − value ÷ highest value so far; gain needed to recover = 1 ÷ (1 − drawdown) − 1",
        reading: "How far below its peak the value is, and the percentage rise it needs to get back there.",
      },
    },
    example: {
      setup: "$10,000 rises to a peak of $15,000, falls to $9,000, climbs back to $14,000, and finally reaches a new high of $16,000.",
      steps: [
        "Drawdown at the low: 1 − $9,000 ÷ $15,000 = 1 − 0.60 = 0.40, a 40% fall from the peak.",
        "The dip from $15,000 is measured from the peak, not from the $10,000 start, so the max drawdown is −40% even though the value never fell below $9,000.",
        "Gain needed to recover: $15,000 ÷ $9,000 − 1 ≈ 0.667, so a rise of about 66.7%.",
        "For a 50% fall: $100 drops to $50, and getting back to $100 means gaining another $50, which is 100% of $50. In the formula: 1 ÷ (1 − 0.5) − 1 = 1, or 100%.",
      ],
      result: "The max drawdown was −40%, and it took a 66.7% gain just to get back to the old peak. The total return of +60% hides how hard that would have been to sit through.",
    },
    demo: "drawdown",
    reading: [
      { label: "0% to −10%", meaning: "Mild. Normal for a cautious mix, or for stocks in a calm year." },
      { label: "−10% to −20%", meaning: "A correction. Broad stock markets have had falls like this every year or two on average." },
      { label: "−20% to −40%", meaning: "A bear market for an index, or an ordinary bad stretch for a single stock." },
      { label: "Worse than −50%", meaning: "Severe. It takes a doubling to recover. Single stocks and narrow strategies can get here; broad indexes rarely do." },
    ],
    realWorld: [
      "History has some famous ones. The S&P 500 fell roughly 55% from its 2007 peak to its 2009 low. In early 2020 it dropped about a third in a few weeks, then recovered within months. The tech-heavy Nasdaq fell nearly 80% from 2000 to 2002 and took around 15 years to regain its old high.",
      "Hedge funds and professional managers are often judged on drawdowns as much as returns. Some clients pull their money if losses pass a set limit, and many funds have rules to cut risk when a drawdown deepens.",
      "Financial planners use it to set expectations. Asking \"could you watch your savings fall by a third and not sell?\" is often more useful than talking about volatility.",
    ],
    mistakes: [
      "Measuring from the starting value instead of the peak. A drawdown is always measured from the highest point reached so far.",
      "Thinking a 30% loss needs a 30% gain to recover. It needs about 43%.",
      "Assuming a backtest's worst drawdown is the worst that can happen. The future can always bring a deeper fall than the past.",
      "Ignoring how long a drawdown lasted. A 25% fall that took five years to recover can hurt more than a 35% one that recovered in months.",
    ],
    inMarketLab: [
      { label: "Backtest", href: "/backtest", text: "Every backtest shows the max drawdown of the strategy and its benchmark." },
      { label: "Portfolio", href: "/portfolio", text: "The Performance card shows your portfolio's drawdown next to the index you compare it with." },
    ],
    related: ["volatility", "sharpe", "totalReturn"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is a max drawdown?",
        choices: [
          "The biggest fall from a high point to a later low",
          "The biggest single-day loss",
          "The fall from the starting value to the lowest value",
          "The average loss on down days",
        ],
        answer: 0,
        explanation: "It's measured from the highest point reached so far, not from the start, and it can unfold over many days, weeks or years.",
      },
      {
        kind: "Using it",
        prompt: "A portfolio falls 50%. What gain does it need to get back to its peak?",
        choices: ["50%", "75%", "100%", "150%"],
        answer: 2,
        explanation: "$100 falls to $50. Getting back to $100 means gaining $50 on $50, which is 100%: 1 ÷ (1 − 0.5) − 1 = 1.",
      },
      {
        kind: "Using it",
        prompt: "An account goes from $20,000 to a peak of $25,000, then down to $20,000. What's the drawdown?",
        choices: ["0%", "−20%", "−25%"],
        answer: 1,
        explanation: "1 − $20,000 ÷ $25,000 = 0.20, or −20%, measured from the $25,000 peak, even though the account is back at its starting value.",
      },
      {
        kind: "Real world",
        prompt: "The Nasdaq fell nearly 80% from 2000 to 2002. Why did it take so long to regain its old high?",
        choices: [
          "Because an 80% fall needs about a 400% gain to recover",
          "Because the Nasdaq stopped trading for years",
          "Because indexes can only rise 10% a year",
        ],
        answer: 0,
        explanation: "From 20% of the peak, it has to grow fivefold to get back: 1 ÷ 0.2 − 1 = 4, a 400% gain. That took around 15 years.",
      },
    ],
  },
  sharpe: {
    why: [
      "Two investments can end the year with the same return and still be very different experiences. One might have climbed steadily; the other might have swung 5% a day, fallen by a third in the spring and only clawed back in December. On paper they tie. In practice, almost nobody would choose the second, and many people who held it would have sold at the bottom.",
      "The Sharpe ratio puts that difference into a single number. It divides the return by the [[volatility]], so it tells you how much return you earned for each unit of bumpiness you had to sit through. It's the most widely used way to compare strategies, funds and portfolios that take different amounts of risk.",
    ],
    how: {
      paragraphs: [
        "Start with the daily returns: how much the value rose or fell each day, as a percentage. Take their average, and their standard deviation (how far a typical day strays from that average). Divide the first by the second. That gives a Sharpe ratio for one day, which is a small number, so it's scaled up to a year by multiplying by the square root of 252, the number of trading days in a year.",
        "Why the square root? Average returns add up over time in proportion to the number of days, but random swings partly cancel each other out, so they only grow with the square root of the number of days. Scaling the average by 252 and the swings by √252 leaves the ratio multiplied by √252, about 15.9.",
        "Strictly, the numerator is the return above a risk-free rate: what you'd have earned in something safe like short-term government bills. MarketLab uses a risk-free rate of 0%, which keeps the numbers simple and comparable with each other, but makes them a little higher than a fund's official figure would be when interest rates are high.",
      ],
      formula: {
        expression: "Sharpe = (average daily return − risk-free rate) ÷ standard deviation of daily returns × √252",
        reading: "How much return you got for each unit of day-to-day swing, scaled from one day to a year.",
      },
    },
    example: {
      setup: "Over a year, a portfolio rose 0.05% on an average day, and its daily returns had a standard deviation of 1.2%.",
      steps: [
        "Daily ratio: 0.05% ÷ 1.2% = 0.0417.",
        "Scale to a year: 0.0417 × √252 = 0.0417 × 15.87 ≈ 0.66.",
        "Compare: a second portfolio averaged the same 0.05% a day, but with a standard deviation of only 0.6%. Its Sharpe ratio is 0.05 ÷ 0.6 × 15.87 ≈ 1.32.",
      ],
      result: "Both earned the same average return, but the second did it with half the bumps, so its Sharpe ratio is twice as high: 1.32 against 0.66.",
    },
    demo: "sharpe",
    reading: [
      { label: "Below 0", meaning: "It lost money on average. Cash would have done better, with no swings at all." },
      { label: "0 to 0.5", meaning: "Some reward for the risk, but not much. Many single stocks land here over long periods." },
      { label: "0.5 to 1", meaning: "Respectable. A broad stock index has often landed somewhere around 0.3 to 0.7 over long stretches of history." },
      { label: "Above 1", meaning: "Good, especially if it lasts many years. Above 2 over a long period is rare, and in a backtest it's a reason to check for [[overfitting]]." },
    ],
    realWorld: [
      "Fund fact sheets and comparison sites list Sharpe ratios so investors can compare funds that take different amounts of risk: a bond fund returning 5% with tiny swings can beat a stock fund returning 8% with big ones on this measure.",
      "Professional investors use it to judge managers. A manager who beat the market by taking twice the risk hasn't shown skill; one with a consistently higher Sharpe ratio might have. Many hedge funds report it to their clients every month.",
      "It also guides how much to invest in something. If two strategies have the same Sharpe ratio, holding more of the calmer one and less cash can give the same return as the bumpier one with less stress, which is why institutions care more about the ratio than about raw return.",
    ],
    mistakes: [
      "Comparing ratios worked out over different periods. A Sharpe ratio from a calm bull market will look far better than one that includes a crash, even for the same strategy.",
      "Treating volatility as the only risk. The ratio counts a sudden jump up as just as bad as a fall, and it can't see risks that haven't happened yet, like a company going bust. Look at the [[maxDrawdown|max drawdown]] too.",
      "Trusting a high ratio from a short backtest. A few months of lucky days can produce a spectacular number that means nothing.",
      "Forgetting the risk-free rate when comparing with official figures: MarketLab uses 0%, so its numbers run a little higher than ones that subtract a real interest rate.",
    ],
    inMarketLab: [
      { label: "Backtest", href: "/backtest", text: "Every backtest shows the Sharpe ratio of the strategy next to its benchmark." },
      { label: "Portfolio", href: "/portfolio", text: "The Performance card shows your portfolio's Sharpe ratio next to the index you compare it with." },
    ],
    related: ["volatility", "maxDrawdown", "benchmark", "overfitting"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does the Sharpe ratio measure?",
        choices: [
          "The total return over the whole period",
          "Return earned for each unit of volatility",
          "The biggest fall from a peak",
          "How much a stock moves with the market",
        ],
        answer: 1,
        explanation: "It divides return by volatility: how much you were paid for the bumps. The biggest fall is the max drawdown, and moving with the market is beta.",
      },
      {
        kind: "Using it",
        prompt: "Fund A returned 10% a year with 20% volatility. Fund B returned 7% with 7% volatility. Ignoring the risk-free rate, which has the higher Sharpe ratio?",
        choices: ["Fund A: 0.5", "Fund B: 1.0", "They're the same", "You can't tell without the drawdown"],
        answer: 1,
        explanation: "A: 10 ÷ 20 = 0.5. B: 7 ÷ 7 = 1.0. B earned less, but much more per unit of risk.",
      },
      {
        kind: "Using it",
        prompt: "Why is a daily Sharpe ratio multiplied by √252 rather than by 252?",
        choices: [
          "Because there are √252 trading weeks in a year",
          "Because average returns grow with time but random swings only grow with its square root",
          "It's an arbitrary convention with no reason behind it",
          "To make the number smaller",
        ],
        answer: 1,
        explanation: "Over 252 days the average return grows about 252 times, but swings partly cancel and grow about √252 times, so their ratio grows by √252.",
      },
      {
        kind: "Real world",
        prompt: "A backtest over six calm months shows a Sharpe ratio of 3.5. What's the most sensible reading?",
        choices: [
          "It's a great strategy that will keep earning that",
          "The period is too short and calm to trust it; test a longer stretch that includes a downturn",
          "Sharpe ratios above 3 are typical of index funds",
          "It means the strategy can't lose money",
        ],
        answer: 1,
        explanation: "Ratios that high rarely survive long periods. Short, calm samples flatter almost any strategy, so check it over years that include a fall.",
      },
    ],
  },
  beta: {
    why: [
      "Every stock moves for two kinds of reasons. Some of its moves are its own: a product launch, a bad quarter, a lawsuit. The rest come from the whole market rising or falling together, on news about interest rates, the economy or investor mood. Beta measures the second kind.",
      "That matters because market-wide moves can't be escaped by owning more stocks. [[diversification|Diversification]] smooths out each company's own surprises, but when the whole market drops, most stocks drop with it. Beta tells you how hard a stock, or a whole portfolio, tends to be hit when that happens, and how much it tends to gain when the market rallies.",
    ],
    how: {
      paragraphs: [
        "Beta compares a stock's returns with the market's returns over the same days, weeks or months, usually using a broad index like the S&P 500 as \"the market\". Formally it's the covariance of the two (how much they move together) divided by the variance of the market (how much the market moves on its own).",
        "An easier way to see it: beta is the correlation between the stock and the market, multiplied by the stock's [[volatility]] divided by the market's. So a stock gets a high beta by being both bumpy and closely tied to the market. A very bumpy stock that mostly moves on its own news can still have a low beta.",
        "A beta of 1 means the stock has tended to move in line with the market. Above 1 means bigger moves in the same direction; below 1 means smaller ones. A negative beta, which is rare for stocks, means it has tended to move the opposite way.",
      ],
      formula: {
        expression: "Beta = correlation with the market × (stock volatility ÷ market volatility)",
        reading: "How tightly the stock follows the market, times how much bigger its swings are.",
      },
    },
    example: {
      setup: "A tech stock has a volatility of 30% and a correlation of 0.8 with the market. The market's volatility is 16%. A utility company has a volatility of 18% and a correlation of 0.5.",
      steps: [
        "Tech stock: the ratio of volatilities is 30% ÷ 16% = 1.875.",
        "Its beta: 0.8 × 1.875 = 1.5.",
        "If the market falls 10%, the market-linked part of its move suggests a fall of about 1.5 × 10% = 15%. Its own news can push the actual move higher or lower.",
        "Utility: 0.5 × (18% ÷ 16%) = 0.5 × 1.125 ≈ 0.56. On the same 10% market fall, its market-linked move would be about 5.6%.",
      ],
      result: "The tech stock has a beta of 1.5 and the utility about 0.56, so the tech stock has tended to swing about 2.7 times as much with the market.",
    },
    demo: "beta",
    reading: [
      { label: "Below 0", meaning: "It has tended to move against the market. Rare for stocks; some hedging funds aim for it." },
      { label: "0 to 1", meaning: "Calmer than the market. Utilities and consumer staples, like food and household goods, often land here." },
      { label: "About 1", meaning: "Moves roughly with the market. A fund that tracks the index has a beta of about 1 against it." },
      { label: "Above 1.5", meaning: "Amplifies the market's moves. Many fast-growing tech companies have been here; expect bigger gains in rallies and bigger falls in sell-offs." },
    ],
    realWorld: [
      "Finance websites list a beta on most stock pages, often worked out from about five years of monthly returns against the S&P 500. Different sites use different periods, so the same stock can show different betas.",
      "Analysts use beta in the capital asset pricing model (CAPM), a classic way to estimate the return investors should expect from a stock: the higher the beta, the more return they demand for holding it. Companies use it when deciding whether a new project is worth its cost.",
      "Portfolio managers add up their holdings' betas, weighted by size, to see how much market risk they carry. A portfolio with a beta of 1.2 would be expected to fall about 12% in a 10% market drop.",
    ],
    mistakes: [
      "Treating a low beta as low risk. A stock with a beta of 0.5 can still collapse on its own bad news; beta only measures market-linked moves.",
      "Assuming beta stays fixed. A company's business and the market change, and so does its beta.",
      "Forgetting which market it's measured against. A beta against the S&P 500 says little about how a stock moves with, say, foreign markets.",
      "Reading beta as a promise. It describes how a stock has moved in the past, on average, not how it will move tomorrow.",
    ],
    inMarketLab: [
      { label: "Dashboard", href: "/", text: "The dashboard charts the S&P 500. Compare its moves over the same range with a stock's chart to get a feel for which stocks follow it closely." },
      { label: "Compare two stocks", href: "/stocks/NVDA", text: "Look at a fast-growing company like NVIDIA, then a steady one like Coca-Cola (KO), over the same chart range." },
      { label: "Portfolio", href: "/portfolio", text: "The Performance card compares your portfolio with an index. A portfolio that swings more than the index in both directions has a high beta." },
    ],
    related: ["volatility", "diversification", "benchmark"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does a beta of 0.6 tell you about a stock?",
        choices: [
          "It has tended to move about 0.6% for every 1% the market moved",
          "It has a 60% chance of rising",
          "Its volatility is 60%",
          "It returned 0.6% a year more than the market",
        ],
        answer: 0,
        explanation: "Beta measures how much a stock tends to move with the market. At 0.6, its market-linked moves have been about 60% of the market's.",
      },
      {
        kind: "Using it",
        prompt: "A stock has a correlation of 0.5 with the market and a volatility of 40%. The market's volatility is 20%. What's its beta?",
        choices: ["0.5", "2.0", "1.0", "0.25"],
        answer: 2,
        explanation: "0.5 × (40% ÷ 20%) = 0.5 × 2 = 1.0. It's twice as bumpy as the market, but only half that bumpiness is tied to the market.",
      },
      {
        kind: "Using it",
        prompt: "Your portfolio has a beta of 1.3. The market falls 10%. What does beta suggest?",
        choices: [
          "The portfolio is certain to fall exactly 13%",
          "A market-linked fall of about 13%, give or take its own moves",
          "A fall of about 7.7%",
        ],
        answer: 1,
        explanation: "1.3 × 10% = 13% is the market-linked move. Beta describes tendencies, so the actual result will differ.",
      },
      {
        kind: "Real world",
        prompt: "An investor worried about a market downturn wants stocks likely to fall less than the market. Where would beta point them?",
        choices: [
          "To high-beta tech stocks",
          "To stocks with the highest past returns",
          "To lower-beta stocks, such as many utilities and consumer staples",
          "Beta says nothing about downturns",
        ],
        answer: 2,
        explanation: "Lower-beta stocks have tended to fall less in market sell-offs, though they can still drop on their own news, and they've also tended to rise less in rallies.",
      },
    ],
  },
  benchmark: {
    why: [
      "A result means very little on its own. A strategy that made 40% sounds great, until you learn that simply buying the same stocks and doing nothing made 60%. All that clever trading cost money. Without something to compare with, almost any positive number looks like success.",
      "A benchmark is that something: a simple, realistic alternative you could have chosen instead. It turns \"did I make money?\" into the more useful question \"did my choices add anything?\" It's the honest yardstick for fund managers, for strategies and for your own investing.",
    ],
    how: {
      paragraphs: [
        "A good benchmark is something you could actually have done, cheaply, with the same money over the same period, and it should match what you invest in. A portfolio of large US companies is usually compared with the S&P 500; a tech fund might be compared with a tech index; a bond fund with a bond index.",
        "MarketLab's backtester offers two benchmarks. \"Same stocks\" buys the stocks in your test, in the same weights, on the first day and holds them to the end. That answers whether the strategy's buying and selling helped. \"The market\" uses the S&P 500 instead, which answers whether you'd have been better off just owning the whole market.",
        "Compare more than the [[totalReturn|return]]. A strategy that trailed its benchmark slightly but with a much smaller [[maxDrawdown|max drawdown]] might still suit someone, and that's a choice worth making knowingly. The [[sharpe|Sharpe ratio]] puts both sides together.",
      ],
    },
    example: {
      setup: "Over five years, a [[maCrossover|moving-average crossover]] strategy grew $10,000 to $14,000. Buying and holding the same stocks grew it to $16,000, and the S&P 500 grew it to $15,000.",
      steps: [
        "Strategy's total return: $14,000 ÷ $10,000 − 1 = +40%.",
        "Same stocks, bought and held: $16,000 ÷ $10,000 − 1 = +60%. The strategy trailed by 20 percentage points, or $2,000.",
        "In proportion: $14,000 ÷ $16,000 = 0.875, so the strategy ended with 12.5% less money than doing nothing.",
        "Against the market: the S&P 500 made +50%, so the strategy trailed that by 10 points too.",
      ],
      result: "The strategy made money, but it did worse than both benchmarks. On return alone, the trading cost $2,000 compared with simply holding.",
    },
    demo: "benchmark",
    reading: [
      { label: "Beat the benchmark", meaning: "The strategy added something. Check it held up across different periods, and wasn't just luck or [[overfitting]]." },
      { label: "Matched it", meaning: "No gain from the extra effort. After real [[tradingCosts|trading costs]], it would probably have trailed." },
      { label: "Trailed it", meaning: "Doing nothing would have been better on return. It may still have been calmer, so compare the drawdowns." },
    ],
    realWorld: [
      "Fund reports show the fund's returns next to a market index. S&P's long-running SPIVA reports have found that, over 10 years or more, most actively managed funds of large US companies have trailed the S&P 500, which is a big reason index funds have grown so popular.",
      "Professional managers are often paid partly on how much they beat their benchmark, so the choice of benchmark matters a lot. A manager who picks an easy one can look skilled without being so.",
      "Investors can use the same idea at home: compare your account's return each year with a simple index fund over the same dates, including any money you added or took out.",
    ],
    mistakes: [
      "Picking a benchmark that doesn't match. A tech-heavy portfolio compared with a bond index will look brilliant in good years and awful in bad ones.",
      "Comparing different periods. A strategy's last three years against an index's last ten tells you nothing.",
      "Comparing a total return that includes dividends with an index's price-only return.",
      "Judging on one period. Beating a benchmark for a year or two is common; doing it for decades is rare.",
    ],
    inMarketLab: [
      {
        label: "Moving average vs holding",
        href: backtestLink({ kind: "moving-average", fast: 50, slow: 200 }, ["AAPL", "MSFT"]),
        text: "Open a backtest of a 50/200-day moving-average crossover on Apple and Microsoft, compared with buying and holding the same two stocks.",
      },
      {
        label: "Moving average vs the market",
        href: backtestLink({ kind: "moving-average", fast: 50, slow: 200 }, ["AAPL", "MSFT"], { benchmark: "market" }),
        text: "The same strategy, compared with the S&P 500 instead.",
      },
      { label: "Portfolio", href: "/portfolio", text: "Compare your portfolio with the S&P 500, Nasdaq or Dow as growth of $100." },
    ],
    related: ["buyAndHold", "totalReturn", "sharpe", "overfitting"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is a benchmark?",
        choices: [
          "The best result a strategy has ever had",
          "A simple alternative a result is compared with, like an index",
          "The price at which a stock is bought",
        ],
        answer: 1,
        explanation: "A benchmark is the yardstick: what you'd have got from a simple, realistic alternative over the same period.",
      },
      {
        kind: "Using it",
        prompt: "A strategy returns +25%. Buying and holding the same stocks returned +35%. What's the fair conclusion?",
        choices: [
          "The strategy worked, because it made money",
          "The strategy beat the market",
          "The strategy did 10 points worse than doing nothing",
          "You can't compare them",
        ],
        answer: 2,
        explanation: "Holding the same stocks is the do-nothing alternative. Trailing it by 10 points means the trading subtracted value.",
      },
      {
        kind: "Using it",
        prompt: "Which is the most suitable benchmark for a portfolio of large US companies?",
        choices: ["A bond index", "The S&P 500", "A savings account rate", "Last year's best stock"],
        answer: 1,
        explanation: "The S&P 500 holds large US companies and can be bought cheaply through an index fund, so it matches what's being measured.",
      },
      {
        kind: "Real world",
        prompt: "Why have index funds grown so popular with ordinary investors?",
        choices: [
          "Because long-running studies found most active funds trailed their index over 10 years or more",
          "Because index funds never lose money",
          "Because index funds are guaranteed to beat active funds every year",
        ],
        answer: 0,
        explanation: "Reports like SPIVA have found that most active large-company funds fell short of their benchmark over long periods, often partly because of fees. Index funds can still fall.",
      },
    ],
  },
  exposure: {
    why: [
      "Some strategies are always invested. Others step in and out of the market, holding cash while they wait for a signal. Time invested shows how much of the period a strategy actually had money in the market, and that helps explain its results.",
      "A strategy that's in the market only half the time can only earn the market's gains on those days. If it trails buying and holding, low time invested is often why. On the other hand, it may have dodged some of the worst falls, which shows up as a smaller [[maxDrawdown|max drawdown]]. Time invested is the key to reading that trade-off.",
    ],
    how: {
      paragraphs: [
        "MarketLab counts the trading days in a backtest on which the strategy held any stock at all, and divides by the total number of trading days. A day with even a small holding counts as invested, so time invested says how often the strategy was in the market, not how much of its money was.",
        "Buy and hold is invested from the first day, so it shows 100% (or very close). A [[maCrossover|moving-average crossover]] sells everything when the fast average drops below the slow one and waits in cash, so it often lands well below 100%. In MarketLab's backtester, cash earns no interest, so days out of the market earn exactly 0%.",
        "The stock market's long-run gains have come unevenly, with a lot of the total made on a small number of strong days. Many of the strongest days have come close to the weakest ones, in the middle of a sell-off, exactly when an in-and-out strategy is most likely to be in cash.",
      ],
      formula: {
        expression: "Time invested = days holding any stock ÷ total trading days",
        reading: "The share of the period with money in the market rather than all in cash.",
      },
    },
    example: {
      setup: "A five-year backtest covers 1,260 trading days. A moving-average strategy holds stocks on 819 of them and returns +30%. Buying and holding the same stocks returns +50%.",
      steps: [
        "Time invested: 819 ÷ 1,260 = 0.65, or 65%.",
        "Days in cash: 1,260 − 819 = 441, about 35% of the period, earning nothing.",
        "Buy and hold: invested on all 1,260 days, so 100%.",
        "Much of the 20-point shortfall is likely to come from the 441 days it sat out: if the stocks rose on balance during those days, the strategy missed those gains.",
      ],
      result: "The strategy was invested 65% of the time and gave up some return. Whether it was worth it depends on whether its max drawdown was much smaller than buying and holding.",
    },
    demo: "benchmark",
    reading: [
      { label: "100%", meaning: "Always in the market, like buy and hold. It gets all the gains and all the falls." },
      { label: "About 50% to 90%", meaning: "Typical of trend-following strategies. Expect a smaller drawdown, and often a lower return." },
      { label: "Below 30%", meaning: "Mostly in cash. Its results rest on a few trades, so a single good or bad call can dominate, and luck plays a big part." },
    ],
    realWorld: [
      "Fund managers talk about being \"fully invested\" or \"holding cash\". Many stock funds keep only a few percent in cash, because cash has tended to drag on returns over long periods.",
      "Studies by fund companies have found that missing just a handful of the market's best days over a couple of decades could cut the final result dramatically. This is a common argument against trying to time the market.",
      "Real investors' cash usually earns some interest in a savings account or money market fund. When rates are high, that makes sitting out less costly than it is in MarketLab's backtester.",
    ],
    mistakes: [
      "Reading 80% time invested as 80% of the money invested. One small holding makes a day count as invested.",
      "Comparing returns without noticing time invested. A strategy that was in cash during a crash looks clever in that period and can lag for years after.",
      "Assuming lower time invested always means lower risk. Being out of the market protects you from falls only if you're out at the right times.",
    ],
    inMarketLab: [
      {
        label: "Moving average vs holding",
        href: backtestLink({ kind: "moving-average", fast: 50, slow: 200 }, ["AAPL", "MSFT"]),
        text: "Open a backtest of a 50/200-day moving-average crossover on Apple and Microsoft. Its time invested sits next to buy and hold's 100%.",
      },
      { label: "Backtest", href: "/backtest", text: "Every backtest result lists time invested next to the number of trades." },
    ],
    related: ["maCrossover", "buyAndHold", "benchmark", "maxDrawdown"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "In MarketLab, what does time invested measure?",
        choices: [
          "The share of trading days with any stock held",
          "The share of the money that was in stocks on average",
          "How many years the backtest covered",
          "How long each trade lasted",
        ],
        answer: 0,
        explanation: "It counts the days with any holdings, divided by all trading days. It says how often the strategy was in the market, not how much money was in.",
      },
      {
        kind: "Using it",
        prompt: "A backtest has 1,260 trading days, and the strategy holds stocks on 315 of them. What's its time invested?",
        choices: ["315%", "40%", "25%", "75%"],
        answer: 2,
        explanation: "315 ÷ 1,260 = 0.25, or 25%. It was in cash on the other 75% of days.",
      },
      {
        kind: "Using it",
        prompt: "A strategy with 55% time invested trails buy and hold, but its max drawdown is half as deep. What's the best reading?",
        choices: [
          "It's broken and should be thrown away",
          "It gave up some return to avoid some falls, a trade-off you can judge on your own priorities",
          "It must have used more trading costs than buy and hold",
        ],
        answer: 1,
        explanation: "Sitting out costs return when the market rises but can soften crashes. Whether that's worth it is a matter of trade-offs, not a clear win or loss.",
      },
      {
        kind: "Real world",
        prompt: "Why do many advisers warn against moving in and out of the market?",
        choices: [
          "Because trading is illegal for ordinary investors",
          "Because cash always loses money",
          "Because a lot of the market's gains have come on a few days, often close to the worst ones, which are easy to miss",
        ],
        answer: 2,
        explanation: "Studies have found that missing a handful of the best days can cut long-run results sharply, and those days often arrive during sell-offs, when nervous investors are out.",
      },
    ],
  },
};
