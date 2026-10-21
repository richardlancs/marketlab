import type { TermKey } from "../../glossary";
import { backtestLink } from "../links";
import type { Lesson } from "../types";

export const STRATEGIES_LESSONS: Partial<Record<TermKey, Lesson>> = {
  buyAndHold: {
    why: [
      "Buy and hold is the simplest strategy there is, and that's exactly why it matters. It's the yardstick: any cleverer strategy has to beat it after costs, taxes and effort to be worth the trouble, and over long periods most don't.",
      "It works because of two quiet facts. Stock markets have risen over most long stretches of history, so time in the market tends to pay. And a large share of the gains arrive on a handful of unpredictable days, often right after sharp falls. Someone who stays invested is guaranteed to be there for them.",
    ],
    how: {
      paragraphs: [
        "You choose your investments, buy them once and then leave them alone. There are no signals and no timing. You don't sell because the news is bad or buy more because a stock is popular. Over time, [[compounding]] does the work: gains, and the [[dividend|dividends]] that are reinvested, start earning gains of their own.",
        "The choice of what to hold still matters a lot. Holding one stock for twenty years is a bet on one company, and some companies shrink or fail. Most people who follow this strategy hold a broad, diversified mix, often through [[etf|index funds]], so the long-run result tracks the whole market rather than one firm's luck.",
        "The cost is emotional. A buy-and-hold investor sits through every crash in full. The broad US market has fallen by a third or more several times, and holding on through those falls is the whole strategy.",
      ],
    },
    example: {
      setup: "You put $10,000 into a stock at $50 a share. Over the next year it falls to $35, then over the following years it climbs to $70.",
      steps: [
        "Shares bought: $10,000 ÷ $50 = 200 shares.",
        "At the low: 200 × $35 = $7,000, a 30% loss on paper.",
        "Holding on: 200 × $70 = $14,000, a 40% gain.",
        "Compare a nervous investor who sold at $35 for $7,000 and bought back once the price had recovered to $50: $7,000 ÷ $50 = 140 shares, worth 140 × $70 = $9,800 at the end.",
      ],
      result: "The holder ended with $14,000; the investor who sold at the low and waited for things to feel safe ended with $9,800, a 2% loss, despite owning the same stock over the same years.",
    },
    reading: [
      { label: "Long bull market", meaning: "Buy and hold shines. It's fully invested the whole way up and pays no trading costs, so most active strategies trail it." },
      { label: "Sharp crash and recovery", meaning: "It takes the full fall, which shows up as a deep [[maxDrawdown|max drawdown]], but it also catches the full rebound, including the big up days that often come soon after the worst ones." },
      { label: "Long sideways or falling market", meaning: "Its weakest case. A single market or stock can go a decade or more without gaining, and buy and hold simply waits." },
    ],
    realWorld: [
      "Index fund investors are buy-and-hold investors. Year after year, reports comparing funds have found that the large majority of actively managed US stock funds trail a simple index over periods of ten years or more, mostly because of their higher fees and trading costs.",
      "Studies of the US market have found that missing only the 10 best days over a couple of decades would have cut the total gain roughly in half. Many of those best days came within weeks of the worst ones, when nervous investors had just sold.",
      "Warren Buffett's Berkshire Hathaway is a famous long-term holder: it has owned its Coca-Cola shares since the late 1980s, collecting rising dividends the whole time.",
    ],
    mistakes: [
      "Holding without [[diversification]]. Buy and hold works for broad markets over long periods; a single stock can fall and never come back.",
      "Calling it buy and hold, then selling in a panic. Selling after a crash and buying back later turns a temporary loss on paper into a permanent one.",
      "Forgetting that time matters. Money you'll need in two years can't wait out a fall that takes five years to recover.",
    ],
    inMarketLab: [
      {
        label: "Three stocks against the market",
        href: backtestLink({ kind: "buy-and-hold" }, ["AAPL", "JPM", "KO"], { benchmark: "market" }),
        text: "Opens a backtest that buys Apple, JPMorgan and Coca-Cola in equal parts and holds them for five years, compared with the S&P 500.",
      },
      { label: "Backtest", href: "/backtest", text: "Every other strategy is compared with buying and holding the same stocks, so you can see whether its trading actually helped." },
    ],
    related: ["compounding", "diversification", "benchmark", "maxDrawdown"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does a buy-and-hold investor do when the market falls 20%?",
        choices: ["Sells and waits for a recovery", "Nothing: keeps holding the same investments", "Moves everything into cash", "Buys only the stocks that fell most"],
        answer: 1,
        explanation: "Buy and hold means keeping your investments through ups and downs. Selling or switching on bad news is market timing, which the strategy avoids.",
      },
      {
        kind: "Using it",
        prompt: "You buy 100 shares at $40. The price falls to $30, then rises to $60. What's your holding worth at the end, and what's the gain?",
        choices: ["$3,000, a 25% loss", "$4,000, no gain", "$6,000, a 50% gain", "$6,000, a 100% gain"],
        answer: 2,
        explanation: "100 × $60 = $6,000, against $4,000 paid (100 × $40): a 50% gain. The fall to $30 along the way doesn't matter if you didn't sell.",
      },
      {
        kind: "Real world",
        prompt: "Why do studies find that missing the market's best few days hurts long-run returns so much?",
        choices: [
          "Because the best days are always on Mondays",
          "Because a large share of the gains comes on a few days, often right after big falls when people have sold",
          "Because brokers charge more on those days",
          "They don't: missing the best days has little effect",
        ],
        answer: 1,
        explanation: "Gains are bunched into a few days that often follow sharp drops. Investors who sold during the fall usually miss them, which is why staying invested matters.",
      },
      {
        kind: "Real world",
        prompt: "Why do most actively managed stock funds trail a buy-and-hold index fund over long periods?",
        choices: ["Index funds are allowed to see prices earlier", "Their higher fees and trading costs eat into returns year after year", "Active funds aren't allowed to own large companies"],
        answer: 1,
        explanation: "Before costs, the average active dollar roughly earns the market's return. After higher fees and trading costs, most fall behind, and the gap compounds over time.",
      },
    ],
  },

  dollarCostAveraging: {
    why: [
      "Most people don't have a big pile of money to invest on day one. They have a paycheck, and they invest a slice of it every month. That's dollar-cost averaging, whether they call it that or not, and it's how most ordinary investors build wealth.",
      "It also answers a common worry. If you do have a lump sum, putting all of it in the day before a crash feels awful. Spreading it out means no single bad day decides your result. That comfort has a price, though, and it's worth knowing what it is.",
    ],
    how: {
      paragraphs: [
        "You pick a fixed amount and a schedule, say $500 on the first of every month, and stick to it whatever the price. Because the amount is fixed, it buys more shares when the price is low and fewer when it's high. The result is that your average cost per share ends up below the simple average of the prices you paid.",
        "When you already have a lump sum, the choice is different. Investing it all at once puts the whole amount to work right away. Spreading it out keeps part of it in cash for months, and since markets rise more often than they fall, that waiting money usually misses gains. Dollar-cost averaging tends to win only when prices fall during the months you're buying.",
        "In MarketLab's backtester, the starting cash is split into the number of installments you choose. It buys on the first day and then at the start of each month, each time spending an equal share of the cash that's left, so the last purchase uses it all up.",
      ],
      formula: {
        expression: "Average cost per share = total amount invested ÷ total shares bought",
        reading: "What each share cost you on average, which beats the average price because cheap months buy more shares.",
      },
    },
    example: {
      setup: "You invest $100 a month for five months. The price goes $50, $40, $25, $40, $50: a dip, then back to where it started.",
      steps: [
        "Shares each month: $100 ÷ $50 = 2, $100 ÷ $40 = 2.5, $100 ÷ $25 = 4, $100 ÷ $40 = 2.5 and $100 ÷ $50 = 2.",
        "Total: $500 bought 2 + 2.5 + 4 + 2.5 + 2 = 13 shares.",
        "Average cost: $500 ÷ 13 ≈ $38.46 a share, below the average price of ($50 + $40 + $25 + $40 + $50) ÷ 5 = $41.",
        "At the end: 13 × $50 = $650, a 30% gain. The same $500 invested all at once at $50 would have bought 10 shares, worth $500 at the end.",
      ],
      result: "Here dollar-cost averaging won, because the price dipped while it was buying. If the price had climbed steadily instead, the lump sum would have won, because it bought everything at the lowest price.",
    },
    demo: "dollarCostAveraging",
    reading: [
      { label: "Steadily rising market", meaning: "Lump sum wins. Every month you wait, the price is higher, so the later installments buy fewer shares." },
      { label: "Market that dips, then recovers", meaning: "Dollar-cost averaging wins. The cheap months buy extra shares, and the average cost ends below where you started." },
      { label: "Choppy, sideways market", meaning: "The two end up close. The average cost lands near the middle of the range either way." },
    ],
    realWorld: [
      "Workplace retirement plans such as a 401(k) take a slice of every paycheck and invest it automatically. That's dollar-cost averaging in practice, and it's why millions of people keep buying through crashes without having to decide to.",
      "Studies of US markets comparing the two ways to invest a lump sum have found that investing it all at once came out ahead about two-thirds of the time, because markets rose in most periods. The gap was usually modest.",
      "Many advisers still suggest spreading a large windfall over several months for people who'd otherwise not invest at all. The goal there is getting started without regret, not a higher return.",
    ],
    mistakes: [
      "Thinking it lowers risk for good. Once all the money is in, you hold exactly what a lump-sum investor holds. It only changes the timing of getting there.",
      "Stopping the purchases when prices fall. The low months are where the strategy earns its advantage, so pausing then throws it away.",
      "Ignoring [[tradingCosts|trading costs]]. With a fixed fee per trade, many small purchases cost more than one big one.",
    ],
    inMarketLab: [
      {
        label: "Twelve monthly purchases",
        href: backtestLink({ kind: "dollar-cost-averaging", installments: 12 }, ["MSFT"]),
        text: "Opens a backtest that buys Microsoft in 12 monthly installments, compared with buying it all on day one.",
      },
      { label: "Test a range of settings", href: "/backtest", text: "On a dollar-cost-averaging backtest, vary the number of monthly purchases from 1 to 60 to see how much waiting cost or saved." },
    ],
    related: ["buyAndHold", "compounding", "exposure", "tradingCosts"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is dollar-cost averaging?",
        choices: [
          "Buying more whenever a stock falls 10%",
          "Averaging the price of several stocks before buying",
          "Investing a fixed amount on a regular schedule, whatever the price",
          "Selling a fixed amount every month",
        ],
        answer: 2,
        explanation: "It means investing the same amount at regular intervals. Because the amount is fixed, it automatically buys more shares when prices are low.",
      },
      {
        kind: "Using it",
        prompt: "You invest $200 at $20 a share, then $200 at $10. What's your average cost per share?",
        choices: ["$15.00", "$13.33", "$10.00", "$16.67"],
        answer: 1,
        explanation: "$200 ÷ $20 = 10 shares and $200 ÷ $10 = 20 shares: 30 shares for $400, so $400 ÷ 30 ≈ $13.33, below the $15 average price.",
      },
      {
        kind: "Using it",
        prompt: "You have $12,000 and the market rises steadily for the next year. Which approach likely ends higher?",
        choices: ["Investing $1,000 a month for 12 months", "Investing all $12,000 on day one", "They always end the same"],
        answer: 1,
        explanation: "In a rising market each later installment buys at a higher price, while the lump sum bought everything at the start, when it was cheapest.",
      },
      {
        kind: "Real world",
        prompt: "How do most people in a workplace retirement plan like a 401(k) invest?",
        choices: ["They try to time the market each quarter", "A share of every paycheck is invested automatically: dollar-cost averaging", "They invest once when they're hired and never again", "They only buy when prices drop"],
        answer: 1,
        explanation: "Contributions come out of each paycheck and are invested on a schedule, so the plan buys through good and bad markets alike.",
      },
    ],
  },

  rebalancing: {
    why: [
      "When you pick a mix, say 60% stocks and 40% bonds, you're choosing how much risk to take. But the mix doesn't stay put. Whatever grows fastest takes up more and more of the portfolio, and after a long rally you may hold far more stocks, and far more risk, than you signed up for.",
      "Rebalancing pulls the portfolio back to the mix you chose. It's a discipline more than a way to boost returns: it keeps the risk steady, and it makes you do something most people find hard, which is to sell some of what's been winning and buy what's been lagging.",
    ],
    how: {
      paragraphs: [
        "On a schedule, you work out each holding's share of the total and compare it with its target. Then you sell what's above target and buy what's below until every weight is back where it started. Some investors use a calendar, such as once a quarter or once a year; others rebalance only when a weight drifts past a band, such as five points.",
        "In MarketLab's backtester, the portfolio starts at your chosen weights and is reset to them at the start of every month, or every third month for quarterly, counting from the start of the test.",
        "How often matters less than people expect. Rebalancing too often adds [[tradingCosts|trading costs]] and, in a taxable account, taxes on the gains you sell. Too rarely, and the mix can drift a long way. Many investors settle on once or twice a year.",
      ],
      formula: {
        expression: "Amount to trade = target weight × total value − current value of the holding",
        reading: "A positive number means buy that much; a negative one means sell it.",
      },
    },
    example: {
      setup: "You invest $10,000 at 60% stocks and 40% bonds: $6,000 and $4,000. In the first year stocks rise 30% and bonds 5%.",
      steps: [
        "After a year: stocks $6,000 × 1.30 = $7,800, bonds $4,000 × 1.05 = $4,200, total $12,000.",
        "Drift: stocks are now $7,800 ÷ $12,000 = 65% of the portfolio, not 60%.",
        "Rebalance: the stock target is 60% × $12,000 = $7,200, so sell $600 of stocks and buy $600 of bonds, leaving $7,200 and $4,800.",
        "The next year stocks fall 20% and bonds are flat. Rebalanced: $7,200 × 0.8 + $4,800 = $10,560. Not rebalanced: $7,800 × 0.8 + $4,200 = $10,440.",
      ],
      result: "Rebalancing locked in some of the stock gains before the fall and left the portfolio $120 ahead. Had stocks kept rising instead, the untouched portfolio would have come out ahead, but with more risk along the way.",
    },
    demo: "rebalancing",
    reading: [
      { label: "Long bull market in one asset", meaning: "Rebalancing usually trails letting it ride, because it keeps trimming the winner. In exchange, the risk stays where you set it." },
      { label: "Sideways, back-and-forth market", meaning: "Its best case. Selling after rises and buying after falls can add a little return as prices swing around a level." },
      { label: "Crash", meaning: "A portfolio that was rebalanced falls less, because it held less of the asset that crashed, and the next rebalance buys more of it while it's cheap." },
    ],
    realWorld: [
      "Target-date retirement funds and balanced funds rebalance automatically to keep their mix of stocks and bonds on target, so their investors don't have to.",
      "Pension funds and university endowments set target weights for each type of asset, with ranges around them, and rebalance when holdings stray outside those ranges.",
      "Many investors avoid selling, and the taxes that come with it, by rebalancing with new money instead: they direct each new contribution to whatever is below its target.",
    ],
    mistakes: [
      "Expecting it to raise returns. Its main job is controlling risk; when one asset keeps winning for years, rebalancing will usually end lower.",
      "Rebalancing so often that costs and taxes eat the benefit. Small drifts of a point or two rarely matter.",
      "Abandoning it in a crash. Buying what just fell feels wrong, but that's exactly when the discipline does its job.",
    ],
    inMarketLab: [
      {
        label: "Three stocks, rebalanced quarterly",
        href: backtestLink({ kind: "rebalancing", frequency: "quarterly" }, ["AAPL", "KO", "JPM"]),
        text: "Opens a backtest that holds a third each in Apple, Coca-Cola and JPMorgan and resets the weights every three months, compared with buying and holding them.",
      },
    ],
    related: ["diversification", "riskParity", "buyAndHold", "tradingCosts"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does rebalancing do?",
        choices: [
          "Moves everything into the best performer",
          "Sells some of what grew and buys what shrank, to return to the target mix",
          "Spreads purchases over several months",
          "Sells everything when the market falls",
        ],
        answer: 1,
        explanation: "Rebalancing restores the weights you chose. Spreading purchases out is dollar-cost averaging.",
      },
      {
        kind: "Using it",
        prompt: "Your 50/50 portfolio is now $7,000 in stocks and $3,000 in bonds. What trade rebalances it?",
        choices: ["Sell $1,000 of bonds and buy stocks", "Sell $4,000 of stocks and buy bonds", "Sell $2,000 of stocks and buy bonds", "No trade is needed"],
        answer: 2,
        explanation: "The total is $10,000, so each half should be $5,000. Selling $2,000 of stocks and buying $2,000 of bonds gets there.",
      },
      {
        kind: "Using it",
        prompt: "Stocks have risen strongly for five straight years. Compared with letting the portfolio drift, a rebalanced one has most likely:",
        choices: ["Earned a bit less, with less risk", "Earned more, with more risk", "Earned exactly the same"],
        answer: 0,
        explanation: "Rebalancing kept trimming the rising stocks, so it held less of the winner. It gave up some return to keep the risk where it was set.",
      },
      {
        kind: "Real world",
        prompt: "Which of these rebalances automatically on behalf of its investors?",
        choices: ["A single company's stock", "A savings account", "A target-date retirement fund"],
        answer: 2,
        explanation: "Target-date funds hold a mix of stocks and bonds and rebalance to keep it on target, shifting slowly toward bonds as the retirement date nears.",
      },
    ],
  },

  maCrossover: {
    why: [
      "Buy and hold sits through every crash. A moving-average crossover tries not to. It's one of the oldest and simplest trend-following rules: stay invested while the price trend is up, step into cash while it's down, and let a mechanical rule decide instead of your nerves.",
      "It's worth learning because it shows the basic trade-off of every timing strategy. Getting out of a long fall is valuable, but the rule can only react to moves that have already happened, so it gives back a slice of every trend and gets fooled when the market just churns.",
    ],
    how: {
      paragraphs: [
        "Take two [[sma|simple moving averages]] of the closing price: a fast one over a short window, such as 50 days, and a slow one over a long window, such as 200. When the fast average climbs above the slow one, recent prices are running above the longer-term level, a sign of an uptrend, so you buy. When it drops back below, you sell and hold cash.",
        "Because averages lag, the signals come late by design. A 200-day average barely moves for weeks after a turn. That lag filters out small wiggles, but it also means you buy well above the bottom and sell well below the top.",
        "In MarketLab's backtester the rule runs per stock. Each stock is held at its weight while its fast average is above its slow one, and its share sits in cash otherwise. It trades only on a crossover, and it starts once there are enough days of prices to compute the slow average, so it holds cash at first.",
      ],
      formula: {
        expression: "Hold if fast SMA > slow SMA; otherwise hold cash",
        reading: "Own the stock while its recent average is above its longer-term average, and step aside when it isn't.",
      },
    },
    example: {
      setup: "A stock falls from $100 to a low of $80, then climbs to $140 and slips back. The strategy holds cash during the fall.",
      steps: [
        "The fast average crosses above the slow one when the price is $110: buy. That's $110 ÷ $80 − 1 = 37.5% above the low.",
        "The price peaks at $140. The averages are still rising, so the strategy holds.",
        "The fast average crosses below when the price is $120: sell. That's $20 ÷ $140 ≈ 14% below the peak.",
        "Gain on the trade: $120 ÷ $110 − 1 ≈ 9.1%, against a rise of $140 ÷ $80 − 1 = 75% from low to peak.",
        "Then the price drifts sideways. A new buy signal comes at $122, and a sell follows at $118: a loss of $4 ÷ $122 ≈ 3.3%, a whipsaw.",
      ],
      result: "The rule avoided the fall to $80 and still made 9.1% on the uptrend, but missed most of the move because of lag, then lost 3.3% when a false signal hit a sideways market.",
    },
    demo: "movingAverage",
    reading: [
      { label: "Long, steady trends", meaning: "Its best case. It rides most of a long rise and steps aside for most of a long fall, which can mean a much smaller [[maxDrawdown|max drawdown]] than buy and hold." },
      { label: "Sideways, choppy market", meaning: "Its worst case. The averages keep crossing back and forth, so it buys high and sells low over and over, losing a little each time." },
      { label: "Sharp V-shaped crash", meaning: "It often sells near the bottom and buys back well above it, missing the quick rebound and ending behind buy and hold." },
    ],
    realWorld: [
      "The 50-day and 200-day averages are watched closely by traders and financial news. A fast average crossing above the slow one is widely called a golden cross, and crossing below a death cross, though neither reliably predicts what comes next.",
      "Trend-following funds, often called managed futures funds, apply rules in this family across many markets at once, such as stocks, bonds, currencies and commodities. They've tended to do best in long trends, including some major crashes, and to struggle for years in markets without clear trends.",
      "Many studies have found that simple trend rules on a stock index reduced the depth of the worst falls in the past, but often gave up return in strong bull markets, and that results depend heavily on the averages chosen and on trading costs.",
    ],
    mistakes: [
      "Expecting it to buy at the bottom and sell at the top. Lag guarantees it buys after a rise has started and sells after a fall has begun.",
      "Ignoring [[tradingCosts|trading costs]] and taxes. A choppy year can produce many trades, and each one costs a little.",
      "Picking the averages that worked best in a backtest. That's a recipe for [[overfitting]]; check that nearby settings also work.",
      "Forgetting the time in cash. The strategy is often out of the market, so compare it on risk as well as return.",
    ],
    inMarketLab: [
      {
        label: "The classic 50/200 on Nvidia",
        href: backtestLink({ kind: "moving-average", fast: 50, slow: 200 }, ["NVDA"]),
        text: "Opens a backtest of the 50-day and 200-day crossover on Nvidia, with every trade listed, compared with buying and holding it.",
      },
      { label: "Moving averages", href: "/learn/moving-average", text: "The lesson on simple moving averages explains the two lines this strategy compares, and why they lag." },
    ],
    related: ["sma", "exposure", "overfitting", "buyAndHold"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "In a moving-average crossover, what is the buy signal?",
        choices: ["The price falls below the slow average", "The fast average crosses above the slow average", "The two averages are equal for a week", "The price hits a new low"],
        answer: 1,
        explanation: "When the short-window average rises above the long-window one, recent prices are above the longer-term trend, which the rule reads as an uptrend.",
      },
      {
        kind: "Using it",
        prompt: "The strategy buys at $60 and sells at $54. What was the result of the trade?",
        choices: ["A 10% loss", "A 6% loss", "An 11% gain"],
        answer: 0,
        explanation: "$54 ÷ $60 − 1 = −0.10, a 10% loss. A loss like this, from a buy quickly followed by a sell, is a whipsaw.",
      },
      {
        kind: "Using it",
        prompt: "In which market does a crossover strategy usually do worst?",
        choices: ["A long, steady rise", "A long, steady fall", "A choppy market that moves sideways"],
        answer: 2,
        explanation: "In a sideways market the averages keep crossing, so the strategy repeatedly buys after small rises and sells after small dips.",
      },
      {
        kind: "Real world",
        prompt: "What do financial news outlets usually call the 50-day average crossing above the 200-day average?",
        choices: ["A death cross", "A dead-cat bounce", "A bear trap", "A golden cross"],
        answer: 3,
        explanation: "It's widely called a golden cross, and the opposite a death cross. They're popular headlines, not reliable forecasts.",
      },
    ],
  },

  overfitting: {
    why: [
      "A backtest can be made to look brilliant. Tweak the settings enough times and some combination will have dodged every past crash and caught every rally. The trouble is that it learned the past's particular noise, not anything that will happen again.",
      "This is the most common way backtests mislead people, including professionals. Knowing how it happens is what turns a backtester from a machine for fooling yourself into a useful tool.",
    ],
    how: {
      paragraphs: [
        "Past prices mix two things: patterns that might persist, and random noise that won't. Every setting you try is a new chance to fit the noise. With one setting, a good result is some evidence. After trying hundreds, the best result is mostly a measure of how many you tried.",
        "There are two good defenses. First, look at the neighborhood: if 50 and 200 days work well, 45 and 210 should work nearly as well. A strategy whose results collapse when a setting moves a little was probably tuned to luck. Second, test out of sample: choose the settings on one period, then check them on a different period you didn't look at.",
        "Fewer moving parts also help. Each extra rule or setting gives the strategy more freedom to fit the past, and makes a lucky fit more likely.",
        "A parameter sweep, which runs the same backtest over a whole grid of settings, is the right tool for the first check and the wrong tool for picking a winner. Use it to see how sensitive a strategy is to its settings, not to find the one that did best.",
      ],
    },
    example: {
      setup: "You test a crossover with 10 choices of fast average and 10 choices of slow average. Suppose none of them has a real edge, and each has a 5% chance of looking great by pure luck.",
      steps: [
        "Combinations tested: 10 × 10 = 100.",
        "Expected lucky winners: 100 × 5% = 5 settings that look great.",
        "If the results were independent, the chance that at least one looks great is 1 − 0.95¹⁰⁰ ≈ 99.4%.",
        "Settings close to each other give similar results in practice, so the true chance is lower, but the point stands.",
      ],
      result: "Testing 100 settings almost guarantees a winner, even when no setting has any edge. The best cell alone proves very little; a broad area of good results is far more convincing.",
    },
    demo: "overfitting",
    reading: [
      { label: "One standout cell in the sweep", meaning: "A warning sign. A single great setting surrounded by poor ones is probably luck." },
      { label: "A broad area of good results", meaning: "More convincing. Many nearby settings working suggests the strategy isn't hanging on one exact number." },
      { label: "Great in one period, poor in the next", meaning: "The classic sign of overfitting: the settings fit the first period's ups and downs, which didn't repeat." },
    ],
    realWorld: [
      "Researchers have found that many market patterns reported in academic studies weakened noticeably after they were published. Some had been partly luck, and others were traded away once more investors knew about them.",
      "Famous joke correlations make the point: people have found past stock returns that lined up with things like Super Bowl winners or butter production in faraway countries. Search enough data and coincidences are guaranteed.",
      "Professional quant firms set aside data they never use for tuning, limit how many variations they test, and are skeptical of backtests that look too smooth.",
    ],
    mistakes: [
      "Picking the best cell in a sweep and expecting it to keep winning. The best past setting rarely stays best.",
      "Testing on the same period you tuned on. A strategy has to be checked on data it hasn't seen.",
      "Adding rules until the backtest looks perfect. Each extra rule makes it easier to fit noise.",
      "Trusting a very high [[sharpe|Sharpe ratio]] or a tiny [[maxDrawdown|max drawdown]] from a backtest. Results that look too good usually are.",
    ],
    inMarketLab: [
      {
        label: "Test a range of settings",
        href: backtestLink({ kind: "moving-average", fast: 50, slow: 200 }, ["AAPL"]),
        text: "Opens a crossover backtest on Apple. Under the results, use Test a range of settings to sweep both averages and see whether good results form a broad area or a lone spike.",
      },
      { label: "Backtest", href: "/backtest", text: "Change the start and end dates to check settings you chose on one period against another." },
    ],
    related: ["maCrossover", "sharpe", "benchmark"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is overfitting?",
        choices: [
          "Holding too many stocks at once",
          "Tuning a strategy's settings until they fit past noise that won't repeat",
          "Investing more than you can afford",
          "Rebalancing too often",
        ],
        answer: 1,
        explanation: "An overfitted strategy has learned the random ups and downs of its test period, so its past results overstate what it can do next.",
      },
      {
        kind: "Using it",
        prompt: "In a sweep, a fast average of 23 days returns 90% while 20 and 26 days return about 10%. What's the most sensible reading?",
        choices: ["23 days has found a real pattern", "The 23-day result is probably luck, since its neighbors don't agree", "Use 23 days, and add more rules to improve it"],
        answer: 1,
        explanation: "A real edge rarely depends on one exact number. When nearby settings do much worse, the standout is most likely a fit to noise.",
      },
      {
        kind: "Using it",
        prompt: "You try 200 settings that have no real edge, and each has a 5% chance of looking great by luck. About how many will look great?",
        choices: ["None", "About 1", "About 10", "About 100"],
        answer: 2,
        explanation: "200 × 5% = 10. Testing many settings produces winners by chance alone, which is why the best one proves little.",
      },
      {
        kind: "Real world",
        prompt: "What has research found about many market patterns after they were published?",
        choices: ["They became stronger", "They often weakened noticeably", "They stayed exactly the same"],
        answer: 1,
        explanation: "Many published patterns weakened afterward: some were partly luck in the original data, and others faded as investors traded on them.",
      },
    ],
  },

  momentum: {
    why: [
      "Stocks that have risen strongly over the last several months have, on average, tended to keep doing a little better than the rest for a while afterward. This pattern, called momentum, is one of the most studied in finance, and it has shown up across many decades and many countries' markets.",
      "A momentum rotation turns that pattern into a simple rule: keep switching into whatever has been rising most. It's also one of the most painful strategies to hold. It can lag badly when the market's leadership suddenly changes, and knowing why helps you judge a backtest that looks too good.",
    ],
    how: {
      paragraphs: [
        "You choose a list of stocks and how many to hold, N. At the start of each month, measure each stock's trailing return over a lookback of 3, 6 or 12 months. MarketLab counts a month as 21 trading days, so a 6-month lookback compares today's close with the close 126 sessions ago.",
        "Rank the stocks by that return and hold the top N, putting 1/N of the money in each. Everything else is sold. Next month, rank again: a stock that drops out of the top N is sold, and the new leader is bought. The weights you enter for the stocks are ignored.",
        "An optional rule, \"only hold stocks that rose\", adds absolute momentum to the relative ranking; together they're called dual momentum. A stock in the top N is skipped if its own trailing return is zero or below, and its share of the money waits in cash. When everything is falling, the strategy is fully in cash, which can soften long bear markets, at the cost of missing sharp rebounds.",
        "Researchers often use 12-1 momentum instead: the return from 12 months ago to 1 month ago, skipping the latest month, because the very latest month has tended to partly reverse. MarketLab's Screener uses 12-1 momentum for its Momentum leaders preset; the backtest strategy uses the plain trailing return.",
      ],
      formula: {
        expression: "Score = close today ÷ close (21 × months) sessions ago − 1; hold the top N, 1/N each",
        reading: "Rank by recent return, and own an equal slice of each of the leaders.",
      },
    },
    example: {
      setup: "You run a 6-month momentum rotation on four stocks, holding the top 2, with $10,000 and \"only hold stocks that rose\" turned on. Today's closes, and the closes 126 sessions ago, are: A $120 and $100, B $45 and $50, C $66 and $60, D $82 and $80.",
      steps: [
        "Trailing returns: A 120 ÷ 100 − 1 = +20%; B 45 ÷ 50 − 1 = −10%; C 66 ÷ 60 − 1 = +10%; D 82 ÷ 80 − 1 = +2.5%.",
        "Ranked: A (+20%), C (+10%), D (+2.5%), B (−10%). The top 2 are A and C, and both rose.",
        "Each gets 1/2 of the money: $10,000 ÷ 2 = $5,000 in A and $5,000 in C.",
        "A month later, after a sell-off, the 6-month returns are A −4%, B −12%, C +3% and D −1%. The top 2 are now C and D.",
        "D's own return is below zero, so with the rule on it's skipped. C gets its 1/2 share and the other 1/2 stays in cash. A is sold.",
      ],
      result: "The strategy rotated out of A as it fell, and moved half the money to cash when only one stock was still rising. Turned off, the rule would have bought D anyway, putting all the money back in stocks during the sell-off.",
    },
    reading: [
      { label: "Short lookback (3 months)", meaning: "Reacts quickly to new leaders, but trades more and is fooled by short bursts." },
      { label: "Long lookback (12 months)", meaning: "Steadier rankings and fewer trades, but slower to leave a stock after its run ends." },
      { label: "Small N (1 or 2)", meaning: "Concentrated: the result hangs on a few stocks, so it can soar or slump far more than the group." },
      { label: "Lots of time in cash", meaning: "With \"only hold stocks that rose\" on, a long spell in cash means the chosen stocks were mostly falling. Check [[exposure|time invested]] next to the return." },
    ],
    realWorld: [
      "Momentum was documented in a widely cited 1993 study by Narasimhan Jegadeesh and Sheridan Titman, and it has since been found in stocks, bonds, currencies and commodities. Many funds now offer momentum strategies, often built on 12-1 momentum and rebalanced monthly or quarterly.",
      "Its big weakness is the momentum crash. When a long fall suddenly reverses, the beaten-down stocks rebound hardest while the strategy still holds last year's safe leaders. In 2009, momentum strategies in US stocks lost heavily in a few months as the market rebounded.",
      "Dual momentum, popularized by Gary Antonacci, uses the absolute rule as a crude bear-market switch. Like other timing rules, it has sometimes cut drawdowns and sometimes just missed rebounds, depending on the period tested.",
    ],
    mistakes: [
      "Testing on today's winners. Choosing stocks you already know soared, then showing momentum picked them, is hindsight, not evidence.",
      "Ignoring [[tradingCosts|trading costs]]. Monthly rotation can trade a lot, and each switch costs a little.",
      "Trying every lookback and N until one wins. That's [[overfitting]]; the gaps between 3, 6 and 12 months should be modest if the idea is sound.",
      "Expecting it to work every year. Momentum has had long dry spells and sudden crashes even when it worked over decades.",
    ],
    inMarketLab: [
      {
        label: "Backtest: momentum rotation",
        href: backtestLink({ kind: "momentum-rotation", top: 2, lookbackMonths: 6, absolute: true }, ["AAPL", "MSFT", "NVDA", "XOM"]),
        text: "Opens a 6-month rotation among Apple, Microsoft, NVIDIA and Exxon Mobil, holding the top 2 that rose, compared with holding all four equally.",
      },
      { label: "Screener: Momentum leaders", href: "/screener?preset=momentum", text: "The Momentum leaders preset lists the top fifth of stocks by 12-1 momentum that are still above their 200-day average." },
    ],
    related: ["maCrossover", "exposure", "overfitting", "riskParity"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does a momentum rotation hold each month?",
        choices: [
          "The stocks that fell the most, expecting a rebound",
          "The top N of your chosen stocks by trailing return",
          "Every stock, in equal amounts",
          "The cheapest stocks by P/E ratio",
        ],
        answer: 1,
        explanation: "It ranks the chosen stocks by their return over the lookback and holds the leaders, 1/N of the money each, re-ranking every month.",
      },
      {
        kind: "Using it",
        prompt: "With a 3-month lookback, how many trading sessions back does MarketLab compare today's close with?",
        choices: ["63", "90", "21", "252"],
        answer: 0,
        explanation: "MarketLab counts 21 trading days a month, so 3 months is 3 × 21 = 63 sessions.",
      },
      {
        kind: "Using it",
        prompt: "A stock closed at $40 twelve months ago, $50 one month ago and $48 today. What is its 12-1 momentum?",
        choices: ["+20%", "−4%", "+25%", "+30%"],
        answer: 2,
        explanation: "12-1 momentum skips the latest month: $50 ÷ $40 − 1 = +25%. The plain 12-month return would be $48 ÷ $40 − 1 = +20%.",
      },
      {
        kind: "Real world",
        prompt: "When have momentum strategies tended to suffer their worst losses?",
        choices: [
          "In long, steady bull markets",
          "When interest rates are stable",
          "When companies pay large dividends",
          "When a long fall suddenly reverses into a sharp rebound",
        ],
        answer: 3,
        explanation: "In a sharp rebound, the stocks that fell most bounce hardest while the strategy still holds the previous leaders. 2009 is the classic example.",
      },
    ],
  },

  riskParity: {
    why: [
      "Putting equal money into each holding sounds balanced, but the risk isn't. If one stock swings three times as much as another, it drives most of the portfolio's ups and downs, even at the same weight. Equal dollars can mean very unequal risk.",
      "Risk parity sets the weights so that each holding adds about the same amount of risk instead. It's one of the main alternatives to weighting by money or by size, and some of the largest funds in the world use versions of it to spread risk across stocks, bonds and other assets.",
    ],
    how: {
      paragraphs: [
        "Work out each holding's [[volatility]], then weight it by one divided by that volatility, scaled so the weights add up to 100%. A stock half as volatile as another gets twice the weight. Since each holding's weight times its volatility comes out the same, each contributes about the same amount of swing.",
        "MarketLab's Risk parity backtest uses the standard deviation of each stock's last 63 daily returns, about three months, and resets the weights at the start of every month or quarter, as you choose. Between resets, the weights drift with prices, as in [[rebalancing]]. It waits in cash until there are 63 returns to measure.",
        "This simple version ignores [[correlation]]: it treats each holding's risk on its own. Two closely related stocks each get their full share, so together they add more risk than an unrelated one. Full risk parity, used by the Optimise tab in the portfolio's Risk analysis, accounts for how holdings move together and sets weights so their risk contributions come out equal, within its cap on any one stock.",
        "Because risk parity leans toward calmer holdings, it usually swings less than equal weights. It doesn't aim for the highest return: calm stocks are often slower growers, so in a strong rally led by volatile stocks it tends to lag.",
      ],
      formula: {
        expression: "weight of a holding = (1 ÷ its volatility) ÷ (sum of 1 ÷ volatility over all holdings)",
        reading: "The calmer a holding, the bigger its weight, so each adds about the same risk.",
      },
    },
    example: {
      setup: "You hold two stocks: a steady one with a volatility of 15% and a volatile one with 30%. Compare equal weights with risk parity, then add a third stock.",
      steps: [
        "Equal weights: 50% × 15% = 7.5% of swing from the steady stock, and 50% × 30% = 15% from the volatile one. The volatile stock contributes twice as much.",
        "Risk parity: 1 ÷ 0.15 ≈ 6.67 and 1 ÷ 0.30 ≈ 3.33, which add up to 10. The weights are 6.67 ÷ 10 ≈ 66.7% and 3.33 ÷ 10 ≈ 33.3%.",
        "Check the contributions: 66.7% × 15% = 10% and 33.3% × 30% = 10%. They're equal.",
        "With three stocks at 10%, 20% and 40% volatility: 1 ÷ volatility gives 10, 5 and 2.5, which add up to 17.5. The weights are 10 ÷ 17.5 ≈ 57.1%, 5 ÷ 17.5 ≈ 28.6% and 2.5 ÷ 17.5 ≈ 14.3%.",
      ],
      result: "Risk parity puts about two thirds in the steady stock, so each holding adds the same 10% of swing. With three stocks, the calmest gets four times the weight of the wildest, because it's a quarter as volatile.",
    },
    reading: [
      { label: "One holding with a very large weight", meaning: "It's much calmer than the others. Check that it isn't just a stock that happened to be quiet for three months." },
      { label: "Weights close to equal", meaning: "The holdings have had similar volatility, so risk parity and equal weights give almost the same portfolio." },
      { label: "Lower volatility than equal weights", meaning: "The usual result: leaning toward calm holdings smooths the ride." },
      { label: "Lower return than equal weights", meaning: "Common when the volatile holdings led the market. Balanced risk is the aim, not the top return." },
    ],
    realWorld: [
      "Bridgewater's All Weather fund, launched in 1996, popularized the idea across asset classes: rather than the classic 60% stocks and 40% bonds, where stocks drive most of the risk, it balances risk between stocks, bonds and commodities, often using borrowing to lift the calmer bond side.",
      "Risk parity funds had a hard year in 2022, when stocks and bonds fell together. Balancing risk only spreads it if the holdings don't all fall at once, which is why correlation matters.",
      "Many equity funds use the simpler inverse-volatility weighting described here, sometimes as part of low-volatility strategies, because it needs only each holding's own volatility, which is far easier to estimate than a full set of correlations.",
    ],
    mistakes: [
      "Thinking equal risk means low risk. A risk parity portfolio of five volatile tech stocks is still very volatile; it just spreads that risk evenly.",
      "Forgetting correlation. The simple inverse-volatility version can still concentrate risk in a group of related holdings.",
      "Trusting three months of volatility too much. A stock that was calm lately can turn volatile, and the weights only catch up at the next reset.",
      "Expecting it to beat the market. It's built to balance risk, and it often trails in strong rallies led by the most volatile stocks.",
    ],
    inMarketLab: [
      {
        label: "Backtest: risk parity",
        href: backtestLink({ kind: "risk-parity", frequency: "monthly" }, ["NVDA", "AAPL", "KO", "JNJ"]),
        text: "Opens a monthly risk parity backtest of NVIDIA, Apple, Coca-Cola and Johnson & Johnson, compared with holding them in equal amounts.",
      },
      { label: "Portfolio Optimise tab", href: "/portfolio", text: "Under Risk analysis, the Optimise tab compares your weights with Least risk, Best Sharpe and Risk parity weightings of the same stocks, and plots each on a chart of risk against return." },
    ],
    related: ["volatility", "rebalancing", "correlation", "diversification"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does risk parity try to make equal?",
        choices: [
          "The money in each holding",
          "Each holding's return",
          "The amount of risk each holding adds",
          "The number of shares of each holding",
        ],
        answer: 2,
        explanation: "It sets weights so each holding contributes about the same risk, which means calmer holdings get more money.",
      },
      {
        kind: "Using it",
        prompt: "Two stocks have volatilities of 20% and 40%. What are their inverse-volatility weights?",
        choices: ["About 67% and 33%", "50% and 50%", "About 33% and 67%", "80% and 20%"],
        answer: 0,
        explanation: "1 ÷ 0.20 = 5 and 1 ÷ 0.40 = 2.5, which add up to 7.5. So 5 ÷ 7.5 ≈ 67% and 2.5 ÷ 7.5 ≈ 33%: the calmer stock gets twice the weight.",
      },
      {
        kind: "Using it",
        prompt: "Why might a simple inverse-volatility portfolio still be dominated by one kind of risk?",
        choices: [
          "Because it puts all the money in one stock",
          "Because it ignores how closely the holdings move together",
          "Because it never rebalances",
          "Because it only works with bonds",
        ],
        answer: 1,
        explanation: "It weights each holding on its own volatility. Several closely related holdings each get a full share, so together they add more than their share of risk.",
      },
      {
        kind: "Real world",
        prompt: "Why was 2022 a hard year for many risk parity funds?",
        choices: [
          "Stocks rose too fast",
          "Volatility was zero",
          "Fees went up",
          "Stocks and bonds fell at the same time",
        ],
        answer: 3,
        explanation: "Risk parity spreads risk between assets in the hope they don't all fall together. In 2022, rising interest rates pushed both stocks and bonds down.",
      },
    ],
  },
};
