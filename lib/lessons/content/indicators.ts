import type { TermKey } from "../../glossary";
import { RULE_PRESETS } from "../../backtest/rules";
import { backtestLink } from "../links";
import type { Lesson } from "../types";

/** A preset from the rule builder, as a backtest strategy (without its display name). */
const preset = (name: string) => {
  const found = RULE_PRESETS.find((p) => p.name === name);
  if (!found) throw new Error(`No rule preset named ${name}`);
  return { kind: "rules" as const, entry: found.entry, exit: found.exit };
};

export const INDICATORS_LESSONS: Partial<Record<TermKey, Lesson>> = {
  sma: {
    why: [
      "A stock's daily chart is noisy. It can rise three days in a row, drop sharply on a headline, then recover within a week. Looking at single days, it's hard to say whether the price is broadly heading up, down or sideways.",
      "A moving average answers that question by averaging the noise away. It's the simplest and most widely used technical indicator: charting sites draw it by default, financial news quotes the 50-day and 200-day averages of big stocks, and many trading rules are built on it. Knowing exactly what it measures, and what it can't, helps you read all of those.",
    ],
    how: {
      paragraphs: [
        "Pick a number of days, N. Add up the last N closing prices and divide by N. Tomorrow, add the new close, drop the oldest one, and divide again. Because the window slides forward one day at a time, the average \"moves\" with the price. Until a stock has N days of history, there's no average yet.",
        "The length sets the trade-off. A 10-day average follows the price closely and turns quickly. A 200-day average is very smooth and turns slowly, so it's used for the long-term trend. Every close in the window counts equally, which is why it's called simple, as opposed to the [[ema|exponential average]], which weights recent days more.",
        "Because it's built from past prices, a moving average always lags. After a sharp turn, the average keeps heading the old way for a while, because the window still holds many days from before the turn. The longer the average, the longer the lag.",
        "Traders often compare two averages. When a short one, like the 50-day, rises above a long one, like the 200-day, it's called a golden cross; the opposite is a death cross. Trading on those signals is a strategy of its own, covered in the [[maCrossover]] lesson.",
      ],
      formula: {
        expression: "SMA(N) = (sum of the last N closes) ÷ N",
        reading: "The plain average of the last N closing prices, worked out again every day.",
      },
    },
    example: {
      setup: "A stock closed at $100, $102, $101, $104 and $108 over five days. Work out its 5-day simple moving average, then update it after a sixth close of $110.",
      steps: [
        "Add the five closes: 100 + 102 + 101 + 104 + 108 = 515.",
        "Divide by 5: 515 ÷ 5 = $103. That's the 5-day average on day five.",
        "On day six, the window slides: drop the oldest close ($100) and add the new one ($110). The sum becomes 515 − 100 + 110 = 525.",
        "Divide by 5 again: 525 ÷ 5 = $105.",
      ],
      result: "The average rose from $103 to $105 while the price closed at $108 and then $110. It moves the same way as the price, but it trails behind it: that gap is the lag.",
    },
    demo: "movingAverage",
    reading: [
      { label: "Price above a rising average", meaning: "The stock has been in an uptrend over that window. Many investors read a price above its 200-day average as a sign of a long-term uptrend." },
      { label: "Price below a falling average", meaning: "The stock has been in a downtrend. It says nothing certain about tomorrow, only that recent prices have been lower than earlier ones." },
      { label: "Price crossing back and forth over a flat average", meaning: "No clear trend. This is where signals based on the average fail most often, because each cross is soon reversed." },
      { label: "Short average crossing a long one", meaning: "A golden cross (short above long) or a death cross (short below long). Widely watched, but they arrive late, after the move has already started." },
    ],
    realWorld: [
      "The 50-day and 200-day averages are the most widely watched. Market commentators often note when a big stock or an index like the S&P 500 crosses its 200-day average, and some fund managers use it as a simple test of whether the market is in an uptrend.",
      "Some long-term investors use a trend rule, such as holding stocks only while the price is above its 200-day average, mainly to try to sidestep long bear markets. Studies of such rules have found mixed results: they have sometimes cut drawdowns, but they also miss rebounds and trade more, and they often trail plain [[buyAndHold|buy and hold]] after costs.",
      "Some traders treat the averages as support and resistance: places where a falling price might pause. Since so many people watch the same lines, prices sometimes do react there, but often they slice straight through.",
    ],
    mistakes: [
      "Reading the average as a forecast. It's a summary of the past. A price above its average says the recent trend was up, not that it will stay up.",
      "Forgetting the lag. By the time a 200-day average turns down, the price may already have fallen a long way.",
      "Hunting for the perfect length. Try enough lengths on past data and one will look brilliant by luck, which is [[overfitting]]. Round, widely used lengths like 20, 50 and 200 at least weren't picked to fit your data.",
      "Trading every cross in a choppy market. Each false signal costs a little in [[tradingCosts|trading costs]], and they add up.",
    ],
    inMarketLab: [
      { label: "Backtest: price above 200-day average", href: backtestLink(preset("Price above 200-day average"), ["AAPL"]), text: "Test the classic trend rule on Apple: hold it while the price is above its 200-day average, and cash otherwise." },
      { label: "Custom rules", href: "/backtest", text: "Choose Custom rules to build your own conditions, like \"price crosses above 50-day average\", with up to 4 conditions for buying and for selling." },
    ],
    related: ["ema", "maCrossover", "rsi", "overfitting"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does a 50-day simple moving average show?",
        choices: [
          "The highest close of the last 50 days",
          "The price 50 days ago",
          "The average closing price over the last 50 trading days",
          "The forecast price 50 days from now",
        ],
        answer: 2,
        explanation: "It's the plain average of the last 50 closes, recalculated each day as the window slides forward. It describes the past; it doesn't forecast.",
      },
      {
        kind: "Using it",
        prompt: "A stock's last four closes were $20, $22, $21 and $25. What is its 4-day simple moving average?",
        choices: ["$21", "$22", "$23", "$25"],
        answer: 1,
        explanation: "20 + 22 + 21 + 25 = 88, and 88 ÷ 4 = $22.",
      },
      {
        kind: "Using it",
        prompt: "Why does a 200-day average turn later than a 20-day average after a sharp drop?",
        choices: [
          "Its window still holds many days from before the drop, so it takes longer to reflect it",
          "It's calculated only once a month",
          "It uses opening prices instead of closes",
          "It ignores days when the price falls",
        ],
        answer: 0,
        explanation: "Each new close is only 1/200 of a 200-day average, so a drop has to last a long time before the average turns. That delay is the lag.",
      },
      {
        kind: "Real world",
        prompt: "A stock just closed above its 200-day average for the first time in months. What's the most sensible reading?",
        choices: [
          "It's now certain to keep rising",
          "It's a signal to buy with all your savings",
          "Moving averages stop working once many people watch them",
          "Its recent prices are higher than its longer-run average, but signals like this often fail",
        ],
        answer: 3,
        explanation: "The cross summarizes what already happened. Many investors watch it, but the evidence that it predicts returns is mixed, and in choppy markets it often reverses soon after.",
      },
    ],
  },

  ema: {
    why: [
      "A simple moving average treats every day in its window the same. In a 50-day average, yesterday's close counts no more than the close seven weeks ago. That's steady, but slow: when the price turns, the average takes a long time to notice.",
      "The exponential moving average, or EMA, is the most common fix. It gives the newest close the most weight and lets older closes fade away gradually. Many traders prefer it for shorter-term signals, and it's the building block of other popular indicators, such as MACD, which compares a 12-day and a 26-day EMA.",
    ],
    how: {
      paragraphs: [
        "An EMA is updated one day at a time. Each day, it moves part of the way from yesterday's EMA toward today's close. How far it moves is set by the smoothing factor, which for an N-day EMA is 2 ÷ (N + 1). For a 10-day EMA that's 2 ÷ 11, about 0.18, so the EMA closes about 18% of the gap to the new price each day.",
        "Every past close still counts, but its weight shrinks each day, by a factor of 1 − 0.18 = 0.82 for a 10-day EMA. A close from a month ago has almost no influence. That's why it's called exponential: the weights decay like compound interest in reverse.",
        "An EMA needs somewhere to start. MarketLab, like many charting tools, starts it from the simple average of the first N closes, then applies the update from the next day on. Different tools start it in slightly different ways, so the earliest values can differ a little between sites, but the difference fades as time passes.",
        "Because recent closes dominate, an EMA reacts faster than a [[sma|simple average]] of the same length. It turns sooner after a real change in trend, and also sooner after a short blip that quickly reverses.",
      ],
      formula: {
        expression: "EMA today = k × today's close + (1 − k) × EMA yesterday, where k = 2 ÷ (N + 1)",
        reading: "Each day, move a fixed share of the way from yesterday's average toward today's price.",
      },
    },
    example: {
      setup: "A stock closed at $50 for ten days in a row, so its 10-day EMA starts at $50. Then it jumps and closes at $55. Compare the new 10-day EMA with the 10-day simple average.",
      steps: [
        "Smoothing factor for 10 days: k = 2 ÷ (10 + 1) = 2 ÷ 11 ≈ 0.1818.",
        "New EMA: 0.1818 × $55 + 0.8182 × $50 = $10.00 + $40.91 = $50.91.",
        "Simple average: the window drops one $50 close and adds $55, so it's (9 × $50 + $55) ÷ 10 = $505 ÷ 10 = $50.50.",
        "The EMA moved $0.91 toward the new price; the simple average moved $0.50.",
      ],
      result: "After the same jump, the 10-day EMA moved almost twice as far as the 10-day simple average ($50.91 against $50.50). That's the faster reaction, and it would also undo itself faster if the jump reversed.",
    },
    demo: "movingAverage",
    reading: [
      { label: "Price above a rising EMA", meaning: "Recent prices have been trending up. Because the EMA weights recent days, it reflects the latest few weeks more than a simple average would." },
      { label: "Price below a falling EMA", meaning: "Recent prices have been trending down." },
      { label: "Short EMA crossing a long EMA", meaning: "The same idea as a simple-average crossover, but it tends to fire a little earlier, with more false alarms in choppy markets." },
      { label: "EMA and simple average far apart", meaning: "The price has moved a lot recently. The EMA has already moved toward it, while the simple average still holds older prices." },
    ],
    realWorld: [
      "Short-term traders often use EMAs, such as the 9-, 12-, 20- or 26-day, because they respond quickly. Longer-term investors more often quote simple averages like the 200-day, where speed matters less.",
      "[[macd|MACD]], one of the most popular indicators on charting sites, is built entirely from EMAs: the gap between a 12-day and a 26-day EMA, plus a 9-day EMA of that gap. Wilder's smoothing, used in the [[rsi|RSI]], is also a kind of exponential average.",
      "Faster isn't automatically better. A quicker signal catches turns earlier but also reacts to more noise, which means more trades, more costs and more whipsaws. Testing has not shown EMAs to be reliably more profitable than simple averages; which looks better depends on the stock and the period.",
    ],
    mistakes: [
      "Assuming that a faster signal means better returns. It means earlier signals, both right and wrong.",
      "Comparing an EMA from one site with another and expecting an exact match. Different starting methods can make early values differ slightly.",
      "Thinking a 10-day EMA only looks at 10 days. Every past close counts a little; the 10 sets how fast old closes fade.",
      "Switching between EMA and SMA, and between lengths, until a backtest looks great. That's [[overfitting]], and it rarely holds up on new data.",
    ],
    inMarketLab: [
      { label: "Custom rules", href: "/backtest", text: "Choose Custom rules and pick Exponential average in a condition, such as \"price crosses above 20-day EMA\", then compare it with the same rule using a simple average." },
      { label: "Moving average lesson", href: "/learn/moving-average", text: "Read the simple moving average lesson to see the lag that the EMA is designed to shorten." },
    ],
    related: ["sma", "maCrossover", "rsi", "macd"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What makes an exponential moving average different from a simple one of the same length?",
        choices: [
          "It weights recent closes more and lets older ones fade",
          "It only uses the highest prices",
          "It averages over more days",
          "It can't be calculated for individual stocks",
        ],
        answer: 0,
        explanation: "A simple average weights every day in its window equally. An EMA gives the newest close the most weight, so it reacts faster.",
      },
      {
        kind: "Using it",
        prompt: "What is the smoothing factor for a 19-day EMA?",
        choices: ["0.05", "0.10", "0.19", "0.20"],
        answer: 1,
        explanation: "k = 2 ÷ (N + 1) = 2 ÷ 20 = 0.10, so each day the EMA moves 10% of the way toward the new close.",
      },
      {
        kind: "Using it",
        prompt: "A 4-day EMA (k = 0.4) stood at $100 yesterday. Today the stock closed at $110. What's the new EMA?",
        choices: ["$102.50", "$110", "$105", "$104"],
        answer: 3,
        explanation: "0.4 × $110 + 0.6 × $100 = $44 + $60 = $104. It moved 40% of the $10 gap.",
      },
      {
        kind: "Real world",
        prompt: "A trader switches from a 50-day simple average to a 50-day EMA for buy and sell signals. What should they expect?",
        choices: [
          "Exactly the same signals",
          "Fewer trades and no false signals",
          "Signals that tend to come a little earlier, with more false alarms",
          "Guaranteed higher returns",
        ],
        answer: 2,
        explanation: "The EMA turns sooner because it weights recent prices more. That means earlier entries and exits, but also reacting to more short-lived moves.",
      },
    ],
  },

  rsi: {
    why: [
      "Moving averages tell you which way the price has been heading. They don't say how hard it's been pushing. A stock that rose a little on most days and one that rose a lot on every day can both sit above their averages.",
      "The Relative Strength Index measures that push. It compares the size of recent up days with recent down days and turns the result into a score from 0 to 100. It was introduced by J. Welles Wilder in 1978, and it's now one of the most common indicators on charting sites. Traders use it to spot moves that look stretched, though stretched moves can keep stretching.",
    ],
    how: {
      paragraphs: [
        "Start with the daily changes in the close. Split them into gains (up days) and losses (down days, counted as positive numbers). Over the period, usually 14 days, work out the average gain and the average loss. Days with no gain count as zero gain, and the same for losses.",
        "Divide the average gain by the average loss to get the relative strength, RS. Then squash it into a 0–100 score: RSI = 100 − 100 ÷ (1 + RS). If gains and losses are equal, RS is 1 and the RSI is 50. If there were only gains, the RSI is 100; only losses, 0.",
        "After the first value, the averages are updated with Wilder's smoothing rather than recalculated from scratch: the new average gain is (previous average × 13 + today's gain) ÷ 14, and the same for losses. MarketLab does exactly this, starting from the simple averages of the first 14 changes, so it needs 15 closes before the first RSI appears. Some charting sites use simple averages throughout, which gives slightly different numbers.",
      ],
      formula: {
        expression: "RSI = 100 − 100 ÷ (1 + average gain ÷ average loss)",
        reading: "How big recent up days were compared with recent down days, as a score from 0 to 100.",
      },
    },
    example: {
      setup: "Over the last 14 trading days, a stock's up days added $14.00 in total and its down days took away $7.00. Work out the 14-day RSI, then update it after a day when the stock rises $2.00.",
      steps: [
        "Average gain: $14.00 ÷ 14 = $1.00. Average loss: $7.00 ÷ 14 = $0.50.",
        "Relative strength: RS = 1.00 ÷ 0.50 = 2.",
        "RSI = 100 − 100 ÷ (1 + 2) = 100 − 33.3 = 66.7.",
        "Next day, the stock rises $2.00, so the gain is $2.00 and the loss is $0. New average gain: ($1.00 × 13 + $2.00) ÷ 14 = $15.00 ÷ 14 ≈ $1.0714. New average loss: ($0.50 × 13 + $0) ÷ 14 = $6.50 ÷ 14 ≈ $0.4643.",
        "New RS = 1.0714 ÷ 0.4643 ≈ 2.31, so RSI = 100 − 100 ÷ 3.31 ≈ 69.8.",
      ],
      result: "The RSI went from 66.7 to 69.8, just under the 70 line that's often called overbought. One more strong day could push it above, but that alone says nothing about whether the rise will continue.",
    },
    demo: "rsi",
    reading: [
      { label: "Above 70", meaning: "Conventionally called overbought: gains have far outweighed losses lately. In a strong uptrend, the RSI can stay above 70 for weeks." },
      { label: "30 to 70", meaning: "The normal range. Around 50, gains and losses have been roughly balanced." },
      { label: "Below 30", meaning: "Conventionally called oversold: losses have dominated. A falling stock can stay below 30 while it keeps falling." },
      { label: "Price and RSI disagree", meaning: "If the price makes a new high but the RSI makes a lower high, traders call it a divergence: the push behind the rise may be fading. It's a warning sign that often comes to nothing." },
    ],
    realWorld: [
      "The 70 and 30 levels are the conventional ones, from Wilder's original work. Some traders use 80 and 20 to get fewer, more extreme signals, and some use a shorter period, like 2 or 5 days, for very short-term trading.",
      "RSI is mostly used for timing, not for choosing what to own. A trader who already likes a stock might wait for the RSI to dip before buying, or avoid chasing it when the RSI is very high.",
      "Its biggest weakness is strong trends. Buying because the RSI says oversold is buying a stock that's been falling hard, and sometimes it keeps falling for a long time. Selling at 70 can mean selling early in a long rally. Evidence on whether RSI rules beat the market after costs is mixed, and depends heavily on the period tested.",
    ],
    mistakes: [
      "Treating overbought as \"will fall\" and oversold as \"will rise\". They describe recent momentum, not what comes next.",
      "Using RSI rules on their own in a trending market. Many traders pair them with a trend filter, like requiring the price to be above its [[sma|200-day average]] before buying an oversold dip.",
      "Expecting your RSI to match every site exactly. Smoothing methods and starting points differ.",
      "Tuning the period and levels until a backtest looks great. That's [[overfitting]]; check that neighboring settings also work.",
    ],
    inMarketLab: [
      { label: "Backtest: RSI oversold bounce", href: backtestLink(preset("RSI oversold bounce"), ["AAPL"]), text: "Test a classic RSI rule on Apple: buy when RSI(14) is below 30, and sell when it's above 70." },
      { label: "Custom rules", href: "/backtest", text: "Choose Custom rules to combine RSI with a trend filter, like \"RSI(14) is below 30 and price is above 200-day average\", using up to 4 conditions." },
    ],
    related: ["sma", "ema", "macd", "overfitting"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does the RSI measure?",
        choices: [
          "How much a stock moves with the market",
          "The size of recent gains compared with recent losses, as a 0–100 score",
          "The average closing price over 14 days",
          "How many shares were traded",
        ],
        answer: 1,
        explanation: "It compares average gains with average losses over a period, usually 14 days. Moving with the market is beta, and the average price is a moving average.",
      },
      {
        kind: "Using it",
        prompt: "Over 14 days, a stock's average gain was $0.60 and its average loss was $0.20. What is its RSI?",
        choices: ["25", "60", "75", "80"],
        answer: 2,
        explanation: "RS = 0.60 ÷ 0.20 = 3. RSI = 100 − 100 ÷ (1 + 3) = 100 − 25 = 75.",
      },
      {
        kind: "Using it",
        prompt: "If a stock's average gain and average loss over 14 days are exactly equal, what is its RSI?",
        choices: ["50", "0", "100", "70"],
        answer: 0,
        explanation: "RS = 1, so RSI = 100 − 100 ÷ 2 = 50: gains and losses balanced.",
      },
      {
        kind: "Real world",
        prompt: "A stock in a strong uptrend has had an RSI above 70 for three weeks. What's the most sensible reading?",
        choices: [
          "It must fall soon, because it's overbought",
          "The RSI is broken",
          "It's a guaranteed buy signal",
          "Gains have dominated lately; strong trends can stay overbought for a long time",
        ],
        answer: 3,
        explanation: "Overbought only means recent gains have outweighed losses. In strong trends the RSI can stay high for weeks, which is why selling at 70 often means selling early.",
      },
    ],
  },

  macd: {
    why: [
      "Two moving averages of different lengths tell slightly different stories. A short one follows the last few weeks; a long one follows the last few months. When the short one pulls ahead of the long one, recent prices are running faster than the longer trend, and when it falls back, that push is fading.",
      "MACD turns that gap into a single line you can watch. Gerald Appel created it in the late 1970s, and it's now one of the most common indicators on charting sites, often shown in a panel under the price chart. It's popular because it combines trend and momentum in one picture, but it's built entirely from past prices, so it shares their lag.",
    ],
    how: {
      paragraphs: [
        "The MACD line is the 12-day [[ema|exponential average]] of the close minus the 26-day one. When the price has been rising, the faster 12-day average sits above the slower 26-day one and the line is positive. When the price has been falling, it's negative. The further from zero, the stronger the recent move compared with the longer trend.",
        "The signal line is a 9-day exponential average of the MACD line itself: a smoothed, slower copy. The histogram is the gap between the two, MACD minus signal, usually drawn as bars. When the bars grow, the MACD line is pulling away from its signal; when they shrink toward zero, the two are converging, which is where the name comes from.",
        "The most watched event is a crossover. When the MACD line crosses above its signal line, momentum is turning up, and many traders read it as a buy signal; crossing below is the sell signal. Crossing zero means the 12-day average has crossed the 26-day one, a slower trend signal.",
        "MarketLab starts each exponential average from a simple average of its first closes, as many tools do, so the MACD line needs 26 closes and the signal line 34 before they appear. Tools that start their averages differently show slightly different early values.",
      ],
      formula: {
        expression: "MACD = 12-day EMA − 26-day EMA; signal = 9-day EMA of MACD; histogram = MACD − signal",
        reading: "How far the short-term average is ahead of the longer one, compared with its own recent average.",
      },
    },
    example: {
      setup: "Yesterday a stock's MACD line was 1.10 and its signal line 1.20, so the line was below the signal. Today its 12-day EMA is $105.40 and its 26-day EMA is $103.90.",
      steps: [
        "Today's MACD line: $105.40 − $103.90 = 1.50.",
        "The signal line is a 9-day EMA, so its smoothing factor is 2 ÷ (9 + 1) = 0.2. New signal: 0.2 × 1.50 + 0.8 × 1.20 = 0.30 + 0.96 = 1.26.",
        "Histogram: 1.50 − 1.26 = 0.24, a positive bar.",
        "Yesterday the line (1.10) was below its signal (1.20); today it (1.50) is above it (1.26). The MACD line has crossed above its signal line.",
      ],
      result: "Today is a bullish crossover: the 12-day average is $1.50 ahead of the 26-day one and pulling further ahead of its recent pace. That's a description of the last few weeks, not a promise about the next few; in choppy markets crossovers like this are often reversed within days.",
    },
    reading: [
      { label: "MACD above zero and rising", meaning: "The short-term average is above the longer one and the gap is widening: a strengthening uptrend over the last few weeks." },
      { label: "MACD crosses above its signal line", meaning: "The classic buy signal: upward momentum is picking up. MarketLab's stock pages call the state bullish when the histogram is positive." },
      { label: "MACD crosses below its signal line", meaning: "The classic sell signal: momentum is fading or turning down. Shown as bearish." },
      { label: "Price makes a new high but MACD doesn't", meaning: "A divergence: the push behind the rise may be weakening. Often watched, often wrong." },
    ],
    realWorld: [
      "MACD is a default indicator on almost every charting site and trading app, and the 12, 26 and 9 settings are nearly universal. That's partly convention: the lengths were picked decades ago and stuck, not because they're best for every stock.",
      "Traders often use MACD as a filter rather than a trigger, for example buying an [[rsi|RSI]] dip only while MACD is above zero. Combining indicators can cut false signals, but each extra rule also adds a chance of [[overfitting]].",
      "Like any trend tool, it works best in long, steady moves and worst in sideways markets, where the line keeps crossing its signal. Tests of simple MACD crossover rules on stocks have found mixed results, often no better than [[buyAndHold|buy and hold]] after costs.",
    ],
    mistakes: [
      "Comparing MACD values between stocks. The line is in dollars of price gap, so a $500 stock has a far bigger MACD than a $20 one with the same trend.",
      "Trading every crossover in a choppy market. Each false signal costs a little in [[tradingCosts|trading costs]].",
      "Forgetting it's built from moving averages. It lags, so crossovers arrive after the turn has started.",
      "Tuning the 12, 26 and 9 until a backtest looks great. Different settings will win on different stretches of history.",
    ],
    inMarketLab: [
      { label: "Stock pages", href: "/stocks/AAPL", text: "The Technicals card shows the MACD line, its signal line and whether the state is bullish or bearish." },
      {
        label: "Backtest: MACD crossover",
        href: backtestLink(
          {
            kind: "rules",
            entry: { combine: "all", conditions: [{ left: { kind: "macd" }, op: "crosses-above", right: { kind: "macd-signal" } }] },
            exit: { combine: "all", conditions: [{ left: { kind: "macd" }, op: "crosses-below", right: { kind: "macd-signal" } }] },
          },
          ["AAPL"],
        ),
        text: "Test the classic rule on Apple: buy when MACD crosses above MACD signal line, and sell when it crosses below. Build your own with Custom rules.",
      },
    ],
    related: ["ema", "rsi", "maCrossover", "bollingerBands"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is the MACD line?",
        choices: [
          "The 12-day EMA minus the 26-day EMA",
          "The 9-day average of the price",
          "The highest close of the last 26 days",
          "The RSI over 12 days",
        ],
        answer: 0,
        explanation: "It's the gap between a fast and a slow exponential average. The 9-day EMA of that gap is the signal line.",
      },
      {
        kind: "Using it",
        prompt: "A stock's 12-day EMA is $48.00 and its 26-day EMA is $50.00. What is its MACD, and what does the sign tell you?",
        choices: [
          "+2.00: an uptrend",
          "0: no trend",
          "−2.00: the short-term average is below the longer one",
          "−2.00: the stock will fall tomorrow",
        ],
        answer: 2,
        explanation: "$48.00 − $50.00 = −2.00. A negative MACD means recent prices have been weaker than the longer trend. It describes the past, not tomorrow.",
      },
      {
        kind: "Using it",
        prompt: "The MACD line is 0.80 and the signal line is 1.00. What is the histogram?",
        choices: ["1.80", "0.20", "0.80", "−0.20"],
        answer: 3,
        explanation: "Histogram = MACD − signal = 0.80 − 1.00 = −0.20. A negative bar means the line is below its signal.",
      },
      {
        kind: "Real world",
        prompt: "Where do simple MACD crossover rules tend to struggle most?",
        choices: [
          "In long, steady uptrends",
          "In sideways, choppy markets",
          "On large companies",
          "When the stock pays a dividend",
        ],
        answer: 1,
        explanation: "In a sideways market the MACD line keeps crossing its signal, so the rule buys and sells repeatedly on moves that soon reverse.",
      },
    ],
  },

  bollingerBands: {
    why: [
      "Is a $5 move big? For a calm stock it might be the biggest move in months; for a volatile one it's an ordinary Tuesday. Fixed rules like \"sell after a 5% rise\" ignore that. Bollinger Bands measure moves against the stock's own recent swings, so the same rule adjusts to each stock and each period.",
      "John Bollinger introduced them in the 1980s, and they're now standard on charting sites. They're used in two opposite ways: some traders buy when the price touches the lower band, expecting a bounce, and others buy when it breaks above the upper band, expecting a trend. Knowing what the bands measure helps you see why both can fail.",
    ],
    how: {
      paragraphs: [
        "Start with the 20-day [[sma|simple moving average]] of the close: that's the middle band. Then work out the standard deviation of the same 20 closes, a measure of how far they spread around the average. The upper band is the average plus 2 standard deviations; the lower band is the average minus 2.",
        "When prices swing a lot, the standard deviation grows and the bands widen. In a calm stretch they squeeze together. A narrow squeeze is often watched as a sign that a bigger move is coming, though it doesn't say which way.",
        "%B says where the latest close sits between the bands: 0 is on the lower band, 1 on the upper band and 0.5 at the middle. It can go below 0 or above 1 when the price closes outside the bands. MarketLab uses the population standard deviation of the 20-day window, dividing by 20 rather than 19, as John Bollinger does. Some tools divide by 19, which makes the bands slightly wider.",
        "If prices followed a bell curve, about 95% of closes would land inside 2 standard deviations. Real prices trend and have fat tails, so closes outside the bands are more common than that, and a close outside them isn't rare or automatically extreme.",
      ],
      formula: {
        expression: "Bands = 20-day average ± 2 × standard deviation of the 20 closes; %B = (close − lower) ÷ (upper − lower)",
        reading: "A channel around the recent average, as wide as the recent swings, and where today's close sits in it.",
      },
    },
    example: {
      setup: "To keep the arithmetic short, use a 5-day window instead of 20. A stock closed at $97, $101, $99, $100 and $103. Work out the bands and %B.",
      steps: [
        "Middle band: (97 + 101 + 99 + 100 + 103) ÷ 5 = 500 ÷ 5 = $100.",
        "Distances from the average: −3, +1, −1, 0 and +3. Their squares: 9, 1, 1, 0 and 9, which add up to 20.",
        "Population standard deviation: √(20 ÷ 5) = √4 = $2.",
        "Upper band: $100 + 2 × $2 = $104. Lower band: $100 − 2 × $2 = $96.",
        "%B for the last close: ($103 − $96) ÷ ($104 − $96) = 7 ÷ 8 = 0.875.",
      ],
      result: "The bands run from $96 to $104, and the last close of $103 sits at a %B of 0.875, near the top of the recent range. That says the price is high compared with the last few days' swings, not that it's about to fall.",
    },
    reading: [
      { label: "%B above 1", meaning: "The close is above the upper band: unusually high compared with the last 20 days. In a strong uptrend, the price can ride the upper band for weeks." },
      { label: "%B around 0.5", meaning: "The close is near the 20-day average, in the middle of its recent range." },
      { label: "%B below 0", meaning: "The close is below the lower band. Some read it as oversold, but in a sharp fall the price can keep hugging the lower band." },
      { label: "Bands squeezing together", meaning: "Swings have been small lately. Calm stretches often end with a bigger move, in either direction." },
    ],
    realWorld: [
      "Mean-reversion traders buy near the lower band and sell near the middle or upper band, betting that stretched prices snap back. It tends to work in sideways markets and fail badly in strong downtrends, where \"cheap\" keeps getting cheaper.",
      "Breakout traders do the opposite: a close above the upper band after a squeeze is read as the start of a trend. John Bollinger himself advised combining the bands with other indicators, such as [[rsi|RSI]] or volume, rather than trading touches alone.",
      "Options traders watch the width of the bands as a rough view of recent [[volatility]], since a wider channel means bigger recent swings.",
    ],
    mistakes: [
      "Treating a touch of the upper band as a sell signal by itself. In strong trends, prices often stay near or above the upper band for a long time.",
      "Assuming 95% of closes stay inside the bands. That would only hold for a bell curve; real prices break out more often.",
      "Forgetting the bands lag. They're built from the last 20 closes, so after a sudden jump they take days to catch up.",
      "Mixing up the standard deviations. Bands built with the sample version (dividing by 19) come out slightly wider than with the population version (dividing by 20).",
    ],
    inMarketLab: [
      { label: "Stock pages", href: "/stocks/TSLA", text: "The Technicals card shows the lower and upper Bollinger Bands for the last 20 days and the latest %B." },
      {
        label: "Backtest: buy below the lower band",
        href: backtestLink(
          {
            kind: "rules",
            entry: { combine: "all", conditions: [{ left: { kind: "price" }, op: "below", right: { kind: "bollinger-lower", days: 20 } }] },
            exit: { combine: "all", conditions: [{ left: { kind: "price" }, op: "above", right: { kind: "sma", days: 20 } }] },
          },
          ["KO"],
        ),
        text: "Test a mean-reversion rule on Coca-Cola: buy when the price is below the lower Bollinger band, and sell once it's back above the 20-day average. Change the rules under Custom rules.",
      },
    ],
    related: ["sma", "volatility", "rsi", "macd"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What sets the width of Bollinger Bands?",
        choices: [
          "A fixed 5% above and below the price",
          "The standard deviation of recent closes",
          "The company's earnings",
          "The number of shares traded",
        ],
        answer: 1,
        explanation: "The bands sit 2 standard deviations either side of the 20-day average, so they widen when recent closes are spread out and narrow when they're bunched together.",
      },
      {
        kind: "Using it",
        prompt: "The lower band is $90, the upper band $110, and the stock closed at $95. What is %B?",
        choices: ["0.95", "0.5", "0.25", "−0.25"],
        answer: 2,
        explanation: "($95 − $90) ÷ ($110 − $90) = 5 ÷ 20 = 0.25: a quarter of the way up from the lower band.",
      },
      {
        kind: "Using it",
        prompt: "A stock's 20-day average is $50 and the standard deviation of those 20 closes is $1.50. Where are the bands?",
        choices: ["$47 and $53", "$48.50 and $51.50", "$45 and $55", "$49 and $51"],
        answer: 0,
        explanation: "2 × $1.50 = $3, so the bands are $50 − $3 = $47 and $50 + $3 = $53.",
      },
      {
        kind: "Real world",
        prompt: "When does buying every touch of the lower band tend to go worst?",
        choices: [
          "In a calm, sideways market",
          "When the bands are wide",
          "In a strong, lasting downtrend",
          "On stocks that pay dividends",
        ],
        answer: 2,
        explanation: "In a strong downtrend the price can hug the lower band for weeks, so each \"cheap\" buy is followed by further falls.",
      },
    ],
  },
};
