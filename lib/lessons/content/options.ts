import type { TermKey } from "../../glossary";
import type { Lesson } from "../types";

export const OPTIONS_LESSONS: Partial<Record<TermKey, Lesson>> = {
  callsAndPuts: {
    why: [
      "Options are among the most traded financial products in the world. Tens of millions of contracts change hands on US exchanges every day, companies pay employees in stock options, and the price of options sets a widely watched gauge of fear in the market. Even if you never trade one, they shape the market you invest in.",
      "They are also the easiest way to lose money quickly. A small premium controls a lot of stock, so gains and losses are magnified many times over. Understanding exactly what an option pays, and when it pays nothing, is the first defense.",
    ],
    how: {
      paragraphs: [
        "A call gives its buyer the right to buy a stock at a fixed price, the strike, until a fixed date, the expiry. A put gives the right to sell at the strike. The buyer, said to be long, pays the seller, who is short or the writer, a price called the premium. The buyer can choose whether to use the right; the seller must follow through if asked.",
        "At expiry, the sums are simple. A call is worth the stock price minus the strike, if that's positive, and nothing otherwise: nobody uses a right to buy at $105 when the stock costs $100. A put is worth the strike minus the stock price, if positive. An option that would pay something now is in the money; one at the stock's price is at the money; one that would pay nothing is out of the money.",
        "The buyer's profit is that payoff minus the premium paid, and the seller's profit is exactly the opposite. So a call buyer breaks even when the stock ends at the strike plus the premium, and a put buyer when it ends at the strike minus the premium.",
        "A US stock option contract covers 100 shares, so prices quoted per share are multiplied by 100. Most expire monthly, on the third Friday. US stock options can be exercised early, but before expiry it is usually better to sell the option, since it's still worth something for the time left.",
      ],
      formula: {
        expression: "Call payoff = max(stock − strike, 0); put payoff = max(strike − stock, 0); buyer's profit = payoff − premium",
        reading: "At expiry, an option pays how far the stock finished past the strike, in the option's direction, or nothing.",
      },
    },
    example: {
      setup: "A stock trades at $100. You buy one 3-month call with a $105 strike for a premium of $3 a share, or $300 for the contract of 100 shares. For comparison, 100 shares would cost $10,000.",
      steps: [
        "The stock ends at $115. The call pays $115 − $105 = $10 a share. Profit: $10 − $3 = $7 a share, or $700, a return of +233% on $300. The shares would have made $1,500, or +15%.",
        "The stock ends at $106. The call pays $1 a share, so you lose $3 − $1 = $2 a share, or $200, even though the stock rose 6%.",
        "The stock ends at $100 or below. The call expires worthless and you lose the whole $300, or −100%. The shares would have lost nothing at $100.",
        "Breakeven: $105 + $3 = $108. The stock must rise 8% before the call makes any money.",
        "The seller's results are the mirror image: they keep the $300 if the stock ends at $105 or below, and lose $700 if it ends at $115.",
      ],
      result: "The option turned a 15% rise into a 233% gain, but it also turned a flat stock into a total loss. Leverage works in both directions, and the buyer needs a big enough move, soon enough.",
    },
    demo: "optionPayoff",
    reading: [
      { label: "In the money", meaning: "It would pay something if it expired now: a call with the stock above the strike, or a put with it below. It costs more, and behaves more like the stock." },
      { label: "At the money", meaning: "The strike is near the stock price. It's worth only its time value, which is where most of the uncertainty lives." },
      { label: "Out of the money", meaning: "Cheap, because it would pay nothing now. Most of these expire worthless; the cheapness is the price of a long shot." },
      { label: "Lots of time left", meaning: "More expensive, because the stock has longer to move. That extra value shrinks every day, faster near expiry." },
    ],
    realWorld: [
      "Options that expire the same day now make up a large share of trading in S&P 500 index options. They are cheap, fast and especially risky.",
      "Studies of individual investors' option trading have found that, as a group, they lose money: they tend to buy short-dated, out-of-the-money calls on popular stocks, and pay wide trading costs on top.",
      "Companies grant employees options to buy their shares at today's price. They pay off only if the share price rises, which is the point: they tie pay to the company's success.",
      "Investors buy puts as insurance on stocks they own, and some sell calls on their shares for extra income. Both are covered in [[optionStrategies|option strategies]], and selling options in [[writingOptions|writing options]].",
    ],
    mistakes: [
      "Thinking cheap options are bargains. An out-of-the-money option is cheap because it usually expires worthless.",
      "Being right about the direction but wrong about the timing or size. A call can lose money while the stock rises, if it doesn't rise enough before expiry.",
      "Forgetting the 100-share multiplier. A premium of $3 costs $300 a contract.",
      "Selling options for the premium without counting the risk. Someone who sells a call without owning the shares has no limit on how much they can lose.",
    ],
    inMarketLab: [
      { label: "Options lab", href: "/options", text: "Pick a stock to see a simulated chain of calls and puts around its price, priced from its own volatility, and draw the payoff of any single option at expiry. You can also paper-trade single contracts from the chain, and they show in your portfolio." },
      { label: "Your options", href: "/portfolio#holdings", text: "Options you hold, or have written, are listed with your holdings at their latest price. At expiry each is settled in cash at what it pays." },
    ],
    related: ["optionStrategies", "optionGreeks", "impliedVolatility", "stopOrder"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does a put option give its buyer?",
        choices: [
          "The obligation to buy shares at the strike",
          "The right to sell shares at the strike until expiry",
          "A share of the company's dividends",
          "The right to buy shares at the strike until expiry",
        ],
        answer: 1,
        explanation: "A put is the right, not the obligation, to sell at the strike. The right to buy is a call.",
      },
      {
        kind: "Using it",
        prompt: "You buy a put with a $50 strike for $2. At expiry the stock is at $44. What is your profit per share?",
        choices: ["$2", "$4", "$6", "−$2"],
        answer: 1,
        explanation: "The put pays $50 − $44 = $6, minus the $2 premium: a profit of $4 a share, or $400 a contract.",
      },
      {
        kind: "Using it",
        prompt: "A call has a strike of $80 and costs $5. Where does the buyer break even at expiry?",
        choices: ["$75", "$80", "$85", "$90"],
        answer: 2,
        explanation: "The call must pay back its premium: $80 + $5 = $85.",
      },
      {
        kind: "Real world",
        prompt: "What have studies found about individual investors' option trading as a group?",
        choices: [
          "They earn more than professionals",
          "They lose money on average, partly through short-dated long shots and trading costs",
          "They break even exactly",
        ],
        answer: 1,
        explanation: "As a group, individuals have lost money on options, often buying cheap, short-dated calls that expire worthless.",
      },
    ],
  },

  optionGreeks: {
    why: [
      "An option's price depends on several things at once: the stock price, the time left, how much the stock swings and interest rates. When one of them changes, the price changes, sometimes far more than people expect. A trader who only watches the stock is flying half blind.",
      "The Greeks put a number on each of those sensitivities. They tell you how much an option should gain if the stock rises a dollar, how much it loses each day you wait, and how much a jump in volatility is worth. Professionals manage their option risk almost entirely through them.",
    ],
    how: {
      paragraphs: [
        "They come from a pricing model, most often Black-Scholes, published by Fischer Black and Myron Scholes in 1973. It prices an option from the stock price, the strike, the time to expiry, the stock's [[volatility]] and the interest rate, assuming the stock's swings are random, smooth and steady. Each Greek is how much the model's price changes when one input changes.",
        "Delta is the change in the option's price for a $1 move in the stock. Calls run from 0 to 1 and puts from 0 to −1; an at-the-money option is near ±0.5. A delta of 0.56 means the option moves like 56 shares per contract of 100. Gamma is how fast delta itself changes per $1 move. It's largest for at-the-money options close to expiry, where delta can swing from near 0 to near 1 quickly.",
        "Theta is the value lost per day that passes, everything else equal. It's usually negative for buyers, who pay for time, and positive for sellers, who collect it, and it speeds up as expiry nears. Vega is the change for one percentage point more volatility: options get more valuable when the stock is expected to swing more. Rho is the change for one point more interest rate. It is small for short-dated options.",
        "The Greeks are a snapshot. They change whenever the inputs change, and they're only as good as the model behind them.",
      ],
      formula: {
        expression: "Price change ≈ delta × move + ½ × gamma × move² + theta × days + vega × volatility change",
        reading: "Add up the effect of the stock's move, its curve, time passing and a change in volatility.",
      },
    },
    example: {
      setup: "A stock is at $100. A call with a $100 strike and 3 months (0.25 years) to expiry, with 20% volatility and a 4% interest rate, is worth $4.49 under Black-Scholes. Its Greeks: delta 0.56, gamma 0.039, theta −$0.027 a day, vega $0.20 and rho $0.13.",
      steps: [
        "The stock jumps $2 to $102. Delta's part: 0.56 × $2 = $1.12. Gamma's part: ½ × 0.039 × 2² = $0.08. Estimate: $4.49 + $1.20 = $5.69. The full model gives $5.68.",
        "A day passes with nothing else changing: about −$0.027, or $2.70 a contract.",
        "Volatility rises from 20% to 25%: 5 × $0.20 = +$1.00, to about $5.49. The full model gives $5.47.",
        "The matching put is worth $3.49, with a delta of 0.56 − 1 = −0.44: it gains about 44 cents when the stock falls $1.",
      ],
      result: "The Greeks predicted each change within a cent or two. A $2 rise in a $100 stock (+2%) lifted the call by about 27%, and a jump in volatility alone was worth nearly as much as that rise.",
    },
    demo: "optionGreeks",
    reading: [
      { label: "Delta near 1 (or −1)", meaning: "Deep in the money: the option moves almost dollar for dollar with the stock." },
      { label: "Delta near 0.5", meaning: "At the money. Often loosely read as about even odds of ending in the money, though it isn't exactly a probability." },
      { label: "Delta near 0", meaning: "Far out of the money: the stock barely moves it, until a big move suddenly does." },
      { label: "Big theta", meaning: "Short-dated and near the money. Time decay is eating a large share of the price each day." },
      { label: "Big vega", meaning: "Long-dated and near the money. A change in expected volatility matters a lot." },
    ],
    realWorld: [
      "Market makers who sell options usually delta-hedge: they buy or sell shares to cancel their delta, then adjust as it moves. That's what lets them profit from the gap between buying and selling prices rather than from betting on direction.",
      "When many investors buy calls, the dealers who sold them buy shares to hedge, and buy more as the price rises and delta grows. This feedback, sometimes called a gamma squeeze, helped drive some of the wild moves in GameStop in early 2021.",
      "Every broker's option chain shows the Greeks next to the prices. They're estimates from a model, and different brokers can show slightly different numbers.",
    ],
    mistakes: [
      "Treating delta as fixed. Gamma means delta changes as the stock moves, so a large move does more than delta alone predicts.",
      "Ignoring theta when buying short-dated options. Time decay can quietly take the premium even if the stock goes your way, slowly.",
      "Forgetting the Greeks are per share. Multiply by 100 for one contract.",
      "Trusting the model in a crash. Black-Scholes assumes smooth moves; real prices jump, and the Greeks can be badly wrong when they do.",
    ],
    inMarketLab: [
      { label: "Options lab", href: "/options", text: "The simulated option chain shows delta, gamma, theta, vega and rho for every strike and expiry, so you can watch how they change with the strike and the time left." },
    ],
    related: ["callsAndPuts", "impliedVolatility", "volatility", "optionStrategies"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "Which Greek measures how much an option loses as a day passes?",
        choices: ["Delta", "Gamma", "Theta", "Vega"],
        answer: 2,
        explanation: "Theta is time decay: the change in price per day, all else equal.",
      },
      {
        kind: "Using it",
        prompt: "A call has a delta of 0.4. The stock rises $3. Roughly how much does the call gain per share?",
        choices: ["$0.40", "$1.20", "$3.00", "$7.50"],
        answer: 1,
        explanation: "0.4 × $3 = $1.20, before the small extra from gamma.",
      },
      {
        kind: "Using it",
        prompt: "An option has a vega of $0.15. Volatility falls from 40% to 30% after earnings. Roughly what happens to its price?",
        choices: ["It rises $1.50", "It falls $0.15", "It falls $1.50", "Nothing"],
        answer: 2,
        explanation: "10 points × $0.15 = $1.50 lost, even if the stock doesn't move.",
      },
      {
        kind: "Real world",
        prompt: "Why do market makers delta-hedge the options they sell?",
        choices: [
          "To cancel their exposure to the stock's direction",
          "To raise the option's price",
          "Because exchanges forbid holding options",
        ],
        answer: 0,
        explanation: "By holding shares that offset the option's delta, they aim to earn the trading spread rather than bet on the stock.",
      },
    ],
  },

  impliedVolatility: {
    why: [
      "Every input to an option pricing model can be looked up, except one: how much the stock will swing between now and expiry. Nobody knows that. But the market sets a price for the option anyway, and that price reveals what traders, on balance, expect.",
      "Implied volatility is that expectation turned into a number. It's how professionals compare option prices, how they judge whether options are cheap or expensive, and it's the idea behind the VIX, the market's best-known measure of fear.",
    ],
    how: {
      paragraphs: [
        "Take a model like Black-Scholes (see [[optionGreeks|the Greeks]]). The stock price, strike, time and interest rate are known. A higher volatility always gives a higher option price, so exactly one volatility makes the model's price match the market's. There's no formula to work backward directly, so it's found by trial: guess, compare, adjust, repeat.",
        "Historical volatility looks back: the actual swings of the stock's daily returns over, say, the past year. Implied volatility looks forward: what the option price says about the swings to come. Over long periods, implied volatility has tended to sit a little above the volatility that followed. Option sellers are paid a premium for providing insurance, like an insurer charging more than the average claim.",
        "If Black-Scholes were exactly right, every strike on the same stock and expiry would have the same implied volatility. In real markets they don't. Plot implied volatility against strike and you get a curve: a volatility smile, or, for stock indexes, a skew where low-strike puts have much higher implied volatility. It appeared after the 1987 crash, as investors began paying extra for protection against sudden falls.",
        "Implied volatility rises before known events like earnings and usually collapses right after, once the news is out. This drop is called volatility crush.",
      ],
    },
    example: {
      setup: "A $100 stock has a 3-month call with a $100 strike, and the interest rate is 4%. The call trades at $5.50. The stock's historical volatility is 20%.",
      steps: [
        "Try 20%: Black-Scholes gives $4.49. Too low, so the market expects more than 20%.",
        "Try 30%: the model gives $6.46. Too high.",
        "Try 25%: the model gives $5.47, about $0.028 short.",
        "Its vega is about $0.197 per point, so add $0.028 ÷ $0.197 ≈ 0.14 points: about 25.1%. Checking confirms it.",
        "The implied volatility of 25.1% is 5.1 points above the historical 20%, so the option is priced for bigger swings than the stock has had.",
      ],
      result: "The $5.50 price implies volatility of about 25.1%. Either traders expect a bumpier stretch, perhaps an earnings report, or the option is expensive compared with the stock's past swings.",
    },
    demo: "impliedVolatility",
    reading: [
      { label: "Implied above historical", meaning: "Options are priced for bigger swings than the stock has had. Common before earnings or during market stress." },
      { label: "Implied below historical", meaning: "Options look cheap compared with past swings, often after a calm stretch. Calm can end suddenly." },
      { label: "VIX below about 15", meaning: "Traders expect a calm month for the S&P 500." },
      { label: "VIX above about 30", meaning: "Fear: traders are paying up for protection. It closed above 80 in late 2008 and in March 2020." },
    ],
    realWorld: [
      "The VIX is calculated from the prices of S&P 500 index options, and measures the volatility they imply over the next 30 days. Its long-run average is around 19 or 20.",
      "Traders who buy options before earnings can be right about the direction and still lose money: if the move is smaller than the implied volatility priced in, volatility crush shrinks the option's value.",
      "Products that bet on volatility staying low can fail spectacularly. In February 2018 a popular fund betting against the VIX lost over 90% of its value in a day when volatility spiked.",
    ],
    mistakes: [
      "Reading high implied volatility as a sign the stock will rise. It measures expected size of moves, not their direction.",
      "Buying options right before earnings without checking how much movement is already priced in.",
      "Treating implied volatility as a forecast that must come true. It's a price, and it includes a premium for insurance.",
      "Assuming one volatility fits every strike. Real chains have a smile or skew.",
    ],
    inMarketLab: [
      { label: "Options lab", href: "/options", text: "Type in any option price and the implied-volatility solver finds the volatility that matches it. MarketLab's simulated chain uses one volatility, the stock's own historical one, so it has no smile, unlike real option chains." },
      { label: "A stock's volatility", href: "/stocks/AAPL#analysis", text: "A stock's Risk & technicals tab shows its historical volatility over one and three years, for comparing with what option prices imply." },
    ],
    related: ["volatility", "optionGreeks", "callsAndPuts", "valueAtRisk"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is implied volatility?",
        choices: [
          "The stock's actual past swings",
          "The volatility that makes a pricing model match an option's market price",
          "The option's delta",
          "The interest rate used in Black-Scholes",
        ],
        answer: 1,
        explanation: "It's worked backward from the price. Past swings are historical volatility.",
      },
      {
        kind: "Using it",
        prompt: "At 30% volatility a model prices an option at $4.00, and at 35% at $4.60. The market price is $4.30. Roughly what's the implied volatility?",
        choices: ["25%", "30%", "32.5%", "40%"],
        answer: 2,
        explanation: "$4.30 is halfway between $4.00 and $4.60, so the volatility is about halfway between 30% and 35%.",
      },
      {
        kind: "Using it",
        prompt: "A stock's implied volatility is 45% and its historical volatility 25%. What does that suggest?",
        choices: [
          "The stock will rise",
          "Options are priced for much bigger swings than the stock has had",
          "Options are cheap",
        ],
        answer: 1,
        explanation: "Implied volatility well above historical means options are expensive by past standards, often before an event.",
      },
      {
        kind: "Real world",
        prompt: "Why do options on stock indexes usually show higher implied volatility for low strikes?",
        choices: [
          "Low strikes are easier to trade",
          "Investors pay extra for protection against crashes, a pattern since 1987",
          "Black-Scholes requires it",
        ],
        answer: 1,
        explanation: "Demand for crash protection lifts the price of low-strike puts, creating the skew.",
      },
    ],
  },

  optionStrategies: {
    why: [
      "A single option is a blunt bet: a call on a rise, a put on a fall. Combining options with each other or with shares lets investors shape the payoff much more precisely: give up some upside for income, pay a little to cap a loss, or bet on a big move without picking a direction.",
      "Every one of these shapes is a trade-off, never a free lunch. Learning to read a payoff diagram is how you see exactly what you give up for what you get.",
    ],
    how: {
      paragraphs: [
        "A payoff diagram plots profit at expiry against the stock price. A position's line is just the sum of its parts: each option's payoff minus its premium, plus or minus the shares. Four classic shapes cover most of what people do.",
        "A covered call: own 100 shares and sell a call above today's price. You keep the premium, which cushions a fall slightly, but if the stock rises past the strike your shares are called away, so the gain is capped. A protective put: own the shares and buy a put below today's price. The put sets a floor on the loss, like insurance, and like insurance it costs money every time, whether or not you need it.",
        "A bull call spread: buy a call at one strike and sell a call at a higher strike. The sold call pays for part of the bought one, so it's cheaper, but the profit stops at the higher strike. The most you can lose is what you paid. A straddle: buy a call and a put at the same strike. It profits if the stock moves far in either direction, more than the two premiums combined, and loses most if the stock sits still.",
      ],
      formula: {
        expression: "Bull call spread: max profit = (higher strike − lower strike) − net cost; max loss = net cost",
        reading: "The spread pays at most the gap between its strikes, less what it cost to set up.",
      },
    },
    example: {
      setup: "A stock trades at $100. Three-month options priced by Black-Scholes with 20% volatility and a 4% rate: a $100 call at $4.49, a $110 call at $1.14, a $100 put at $3.49, and a $90 put at $0.58. All figures are per share.",
      steps: [
        "Bull call spread: buy the $100 call and sell the $110 call. Net cost: $4.49 − $1.14 = $3.35. Max profit: $10 − $3.35 = $6.65, at $110 or above. Breakeven: $100 + $3.35 = $103.35. Max loss: $3.35.",
        "Covered call: own shares at $100 and sell the $110 call for $1.14. At $120, you make $10 + $1.14 = $11.14 instead of $20. At $90, you lose $10 − $1.14 = $8.86 instead of $10.",
        "Protective put: own shares and buy the $90 put for $0.58. The worst case is $100 − $90 + $0.58 = $10.58 lost, however far the stock falls.",
        "Straddle: buy the $100 call and the $100 put for $4.49 + $3.49 = $7.98. It profits below $92.02 or above $107.98, and loses the full $7.98 if the stock ends at $100.",
      ],
      result: "Each strategy buys one thing with another: the spread trades upside for a lower cost, the covered call trades upside for income, the put trades a steady cost for a floor, and the straddle trades premium for a bet on a big move.",
    },
    demo: "optionStrategies",
    reading: [
      { label: "A flat top", meaning: "The upside is capped, as in a covered call or a spread. You've sold away the big gains." },
      { label: "A flat bottom", meaning: "The loss is limited, as with a protective put, a spread or any option bought. You've paid for that floor." },
      { label: "A V shape", meaning: "A straddle: profit from a big move either way, with the worst result if nothing happens." },
      { label: "A line falling without limit", meaning: "Unlimited risk, as when selling a call without owning the shares. Brokers restrict these for good reason." },
    ],
    realWorld: [
      "Covered-call funds are popular for their steady income. Indexes that track the strategy on the S&P 500 have trailed the index itself during strong bull markets, because the upside keeps being sold away.",
      "Buying puts as permanent insurance is expensive. In this example, the $0.58 put costs about 2.3% a year if rolled every three months ($0.58 × 4 = $2.32 on $100), a drag that adds up over a decade.",
      "Straddles are a common way to trade earnings announcements, but the market prices in the expected move: the straddle's cost is roughly the move traders expect, so it only pays if the surprise is bigger than that.",
      "Brokers grant option permissions in levels. Covered calls and protective puts are usually allowed first; selling options without owning the shares needs the highest approval.",
    ],
    mistakes: [
      "Treating covered-call income as free money. It's paid for with the gains you give up in the best months.",
      "Insuring every position all the time. Constant puts can cost more than the falls they protect against.",
      "Buying a straddle without checking the breakevens. The stock must move more than the combined premium just to break even.",
      "Forgetting that each leg has trading costs, and that a sold option can be exercised early.",
    ],
    inMarketLab: [
      { label: "Options lab", href: "/options", text: "Draw the payoff of a covered call, protective put, bull call spread or straddle on any stock's simulated options, and see the breakevens, maximum profit and maximum loss. The drawings are for learning, but you can paper-trade single options from the chain, including [[writingOptions|covered calls and cash-secured puts]], and the portfolio shows them." },
    ],
    related: ["callsAndPuts", "optionGreeks", "impliedVolatility", "maxDrawdown"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is a covered call?",
        choices: [
          "Buying a call and a put at the same strike",
          "Owning shares and selling a call on them",
          "Buying a put on shares you own",
          "Selling a call without owning the shares",
        ],
        answer: 1,
        explanation: "The shares you own cover the call you sold. Selling without the shares is a naked call, which has unlimited risk.",
      },
      {
        kind: "Using it",
        prompt: "You buy a $50 call for $3 and sell a $55 call for $1. What's your maximum profit per share?",
        choices: ["$2", "$3", "$5", "Unlimited"],
        answer: 1,
        explanation: "Net cost is $3 − $1 = $2. The most the spread pays is $55 − $50 = $5, so the maximum profit is $5 − $2 = $3.",
      },
      {
        kind: "Using it",
        prompt: "A straddle costs $6 in total, with a $100 strike. Where are its breakevens?",
        choices: ["$94 and $106", "$97 and $103", "$100 only", "$88 and $112"],
        answer: 0,
        explanation: "The stock must move more than the $6 paid in either direction: $100 − $6 = $94 and $100 + $6 = $106.",
      },
      {
        kind: "Real world",
        prompt: "How have covered-call strategies on the S&P 500 tended to do in strong bull markets?",
        choices: ["Better than the index", "Worse than the index", "Exactly the same"],
        answer: 1,
        explanation: "Selling calls caps the gains, so in strong rallies the strategy keeps giving away the best part of the rise.",
      },
    ],
  },

  writingOptions: {
    why: [
      "Every option bought was sold by someone. The seller, or writer, collects the premium up front, and in return takes on the obligation: to pay out whatever the option is worth at expiry. Most options expire worthless or nearly so, which is why selling them appeals to many investors as a source of steady income.",
      "The catch is the shape of the bet. A writer's gain is capped at the premium, while the loss can be many times larger. Writing only options you can cover, with shares you own or cash you've set aside, keeps that loss to something you could have chosen anyway: selling the shares at the strike, or buying them there.",
    ],
    how: {
      paragraphs: [
        "In MarketLab you trade single options from the options lab's simulated chain, priced by Black-Scholes. Each contract is for 100 shares and is European: it can't be used early, and at the expiry day's close it's settled in cash at what it's worth then. A call pays the close minus the strike, a put the strike minus the close, and otherwise nothing. No shares change hands.",
        "Trades happen at the chain's price at the latest close, plus a half-spread when you buy and less one when you sell. The half-spread is 2% of the premium, and at least $0.05 a share. You can buy calls and puts, and sell ones you own, before expiry.",
        "You can write two kinds, and nothing riskier. A covered call: you need 100 shares of the stock for each contract, and they're set aside, so you can't sell them while the call is open. A cash-secured put: the strike × 100 for each contract is set aside from your buying power. To end either early, buy it back from the chain.",
        "Options are for your practice portfolio only. Season (competition) portfolios can't trade them, though they can sell short. Written options show in your holdings as negative values: what it would cost to buy them back.",
      ],
      formula: {
        expression: "writer's result at expiry = premium received − settlement paid; call settlement = max(close − strike, 0) × 100; put settlement = max(strike − close, 0) × 100",
        reading: "You keep the premium and pay whatever the option is worth when it expires.",
      },
    },
    example: {
      setup: "You own 100 shares of a $100 stock. The chain, priced with 20% volatility and a 4% rate, shows a 3-month $110 call at $1.14 and a 3-month $100 put at $3.49.",
      steps: [
        "Covered call: you write one $110 call. 2% of $1.14 is less than the $0.05 minimum, so you receive $1.14 − $0.05 = $1.09 a share, or $109.00. Your 100 shares are set aside until it ends.",
        "At expiry the stock closes at $105.00. The call is worth nothing, so you keep the $109.00, and your shares.",
        "If it closes at $120.00 instead, the call settles at $120.00 − $110.00 = $10.00 a share: $1,000.00 comes out of your cash. The shares gained $2,000.00, so you're up $2,000.00 + $109.00 − $1,000.00 = $1,109.00, rather than $2,000.00.",
        "Cash-secured put: you write one $100 put. Its half-spread is 2% of $3.49, about $0.07, so you receive $3.42 a share, or $342.00, and $10,000.00 of your buying power is set aside.",
        "At expiry the stock closes at $92.00. The put settles at $100.00 − $92.00 = $8.00 a share, so you pay $800.00 and are down $458.00. That's what you'd have lost buying 100 shares at $100.00 − $3.42 = $96.58.",
        "If it closes at $100.00 or above, you keep the $342.00: 3.42% on the $10,000.00 set aside, in three months.",
      ],
      result: "Both trades paid up front. The covered call gave up the stock's rise above $110, and the put took on the stock's fall below $100, cushioned by the premium. That's the trade every writer makes: a small, likely gain for a larger, less likely loss.",
    },
    reading: [
      { label: "Strike far from the price", meaning: "A small premium, and the option will probably expire worthless. Less income, less chance of paying out." },
      { label: "Strike near the price", meaning: "A bigger premium, and about even odds of paying out at expiry." },
      { label: "A written option showing a loss", meaning: "The stock has moved toward or past the strike. You can buy it back now, or wait for expiry." },
      { label: "Buying power lower than your cash", meaning: "Cash-secured puts, and shorts, have money set aside. It's freed when they end." },
    ],
    realWorld: [
      "Real US stock options can be exercised at any time before expiry, so a writer can be assigned early and have to deliver or buy the shares. Most stock options settle in shares, not cash; index options settle in cash.",
      "In 1993 Berkshire Hathaway sold put options on Coca-Cola shares, collecting about $7.5 million in premiums: in effect, being paid to offer to buy the stock at a lower price.",
      "Funds that write covered calls on an index are popular for their income, but have trailed the index in strong bull markets, as [[optionStrategies|option strategies]] explains.",
      "Brokers grant option permissions in levels. Covered calls and cash-secured puts usually come first; writing uncovered options needs the highest approval, because the losses have no fixed limit.",
    ],
    mistakes: [
      "Treating the premium as free income. It's paid for by the gains you give up, or the falls you take on.",
      "Writing puts on a stock you wouldn't want to own at the strike, just for the premium.",
      "Choosing whichever strike pays the most. A bigger premium means a bigger chance of paying out.",
      "Forgetting the shares behind a covered call are set aside, then trying to sell them.",
    ],
    inMarketLab: [
      { label: "Options lab", href: "/options", text: "Pick a stock, choose a contract from the chain, and buy it or write it. A covered call needs 100 shares of the stock per contract in your practice portfolio; a cash-secured put needs the strike × 100 in buying power." },
      { label: "Your options", href: "/portfolio#holdings", text: "Open options are listed with your holdings at their latest price, with a button to close them. At expiry they're settled in cash and the result appears in your activity." },
    ],
    related: ["callsAndPuts", "optionStrategies", "impliedVolatility", "shortSelling"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is a cash-secured put?",
        choices: [
          "Buying a put with cash",
          "Writing a put with the cash to pay its strike × 100 set aside",
          "A put that can only expire worthless",
          "Selling a call on shares you own",
        ],
        answer: 1,
        explanation: "You sell the put and keep enough cash aside to cover it. Selling a call on shares you own is a covered call.",
      },
      {
        kind: "Using it",
        prompt: "In MarketLab a contract's chain price is $2.00 a share. What do you receive per share for writing it?",
        choices: ["$2.00", "$1.96", "$1.95", "$2.05"],
        answer: 2,
        explanation: "The half-spread is 2% of $2.00, or $0.04, but at least $0.05, so you receive $2.00 − $0.05 = $1.95.",
      },
      {
        kind: "Using it",
        prompt: "You wrote a $50 covered call for $2. At expiry the stock closes at $56. What does the call cost you, net of the premium, per contract?",
        choices: ["$200", "$400", "$600", "Nothing"],
        answer: 1,
        explanation: "It settles at $56 − $50 = $6 a share, or $600, less the $200 received: $400. Your shares gained $6 a share, though: you gave up the rise above $50 in return for the $2.",
      },
      {
        kind: "Real world",
        prompt: "Why do brokers make writing uncovered calls the hardest permission to get?",
        choices: [
          "Because they pay no premium",
          "Because a stock can rise without limit, so the loss has no ceiling",
          "Because they always expire worthless",
        ],
        answer: 1,
        explanation: "A call writer without the shares owes the stock's whole rise above the strike, and there's no limit to how far it can go.",
      },
    ],
  },
};
