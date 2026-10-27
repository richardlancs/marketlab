import type { TermKey } from "../../glossary";
import { backtestLink } from "../links";
import type { Lesson } from "../types";

const MOVING_AVERAGE = { kind: "moving-average", fast: 20, slow: 50 } as const;

export const ORDERS_AND_TRADING_LESSONS: Partial<Record<TermKey, Lesson>> = {
  marketOrder: {
    why: [
      "Every trade starts with an order: an instruction to buy or sell a number of shares. The market order is the plainest one. It says \"do it now, at the going price\", and nothing else. Most first trades people ever make are market orders, and for large, busy stocks they usually work exactly as expected.",
      "Knowing what a market order does and doesn't promise matters because it's the trade-off behind every other order type. A market order guarantees that you trade. It doesn't guarantee the price. A [[limitOrder|limit order]] flips that: it guarantees the price, but not that you trade.",
    ],
    how: {
      paragraphs: [
        "In MarketLab, prices are end-of-day. When you place a market order on a stock page, it fills straight away at the latest daily close. The cash for a buy, or the shares for a sell, must be there at that moment, and only whole shares are traded. The simulated account charges no commission, so the cost is simply shares × price.",
        "Real markets are different in a few ways. Stocks trade all day, and at any moment there are two prices: the bid, the highest price someone will pay, and the ask, the lowest price someone will sell for. A market buy pays the ask and a market sell gets the bid. The gap between them, the spread, is a small cost on every trade. For a big stock it's often a cent or two; for a small, quiet one it can be much wider.",
        "A large market order can also eat through the shares offered at the best price and fill the rest a little higher, which is one form of slippage. And a market order placed while the market is closed waits for the open, where the price can be far from the last close you saw.",
      ],
      formula: {
        expression: "cost of a buy = shares × fill price (+ any commission)",
        reading: "You pay whatever price the order fills at. You choose the number of shares, not the price.",
      },
    },
    example: {
      setup: "You have $2,000 in cash and buy 10 shares with a market order. The latest close is $150.00.",
      steps: [
        "Cost: 10 × $150.00 = $1,500.00.",
        "Cash left: $2,000.00 − $1,500.00 = $500.00.",
        "At a real broker, suppose the bid is $149.98 and the ask $150.02. Your market buy pays the ask: 10 × $150.02 = $1,500.20.",
        "That's $0.20 more than the $1,500.00 you'd get at the midpoint, the hidden cost of the spread. Selling right away at the bid would bring back 10 × $149.98 = $1,499.80.",
      ],
      result: "In MarketLab the order fills at the close you see. At a real broker it fills at the ask (or bid), and a round trip on a liquid stock costs the spread: here $0.40 on a $1,500 position.",
    },
    demo: "orders",
    reading: [
      { label: "A large, busy stock", meaning: "Spreads are tiny and fills are close to the quoted price. A market order is usually fine." },
      { label: "A small or thinly traded stock", meaning: "Spreads can be wide and the price can move as your order fills. A limit order protects you." },
      { label: "Placed when the market is closed", meaning: "At a real broker it fills at the next open, which can be well above or below the last close." },
      { label: "Market buy in MarketLab", meaning: "Fills at once at the latest close, if you have the cash, and shows up in your trade history." },
    ],
    realWorld: [
      "Most US brokers stopped charging commissions on stock trades around 2019, so a market order on a big stock now costs little more than the spread. Many brokers are paid instead by the market makers who fill their customers' orders.",
      "Long-term investors buying a broad [[etf|ETF]] or a large company often use market orders during normal trading hours, because the spread is small and the price they pay matters little over many years.",
      "Traders avoid market orders in the first and last minutes of the day, during big news, and in stocks that trade rarely, because that's when spreads widen and fills can surprise.",
      "Many traders keep a trading journal: why they bought or sold, written down at the time. Read back later, it shows habits that are hard to see trade by trade, such as the [[dispositionEffect|disposition effect]].",
    ],
    mistakes: [
      "Placing a market order overnight or over a weekend and assuming it will fill at Friday's price. If news arrives, the open can be very different.",
      "Using market orders in thinly traded stocks, where the spread alone can cost a percent or more.",
      "Thinking a $0 commission means a trade is free. The spread and slippage are still there; they're just less visible. See [[tradingCosts|trading costs]].",
    ],
    inMarketLab: [
      { label: "Apple's trade card", href: "/stocks/AAPL", text: "Every stock page has a trade card. Choose Market to buy or sell at the latest close straight away. You can also pick a reason and add a short note to each trade, a trading journal you can look back on." },
      { label: "Portfolio", href: "/portfolio", text: "Your filled trades, with the price each one filled at, are listed in your trade history." },
    ],
    related: ["limitOrder", "stopOrder", "tradingCosts", "dispositionEffect"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does a market order guarantee?",
        choices: ["The price you pay", "That you pay no commission", "That it fills at the day's lowest price", "That the order fills, but not the price"],
        answer: 3,
        explanation: "A market order trades at whatever price is available. It's the limit order that guarantees a price, at the risk of not filling.",
      },
      {
        kind: "Using it",
        prompt: "In MarketLab you buy 20 shares with a market order. The latest close is $45.50. What does it cost?",
        choices: ["$910.00", "$45.50", "$900.00", "It depends on tomorrow's close"],
        answer: 0,
        explanation: "A market order fills at once at the latest close: 20 × $45.50 = $910.00, with no commission in the simulated account.",
      },
      {
        kind: "Real world",
        prompt: "A stock's bid is $20.00 and its ask is $20.10. What does a market buy usually pay?",
        choices: ["$20.00", "$20.05", "$20.10", "$19.95"],
        answer: 2,
        explanation: "A market buy takes the lowest price on offer, the ask: $20.10. A market sell would get the bid, $20.00.",
      },
      {
        kind: "Real world",
        prompt: "When is a market order most likely to fill at a surprising price?",
        choices: [
          "Midday, in a large, heavily traded stock",
          "In a thinly traded stock, or when placed overnight before big news",
          "Whenever the commission is $0",
          "Only on days the market rises",
        ],
        answer: 1,
        explanation: "Wide spreads in quiet stocks, and gaps at the open after news, are what make market-order fills differ from the price you saw.",
      },
    ],
  },

  limitOrder: {
    why: [
      "A [[marketOrder|market order]] trades now at whatever the price is. Sometimes you'd rather name your price and wait. A limit order lets you do that: \"buy only at $48 or less\" or \"sell only at $60 or more\". You'll never pay more, or receive less, than your limit.",
      "The cost of that protection is uncertainty. If the price never reaches your limit, nothing happens, and the stock may run away without you. Choosing between a market and a limit order is choosing which risk you'd rather take: a worse price, or no trade at all.",
    ],
    how: {
      paragraphs: [
        "A buy limit waits for the price to fall to your limit or below. A sell limit waits for the price to rise to your limit or above. Either way, the limit is the worst price you'll accept, and the fill can be better.",
        "MarketLab uses daily closes, so it checks open orders once a day, against each close after the one you placed the order at. If a close is at or below a buy limit (or at or above a sell limit), the order fills at that close. Because the fill is the close itself, a buy can fill below your limit when the price drops further than you asked for.",
        "You choose how long the order lasts: until the next close (a day order), or until it fills, you cancel it, or 90 days pass (good till cancelled). Cash and shares are checked when you place the order and again when it fills, but they aren't set aside in between. If you've spent the cash elsewhere by then, the order is cancelled with a note saying why.",
        "Real brokers check limits continuously during the day, against live quotes. A limit order can fill in pieces (a partial fill) if only some shares are offered at your price, and it waits in a queue behind other orders at the same price, so a price that merely touches your limit may not fill it.",
      ],
    },
    example: {
      setup: "A stock closed at $50.00. You place a good-till-cancelled order to buy 20 shares with a limit of $48.00.",
      steps: [
        "Day 1 closes at $49.10. That's above $48.00, so nothing happens and the order stays open.",
        "Day 2 closes at $47.60. That's at or below $48.00, so the order fills at the close, $47.60.",
        "Cost: 20 × $47.60 = $952.00. At exactly your limit it would have been 20 × $48.00 = $960.00.",
        "Compared with buying at the original $50.00 (20 × $50.00 = $1,000.00), you paid $48.00 less.",
      ],
      result: "The order waited for its price and filled $0.40 a share better than the limit. Had the price turned up at $49.10 instead, you'd have missed the trade entirely.",
    },
    demo: "orders",
    reading: [
      { label: "Buy limit below the current price", meaning: "The usual use: waiting for a dip. It fills only if the price falls to your limit." },
      { label: "Sell limit above the current price", meaning: "Taking profit at a target. It fills only if the price climbs to your level." },
      { label: "Buy limit above the current price", meaning: "At a real broker it fills at once at the best available price, but never above your limit: a market order with a ceiling." },
      { label: "The price never reaches the limit", meaning: "Nothing is traded. A day order expires at the next close; a good-till-cancelled one after 90 days in MarketLab." },
    ],
    realWorld: [
      "Many investors use limit orders by default, even for long-term buys, because they rule out a nasty surprise from a wide spread or a fast-moving market.",
      "Limit orders are what create the quotes. The bids and asks you see are mostly other people's resting limit orders, waiting for someone to trade with them.",
      "Brokers usually offer day orders and good-till-cancelled orders, but many cap how long a good-till-cancelled order lasts, often at a few months, much like MarketLab's 90 days.",
    ],
    mistakes: [
      "Setting the limit so far from the price that it never fills, then watching the stock rise without you.",
      "Chasing: raising a buy limit again and again as the price climbs, which ends up as a market order at a worse price.",
      "Forgetting an old good-till-cancelled order. It can fill weeks later, after the reason you placed it has gone.",
      "Assuming the cash is reserved. In MarketLab it's checked at the fill, so spending it first means the order is cancelled.",
    ],
    inMarketLab: [
      { label: "Coca-Cola's trade card", href: "/stocks/KO", text: "Choose Limit on any stock's trade card, set a price and a duration, and the order waits for a close at your price or better. Add a reason and a short note to keep a journal of why you traded." },
      { label: "Portfolio", href: "/portfolio", text: "Open orders are listed with a Cancel button. Filled ones appear as trades in your activity, and ones that ended without filling show whether they expired or were cancelled, and why." },
    ],
    related: ["marketOrder", "stopOrder", "tradingCosts"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is a buy limit order?",
        choices: [
          "An order to buy only at your price or lower",
          "An order to buy once the price rises above a level",
          "An order to buy at the next open, whatever the price",
          "A limit on how many shares you can own",
        ],
        answer: 0,
        explanation: "The limit is the most you'll pay. Buying once the price rises above a level is a buy stop.",
      },
      {
        kind: "Using it",
        prompt: "In MarketLab you place a sell limit at $60 for 10 shares. The next closes are $58.20, then $61.40. What happens?",
        choices: [
          "It fills at $58.20",
          "It fills at $60.00, for $600.00",
          "It fills at $61.40, for $614.00",
          "It expires unfilled",
        ],
        answer: 2,
        explanation: "$58.20 is below the limit, so nothing happens. $61.40 is at or above it, so it fills at that close: 10 × $61.40 = $614.00, better than the limit.",
      },
      {
        kind: "Using it",
        prompt: "You place a buy limit order, then spend most of your cash on another stock. The limit price is reached. In MarketLab, what happens?",
        choices: [
          "The cash was set aside, so it fills anyway",
          "It's cancelled with a note, because the cash is checked at the fill",
          "It buys as many shares as you can afford",
        ],
        answer: 1,
        explanation: "MarketLab checks cash when the order fills, not before. Without enough, the order is cancelled and the reason is shown.",
      },
      {
        kind: "Real world",
        prompt: "Why might a real limit order not fill even though the price touched your limit?",
        choices: [
          "Limit orders only fill at the close",
          "Brokers ignore limits during the day",
          "The spread is always added to the limit",
          "Other orders at the same price were ahead of yours in the queue",
        ],
        answer: 3,
        explanation: "Orders at the same price fill in the order they arrived. A brief touch may be used up by earlier orders before it reaches yours.",
      },
    ],
  },

  stopOrder: {
    why: [
      "A stop order is a trigger. It waits until the price passes a level you choose, then trades. The best-known kind is the stop-loss: \"if this falls to $90, sell\". It's a way to decide in advance, calmly, when you'll get out, instead of deciding in the middle of a fall.",
      "The catch is in the word \"when\". A stop decides when to trade, not at what price. If the price falls straight through your level, for example overnight on bad news, the sale happens at the next price available, which can be well below the stop.",
    ],
    how: {
      paragraphs: [
        "A sell stop sits below the current price and triggers when the price falls to it or lower. A buy stop sits above the current price and triggers when the price rises to it or higher, for people who want to buy only once a rise is under way, or to limit the loss on a short sale.",
        "In MarketLab, stops are checked against each daily close. A sell stop triggers on the first close at or below your level, and fills at that close. If the close is far below the stop, that's the price you get. Like [[limitOrder|limit orders]], a stop lasts until the next close or up to 90 days, and the shares (or cash, for a buy stop) are checked when it fills.",
        "At a real broker, a stop is watched all day. Once the stock trades at or through the stop price, the order becomes a [[marketOrder|market order]] and fills at the next available price. A stop-limit order adds a limit as well, so it never sells below a floor, but then it may not sell at all in a fast fall.",
      ],
    },
    example: {
      setup: "You own 10 shares bought at $100.00 and place a sell stop at $90.00, planning to lose no more than about $100.",
      steps: [
        "A close at $92.00 is above the stop, so nothing happens.",
        "Overnight the company reports bad news, and the next close is $80.00. That's at or below $90.00, so the stop triggers and sells at $80.00.",
        "Proceeds: 10 × $80.00 = $800.00. You paid 10 × $100.00 = $1,000.00, so the loss is $200.00.",
        "Selling exactly at the stop would have lost 10 × ($100.00 − $90.00) = $100.00. The gap cost another $100.00.",
      ],
      result: "The stop did its job of getting you out, but the price fell through it, so the loss was $200.00 rather than the $100.00 planned.",
    },
    demo: "orders",
    reading: [
      { label: "Price drifts down to the stop", meaning: "It sells close to the stop price, roughly as planned." },
      { label: "Price gaps down overnight", meaning: "It sells at the first price after the gap, possibly far below the stop." },
      { label: "Stop set very close to the price", meaning: "Ordinary daily wiggles can trigger it, selling you out of a stock that then recovers." },
      { label: "Buy stop above the price", meaning: "Buys only once the price has risen to the level, often a bit higher than you hoped." },
    ],
    realWorld: [
      "Traders often place stop-losses as soon as they buy, so a single bad trade can't grow into a large loss. Some size their positions so that a stop being hit costs a set share of their account.",
      "Long-term investors use stops less, because a stock that dips sharply may recover, and being sold out and missing the rebound has a cost too. Spreading money across many holdings is another way to limit the damage from one stock. See [[diversification]].",
      "Sharp, sudden market drops have triggered many stops at once, selling shares far below their stop prices before prices bounced back. This is one reason some investors prefer stop-limit orders or no stops at all.",
    ],
    mistakes: [
      "Treating the stop price as a guaranteed sale price. It's a trigger; the fill can be lower.",
      "Setting stops so tight that normal [[volatility]] sets them off. A stock that moves 2% on a typical day will hit a 1% stop quickly.",
      "Moving a stop lower as the price approaches it, which defeats the point of deciding in advance. It's the [[dispositionEffect|disposition effect]] at work: hoping a loser comes back.",
    ],
    inMarketLab: [
      { label: "Tesla's trade card", href: "/stocks/TSLA", text: "Choose Stop on a stock's trade card. A volatile stock like this one shows how far a close can land past a stop. Note your reason and exit plan with the trade, so you can check later that you stuck to it." },
      { label: "Portfolio", href: "/portfolio", text: "A filled stop appears as a trade in your activity, at the close it actually filled at, so you can compare it with the stop you set." },
    ],
    related: ["limitOrder", "marketOrder", "volatility", "maxDrawdown"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does a stop order decide?",
        choices: ["The exact price you'll sell at", "The most you'll pay for a stock", "When to trade, not the price", "How many shares you can hold"],
        answer: 2,
        explanation: "A stop is a trigger. Once the price passes it, the order trades at the next price available, which can differ from the stop.",
      },
      {
        kind: "Using it",
        prompt: "In MarketLab you hold 5 shares with a sell stop at $40. The next close is $36. What do you receive?",
        choices: ["$200.00", "Nothing: it didn't trade at $40", "$190.00", "$180.00"],
        answer: 3,
        explanation: "The close is at or below the stop, so it fills at that close: 5 × $36 = $180.00, not 5 × $40.",
      },
      {
        kind: "Using it",
        prompt: "You want to buy only if a stock, now at $50, rises to $55. Which order fits?",
        choices: ["A buy stop at $55", "A buy limit at $55", "A sell stop at $55", "A market order"],
        answer: 0,
        explanation: "A buy stop triggers once the price rises to the level. A buy limit at $55 would fill right away, since $50 is already below it.",
      },
      {
        kind: "Real world",
        prompt: "What does a stop-limit order add to a plain stop?",
        choices: [
          "It guarantees the sale at the stop price",
          "A lowest acceptable price, at the risk of not selling in a fast fall",
          "It cancels itself if the price gaps",
          "It turns into a dividend if unfilled",
        ],
        answer: 1,
        explanation: "After triggering it becomes a limit order, so it won't sell below the limit. If the price falls straight past, it may not sell at all.",
      },
    ],
  },

  tradingCosts: {
    why: [
      "Every trade loses a little to costs. One trade's costs are small enough to ignore. A strategy that trades every week repeats them dozens of times a year, and they come straight out of the return.",
      "That's why trading costs matter most when testing a strategy. A backtest that ignores them can make a strategy that trades often look better than [[buyAndHold|buying and holding]], when after costs it does worse. Adding even modest costs is one of the quickest honesty checks there is.",
    ],
    how: {
      paragraphs: [
        "There are two main kinds. A commission is a fee the broker charges per trade. Slippage is the gap between the price you expected and the one you got: crossing the spread between bid and ask, the price moving while your order fills, or a large order pushing the price.",
        "MarketLab's backtester lets you set both. The commission is a fixed number of dollars per trade. Slippage is in basis points (bps), hundredths of a percent: 10 bps is 0.1%. A buy fills that much above the day's close, and a sell that much below it.",
        "Costs are paid on every leg. Getting into a position and back out again is two trades, so a round trip pays the commission twice and the slippage twice. What matters is turnover: how much of the portfolio is bought and sold over a year. A strategy that swaps its whole portfolio every month pays about twelve times as much as one that trades once a year.",
        "The simulated trading account doesn't charge costs: trades fill at the close as shown. Real brokers differ, so the backtest is where you see their effect.",
      ],
      formula: {
        expression: "buy price = close × (1 + bps ÷ 10,000); sell price = close × (1 − bps ÷ 10,000); plus the commission on each trade",
        reading: "Slippage makes each fill slightly worse than the close, and every trade also pays the fixed commission.",
      },
    },
    example: {
      setup: "A backtest starts with $10,000, a $1 commission and 5 bps of slippage. One strategy trades its whole account 50 times a year; another buys once and holds.",
      steps: [
        "Slippage on one trade: 5 bps = 0.05%, so 0.05% × $10,000 = $5.00. A buy at a $100.00 close fills at $100.00 × 1.0005 = $100.05.",
        "Cost per trade: $5.00 slippage + $1.00 commission = $6.00.",
        "The active strategy: 50 × $6.00 = $300.00 a year, or 3% of $10,000.",
        "Buy and hold: one trade, $6.00 in total, or 0.06%.",
      ],
      result: "The same small costs take about 3% a year from the active strategy and almost nothing from buy and hold. The active one needs to beat the market by more than 3% a year just to break even with it.",
    },
    demo: "tradingCosts",
    reading: [
      { label: "0 to 5 bps of slippage", meaning: "Close to reality for large, busy stocks traded in modest amounts." },
      { label: "10 to 30 bps", meaning: "A cautious setting: smaller stocks, larger orders, or a test of how robust a strategy is." },
      { label: "A strategy that only wins with zero costs", meaning: "A warning sign: its edge is probably smaller than real-world friction." },
      { label: "Results barely change with costs", meaning: "It trades rarely, so costs aren't what decides whether it works." },
    ],
    realWorld: [
      "Most US brokers dropped commissions on stock trades to $0 around 2019. Spreads and slippage didn't go away, so active traders still pay something on every trade.",
      "Fund managers track costs closely, because over years they compound just like returns do. Index funds keep costs low partly by trading rarely. See [[compounding]].",
      "Taxes are another cost of trading often: in many countries, selling at a gain in a regular account can create a tax bill, while holding defers it. MarketLab doesn't model taxes.",
    ],
    mistakes: [
      "Running backtests with costs set to zero and trusting the result for a strategy that trades often.",
      "Assuming $0 commission means free. The spread is still paid on every round trip.",
      "Forgetting that costs scale with turnover. Ten times the trading means roughly ten times the costs.",
    ],
    inMarketLab: [
      { label: "Crossover, no costs", href: backtestLink(MOVING_AVERAGE, ["AAPL"]), text: "A 20/50-day moving-average crossover on Apple, with no trading costs." },
      {
        label: "Crossover, with costs",
        href: backtestLink(MOVING_AVERAGE, ["AAPL"], { costs: { commission: 1, slippageBps: 10 } }),
        text: "The same backtest with a $1 commission and 10 bps of slippage. Compare the final values and the trade list.",
      },
    ],
    related: ["maCrossover", "buyAndHold", "overfitting"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is slippage?",
        choices: [
          "A fee the broker charges per trade",
          "A tax on short-term gains",
          "The gap between the price you expected and the price you got",
          "A drop in price after a dividend",
        ],
        answer: 2,
        explanation: "Slippage is the worse fill: crossing the spread or the price moving. The per-trade fee is the commission.",
      },
      {
        kind: "Using it",
        prompt: "With 20 bps of slippage, what does a backtest buy fill at when the close is $50.00?",
        choices: ["$50.01", "$51.00", "$50.20", "$50.10"],
        answer: 3,
        explanation: "20 bps is 0.2%: $50.00 × 1.002 = $50.10.",
      },
      {
        kind: "Using it",
        prompt: "A strategy makes 100 trades a year, each costing $4 in commission and slippage, on a $10,000 account. What share of the account do costs take each year?",
        choices: ["4%", "0.4%", "40%"],
        answer: 0,
        explanation: "100 × $4 = $400, and $400 ÷ $10,000 = 4% a year.",
      },
      {
        kind: "Real world",
        prompt: "US brokers now mostly charge $0 commissions on stocks. Are trades free?",
        choices: [
          "Yes, completely",
          "No: you still pay the spread and some slippage",
          "No: commissions were replaced by a fixed monthly fee everywhere",
          "Only on days the market rises",
        ],
        answer: 1,
        explanation: "Buying at the ask and selling at the bid costs the spread on every round trip, commission or not.",
      },
    ],
  },

  dividend: {
    why: [
      "A dividend is part of the profit a company hands back to its owners in cash. Many large, established companies pay one, and over long periods dividends have made up a meaningful part of the stock market's [[totalReturn|total return]].",
      "It's easy to misread, though. On the day a stock stops carrying the dividend, its price usually falls by about the same amount. You haven't gained anything on that day: value moves from the share price into your cash. The dividend is a piece of your return, not a bonus on top of it.",
    ],
    how: {
      paragraphs: [
        "A company announces the amount per share and a few dates. The one that matters most is the ex-dividend date. If you own the shares going into that day, you get the dividend. If you buy on the ex-date or later, the seller gets it instead. On the ex-date the price typically opens lower by about the dividend.",
        "In MarketLab, dividends are paid into your cash on the ex-date, for the shares you held at the previous close. They show up in your portfolio's activity alongside your trades. The mock market's dividends begin on Oct 19, 2026, and come about once a quarter for stocks that pay them.",
        "Real dividends take a little longer. There's also a record date (when the company checks who its shareholders are), which in the US is now usually the same day as the ex-date, and a payment date, often a few weeks later, when the cash actually arrives.",
      ],
      formula: {
        expression: "cash received = shares held × dividend per share",
        reading: "Each share you own going into the ex-date earns the stated amount.",
      },
    },
    example: {
      setup: "You own 40 shares. The stock closes at $60.00, and the next day is the ex-date for a $0.50 dividend.",
      steps: [
        "Before: 40 × $60.00 = $2,400.00 in shares.",
        "Dividend: 40 × $0.50 = $20.00, paid into your cash.",
        "If the price drops by the dividend to $59.50, the shares are worth 40 × $59.50 = $2,380.00.",
        "Shares plus the dividend: $2,380.00 + $20.00 = $2,400.00, the same as before.",
      ],
      result: "You received $20.00 in cash, and your total stayed at $2,400.00. Over a year of four such dividends, that's $2.00 a share, about 3.3% of the $60.00 price: the [[dividendYield|dividend yield]].",
    },
    demo: "dividend",
    reading: [
      { label: "You owned the shares at the close before the ex-date", meaning: "You get the dividend, even if you sell on the ex-date itself." },
      { label: "You bought on the ex-date", meaning: "The seller gets this dividend. You paid a price that no longer includes it." },
      { label: "The price falls about the dividend on the ex-date", meaning: "Normal. It isn't a loss: the value moved into your cash." },
      { label: "A company cuts or stops its dividend", meaning: "Often a sign of business trouble. The price commonly falls on the news." },
    ],
    realWorld: [
      "Many US companies pay quarterly. Some pay monthly, twice a year or once a year, and many fast-growing companies pay nothing, choosing to reinvest their profits or buy back shares.",
      "Many brokers offer to reinvest dividends automatically, buying more shares with each payment. Over decades, reinvested dividends add a lot through [[compounding]].",
      "In a regular taxable account, dividends are usually taxed in the year they're paid, even if you reinvest them. Rules vary by country and account type.",
    ],
    mistakes: [
      "Buying just before the ex-date to \"capture\" the dividend. The price drop on the ex-date usually takes it back, and taxes or trading costs can make it a loss.",
      "Judging a stock only by a high yield. A yield can be high because the price has fallen on bad news, and the dividend may be cut next.",
      "Comparing price returns without dividends. A stock that paid 3% a year looks 3% a year worse on a plain price chart than it really did. See [[adjustedPrice|adjusted price]].",
    ],
    inMarketLab: [
      { label: "Portfolio", href: "/portfolio", text: "Dividends paid on your holdings appear in the trade history and activity, with the shares held and the cash received." },
      { label: "Coca-Cola", href: "/stocks/KO", text: "A long-time dividend payer, and a good stock to hold in the simulator to see quarterly dividends arrive in your cash." },
    ],
    related: ["dividendYield", "totalReturn", "adjustedPrice", "split"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What decides whether you get a dividend?",
        choices: [
          "Owning the shares going into the ex-dividend date",
          "Owning the shares on the payment date",
          "Buying on the ex-dividend date",
          "Holding the stock for at least a year",
        ],
        answer: 0,
        explanation: "You need to own the shares before the ex-date. Buy on the ex-date or later, and the seller gets that dividend.",
      },
      {
        kind: "Using it",
        prompt: "You hold 120 shares and a $0.25 dividend goes ex. How much cash do you receive?",
        choices: ["$25.00", "$12.00", "$30.00", "$300.00"],
        answer: 2,
        explanation: "120 × $0.25 = $30.00, paid in MarketLab on the ex-date into your cash.",
      },
      {
        kind: "Real world",
        prompt: "Why does buying just before the ex-date to collect the dividend rarely work as a trick?",
        choices: [
          "Dividends are only paid to long-term holders",
          "The price usually drops by about the dividend on the ex-date",
          "Brokers keep the first dividend",
        ],
        answer: 1,
        explanation: "The price falls by roughly what you receive, so you gain little or nothing, and costs or taxes can turn it into a loss.",
      },
      {
        kind: "Real world",
        prompt: "A stock's dividend yield has jumped to 12% after its price fell by half. What's the sensible reading?",
        choices: [
          "It's a bargain that's sure to keep paying",
          "A 12% yield is typical for large companies",
          "Yields can't change unless the dividend changes",
          "The market may expect the dividend to be cut; look at why the price fell",
        ],
        answer: 3,
        explanation: "Yield rises when the price falls. A very high yield often reflects doubts about whether the company can keep paying it.",
      },
    ],
  },

  split: {
    why: [
      "When a company's share price climbs very high, it sometimes splits its shares: each old share becomes several new ones at a lower price. Nothing about the company changes. It's like swapping a $20 bill for two $10s.",
      "Splits matter for two practical reasons. First, they change the numbers you see: your share count, your average cost and the price on the screen all change at once. Second, an old price chart can look like it crashed if it isn't adjusted. Knowing a split is coming, or has happened, keeps you from misreading both.",
    ],
    how: {
      paragraphs: [
        "In an N-for-1 split, every share becomes N shares and the price is divided by N. Your holding's value is the same, and so is the company's [[marketCap|market cap]]. Your average cost per share is divided by N too, so your gain or loss doesn't change.",
        "In MarketLab, a split applies on its ex-date to the shares you held at the previous close. Because the simulator keeps whole shares, any fraction of a share is paid out in cash at that day's close, which real brokers call cash in lieu. Open orders on that stock are cancelled, since their prices no longer mean the same thing, and price alerts are rescaled.",
        "A ratio doesn't have to be a whole number. In a 3-for-2 split, every 2 shares become 3. And a reverse split works the other way, combining shares to raise the price, often for companies whose price has fallen very low.",
      ],
      formula: {
        expression: "new shares = old shares × ratio; new price = old price ÷ ratio",
        reading: "More shares at a lower price, with the same total value.",
      },
    },
    example: {
      setup: "You own 10 shares at $600.00, bought at an average cost of $450.00, and the company does a 3-for-1 split.",
      steps: [
        "Before: 10 × $600.00 = $6,000.00.",
        "After: 10 × 3 = 30 shares, at $600.00 ÷ 3 = $200.00 each: 30 × $200.00 = $6,000.00.",
        "Average cost: $450.00 ÷ 3 = $150.00. Your gain is still 30 × ($200.00 − $150.00) = $1,500.00, the same as 10 × ($600.00 − $450.00).",
        "With a fraction: 7 shares in a 3-for-2 split become 7 × 1.5 = 10.5. You keep 10 shares, and if the stock closes at $80.00 that day, the half share is paid as 0.5 × $80.00 = $40.00 in cash.",
      ],
      result: "The split changed the share count, price and average cost, but not the value of the holding or the gain on it.",
    },
    demo: "split",
    reading: [
      { label: "2-for-1, 3-for-1, 10-for-1", meaning: "Forward splits: more, cheaper shares. Common after a long rise in the price." },
      { label: "3-for-2", meaning: "Every 2 shares become 3. Odd holdings leave a fraction, paid in cash." },
      { label: "1-for-10 (reverse split)", meaning: "Every 10 shares become 1 at ten times the price. Often done to stay above an exchange's minimum price." },
      { label: "A sudden drop on an unadjusted chart", meaning: "Check for a split before assuming a crash." },
    ],
    realWorld: [
      "Well-known companies have split after big rises: Apple 4-for-1 in 2020, Tesla 5-for-1 in 2020 and 3-for-1 in 2022, and Nvidia 10-for-1 in 2024, among others.",
      "Companies often say splits make shares easier for individual investors to buy. Since many brokers now sell fractional shares, that matters less than it used to, but splits remain common.",
      "A split doesn't make a stock cheaper in any meaningful sense. Its [[peRatio|P/E ratio]] and market cap are the same the day after. Any price move around a split comes from other news or sentiment, not from the split itself.",
    ],
    mistakes: [
      "Thinking a split makes you richer because you own more shares. The value is the same.",
      "Reading a price chart without split [[adjustedPrice|adjustment]] and seeing a crash that never happened.",
      "Expecting an open order to survive a split. In MarketLab it's cancelled, and at real brokers orders may be adjusted or cancelled depending on the broker.",
    ],
    inMarketLab: [
      { label: "Portfolio", href: "/portfolio", text: "Splits appear in your activity, with your share count before and after and any cash paid for a fraction." },
      { label: "Nvidia", href: "/stocks/NVDA", text: "The stock page's chart uses adjusted prices, so a split doesn't show up as a sudden drop." },
    ],
    related: ["adjustedPrice", "dividend", "marketCap"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What happens to your holding's value in a stock split?",
        choices: ["It doubles", "It stays the same", "It falls by the split ratio", "It depends on the dividend"],
        answer: 1,
        explanation: "You get more shares at a proportionally lower price, so the value is unchanged.",
      },
      {
        kind: "Using it",
        prompt: "You hold 15 shares at $300 with an average cost of $240. After a 5-for-1 split, what do you hold?",
        choices: ["15 shares at $60, cost $48", "75 shares at $300, cost $240", "3 shares at $1,500, cost $1,200", "75 shares at $60, cost $48"],
        answer: 3,
        explanation: "Shares × 5 = 75, price ÷ 5 = $60, and average cost ÷ 5 = $48. Value stays $4,500.",
      },
      {
        kind: "Using it",
        prompt: "In MarketLab you hold 5 shares and a 3-for-2 split happens. The stock closes at $40 that day. What do you end up with?",
        choices: ["7 shares and $20 in cash", "7.5 shares", "8 shares", "5 shares and $100 in cash"],
        answer: 0,
        explanation: "5 × 1.5 = 7.5 shares. MarketLab keeps 7 whole shares and pays the half as 0.5 × $40 = $20.",
      },
      {
        kind: "Real world",
        prompt: "What is a reverse split?",
        choices: [
          "Combining shares into fewer, higher-priced ones",
          "A split that's cancelled before it happens",
          "A split that pays a dividend instead",
        ],
        answer: 0,
        explanation: "In a 1-for-10 reverse split, 10 shares become 1 at ten times the price, often to keep a low price above an exchange's minimum.",
      },
    ],
  },

  adjustedPrice: {
    why: [
      "A stock's price history is broken up by events that aren't gains or losses. A split cuts the price in a day without anyone losing money. A dividend lowers the price by the cash it pays out, which shareholders received. On a chart of prices as they traded, both look like falls.",
      "Adjusted prices fix that. They rescale everything before an event so the whole history compares like for like. Without them, returns over a period that included a split would be nonsense, and returns for a dividend payer would look worse than they really were.",
    ],
    how: {
      paragraphs: [
        "For a split, every price before it is divided by the ratio: before a 4-for-1 split, a $400 close becomes $100. For a dividend, every price before the ex-date is multiplied by a factor of 1 − dividend ÷ the previous close. Prices after the event are left alone, so today's adjusted price is today's real price.",
        "That has a strange-looking consequence: past adjusted prices change every time a new dividend or split happens. A close from five years ago might show $50 today and slightly less after next quarter's dividend. That's expected, and it's how real data providers work too.",
        "MarketLab uses adjusted prices for charts and backtests, so returns include dividends and splits don't look like crashes. Trades, orders and your portfolio's value use prices as they actually traded, because those are what real shares were bought and sold at.",
      ],
      formula: {
        expression: "split: earlier price ÷ ratio; dividend: earlier price × (1 − dividend ÷ previous close)",
        reading: "Each event scales down every price before it, so the history lines up with today's shares.",
      },
    },
    example: {
      setup: "A stock closes at $400.00, does a 4-for-1 split, and closes the next day at $102.00. Separately, a $60.00 stock pays a $0.60 dividend and closes the next day at $59.70.",
      steps: [
        "Split, raw prices: $400.00 to $102.00 looks like a fall of ($102.00 − $400.00) ÷ $400.00 = −74.5%.",
        "Split, adjusted: $400.00 ÷ 4 = $100.00, then $102.00. That's a rise of 2%, which is what holders actually earned.",
        "Dividend, raw: $60.00 to $59.70 is a fall of 0.5%.",
        "Dividend, adjusted: the factor is 1 − $0.60 ÷ $60.00 = 0.99, so the $60.00 close becomes $59.40. From $59.40 to $59.70 is a rise of about 0.51%.",
      ],
      result: "Adjusted prices show a 2% gain instead of a 74.5% crash, and a 0.51% gain instead of a 0.5% loss, close to the 0.5% a holder earned once the $0.60 dividend is counted: ($59.70 + $0.60) ÷ $60.00 = 1.005.",
    },
    demo: "split",
    reading: [
      { label: "Adjusted and raw prices match", meaning: "No dividends or splits since that date, or none at all." },
      { label: "Old adjusted prices far below old raw ones", meaning: "Usually one or more splits since then, and perhaps many years of dividends." },
      { label: "A gentle gap that widens over time", meaning: "Dividends: each one scales earlier prices down a little." },
      { label: "A cliff on a raw chart that vanishes when adjusted", meaning: "A split, not a crash." },
    ],
    realWorld: [
      "Most price-history sites show an adjusted close next to the plain close, and backtesting tools generally use the adjusted one. Some sources adjust only for splits, not dividends, so check which you're looking at.",
      "Index providers publish total-return versions of indices that reinvest dividends, for the same reason: a price-only index understates what holders earned. See [[totalReturn|total return]].",
      "Investors comparing fund or stock performance over years need adjusted figures. Comparing a dividend payer's price-only return with a fund's total return makes the stock look worse than it was.",
    ],
    mistakes: [
      "Saying a stock \"used to trade at $25\" from an adjusted chart, when it really traded at $100 before a 4-for-1 split.",
      "Setting a [[limitOrder|limit order]] from an adjusted price in the past. Orders fill at real, traded prices.",
      "Being surprised that old adjusted prices changed. Each new dividend or split rescales the past.",
    ],
    inMarketLab: [
      { label: "Apple", href: "/stocks/AAPL", text: "The price chart uses adjusted closes, while the price at the top is today's close as traded." },
      { label: "Backtest", href: "/backtest", text: "Backtests run on adjusted prices, so their returns include dividends and aren't broken by splits." },
    ],
    related: ["split", "dividend", "totalReturn"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is an adjusted price?",
        choices: [
          "The price after trading costs",
          "A past price rescaled for later splits and dividends",
          "The price at the open instead of the close",
          "A price forecast for next year",
        ],
        answer: 1,
        explanation: "Adjusting scales earlier prices so a history with splits and dividends compares like for like.",
      },
      {
        kind: "Using it",
        prompt: "A stock closed at $90 before a 3-for-1 split. What is that close on an adjusted chart?",
        choices: ["$270", "$90", "$30", "$45"],
        answer: 2,
        explanation: "Prices before a split are divided by the ratio: $90 ÷ 3 = $30.",
      },
      {
        kind: "Using it",
        prompt: "In MarketLab, which prices do your filled orders use?",
        choices: [
          "Adjusted closes",
          "The average of the two",
          "Closes as they actually traded",
        ],
        answer: 2,
        explanation: "Trades, orders and your portfolio use prices as traded. Charts and backtests use adjusted prices.",
      },
      {
        kind: "Real world",
        prompt: "Why do some data sources' adjusted prices differ from others'?",
        choices: [
          "Some adjust only for splits, others for splits and dividends",
          "Adjusted prices are random",
          "Only one exchange is allowed to publish them",
          "They use different stock tickers",
        ],
        answer: 0,
        explanation: "Split-only adjustment leaves out dividends, so its returns are lower for dividend payers. Check what a source includes.",
      },
    ],
  },
};
