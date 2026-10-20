import type { TermKey } from "../../glossary";
import type { Lesson } from "../types";

export const COMPANY_NUMBERS_LESSONS: Partial<Record<TermKey, Lesson>> = {
  marketCap: {
    why: [
      "A share price on its own tells you almost nothing about how big a company is. One company might have a few hundred million shares, another tens of billions. A $500 share can belong to a smaller business than a $50 one, and a stock that falls from $400 to $100 after a [[split]] hasn't shrunk at all.",
      "Market cap fixes that by counting every share. It's the number investors use to compare company sizes, to group stocks into large, mid and small companies, and to decide how much of each company an index like the S&P 500 holds.",
    ],
    how: {
      paragraphs: [
        "Multiply the share price by the number of shares the company has issued and that investors hold, called shares outstanding. The result is what the stock market as a whole says the company is worth today. It changes every time the price does.",
        "Because a split multiplies the share count and divides the price by the same amount, it leaves market cap unchanged. Buybacks work the other way: a company that buys back its own shares reduces the share count, so each remaining share is a slightly bigger slice.",
        "Investors often sort companies by size. Common rough cutoffs are large cap above about $10 billion, mid cap from about $2 billion to $10 billion, and small cap below that. The lines differ between index providers, but the idea is the same: bigger companies tend to be more established and steadier; smaller ones have more room to grow and more ways to fail.",
      ],
      formula: {
        expression: "Market cap = share price × shares outstanding",
        reading: "The price of one share times how many shares exist: the stock market's price tag for the whole company.",
      },
    },
    example: {
      setup: "Company A's shares cost $50 and it has 2 billion of them. Company B's shares cost $500 and it has 100 million.",
      steps: [
        "Company A: $50 × 2,000,000,000 = $100 billion.",
        "Company B: $500 × 100,000,000 = $50 billion.",
        "Company B then splits 2-for-1: it now has 200 million shares at $250. $250 × 200,000,000 = $50 billion, the same as before.",
        "If Company A's price rises 10% to $55, its market cap rises 10% too: $55 × 2,000,000,000 = $110 billion.",
      ],
      result: "Company A is twice the size of Company B even though its shares cost a tenth as much, and B's split didn't change its size at all.",
    },
    demo: "companySize",
    reading: [
      { label: "Above $200 billion", meaning: "Often called mega cap: the biggest companies in the world, household names that dominate their indices." },
      { label: "$10 billion to $200 billion", meaning: "Large cap. Established companies, usually followed by many analysts and widely held by funds." },
      { label: "$2 billion to $10 billion", meaning: "Mid cap. Still sizable, often growing, and usually more volatile than the giants." },
      { label: "Below $2 billion", meaning: "Small cap and smaller. More room to grow, but bigger swings and a higher chance of failing." },
    ],
    realWorld: [
      "Most major indices, including the S&P 500 and the Nasdaq Composite, weight their companies by market cap. A company worth $3 trillion counts about 100 times as much as one worth $30 billion, so a handful of the largest companies can move the whole index. In recent years the ten biggest have made up roughly a third of the S&P 500. The Dow is the well-known exception: it weights by share price.",
      "Apple became the first US company worth $1 trillion in 2018, and a few companies, mostly in technology, have since passed several trillion dollars. Sizes change fast: a market cap is only the price investors are willing to pay today, and it can halve in a bad year, as many tech companies' did in the 2000 dot-com crash.",
      "Market cap isn't the price to buy the whole company. A buyer usually has to pay a premium over the market price to persuade shareholders to sell, and takes on the company's debts too. Analysts often look at enterprise value, which adds debt and subtracts cash, when comparing what businesses are really worth.",
    ],
    mistakes: [
      "Judging size, or cheapness, by the share price. A $20 stock isn't cheaper than a $2,000 stock in any useful sense; compare market caps and ratios like the [[peRatio|P/E ratio]].",
      "Thinking a split makes a company bigger or smaller. It changes the price per share, not the value of the company or of your holding.",
      "Treating market cap as fixed. It moves with the price every day, so a company's rank can change quickly.",
      "Assuming bigger means safer in every case. Large companies can still fall sharply, and a cap-weighted index can be more concentrated in a few giants than it looks.",
    ],
    inMarketLab: [
      { label: "Stocks table", href: "/stocks", text: "Every stock's page shows its market cap. In the mock market it starts from the company's real value on Oct 16, 2026 and moves with the simulated price; with real Tiingo prices it shows \"—\"." },
      { label: "Apple", href: "/stocks/AAPL", text: "Compare a giant like Apple with a smaller company: the share prices say little, the market caps say a lot." },
    ],
    related: ["peRatio", "split", "etf", "diversification"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "How is market cap calculated?",
        choices: [
          "Yearly revenue × 10",
          "Share price × shares outstanding",
          "Total profit ÷ share price",
          "The company's cash minus its debt",
        ],
        answer: 1,
        explanation: "Market cap counts every share at today's price. It's the stock market's valuation of the whole company.",
      },
      {
        kind: "Using it",
        prompt: "A $40 stock has 500 million shares outstanding. What's its market cap?",
        choices: ["$2 billion", "$200 million", "$20 billion", "$540 million"],
        answer: 2,
        explanation: "$40 × 500,000,000 = $20,000,000,000, or $20 billion: a large cap by common definitions.",
      },
      {
        kind: "Using it",
        prompt: "A company worth $60 billion does a 3-for-1 split. What's its market cap right after?",
        choices: ["$20 billion", "$180 billion", "It depends on the new price", "$60 billion"],
        answer: 3,
        explanation: "There are three times as many shares at a third of the price, so the total stays $60 billion.",
      },
      {
        kind: "Real world",
        prompt: "Why can a few huge companies move the S&P 500 so much?",
        choices: [
          "The index weights companies by market cap, so the biggest count the most",
          "The index gives every company the same weight",
          "Only large companies are allowed to trade",
          "The index is weighted by share price",
        ],
        answer: 0,
        explanation: "In a cap-weighted index, a $3 trillion company counts about 100 times as much as a $30 billion one. Weighting by share price is how the Dow works.",
      },
    ],
  },

  peRatio: {
    why: [
      "A share price on its own can't tell you whether a stock is expensive. $300 might be a bargain for a hugely profitable company and a fortune for one that barely makes money. To judge price, you need to compare it with what you're buying, and for a company that's mostly its profits.",
      "The P/E ratio does exactly that. It turns any stock into the same question, how many dollars am I paying for each dollar of profit, so a bank, a software company and a soft-drink maker can be compared on the same scale. It's the most quoted valuation number in investing.",
    ],
    how: {
      paragraphs: [
        "Earnings per share (EPS) is the company's yearly profit divided by its number of shares. Divide the share price by it and you get the P/E. Equivalently, divide the [[marketCap|market cap]] by the total yearly profit; the answer is the same.",
        "Most quoted P/Es are trailing: they use the last 12 months of actual profit. A forward P/E uses analysts' estimates for the next 12 months instead. Forward P/Es look lower for growing companies, but they rest on forecasts that can be wrong.",
        "Flip the ratio and you get the earnings yield: a P/E of 20 means profits are 1 ÷ 20 = 5% of the price. That makes it easy to compare with interest rates. A company that loses money has no meaningful P/E, and data sites usually show a dash.",
        "The price moves every day while earnings are reported only every quarter, so the P/E rises and falls with the share price between reports.",
      ],
      formula: {
        expression: "P/E = share price ÷ earnings per share",
        reading: "How many dollars investors pay today for each dollar of the company's yearly profit.",
      },
    },
    example: {
      setup: "Two companies' shares both cost $60. Steady Co. earned $3 per share last year. Fast Co. earned $1.50 per share, but its profits are growing about 25% a year.",
      steps: [
        "Steady Co.: $60 ÷ $3 = a P/E of 20. Its earnings yield is $3 ÷ $60 = 5%.",
        "Fast Co.: $60 ÷ $1.50 = a P/E of 40. Investors pay twice as much for each dollar of today's profit.",
        "If Fast Co. keeps growing 25% a year for three years, its earnings become $1.50 × 1.25 × 1.25 × 1.25 ≈ $2.93.",
        "At the same $60 price, its P/E would then be $60 ÷ $2.93 ≈ 20.5, close to Steady Co.'s today.",
      ],
      result: "Fast Co.'s P/E of 40 is a bet that its growth continues. If it does, the price looks reasonable in hindsight; if growth stalls, investors may only pay 20 times earnings, and the share price could halve.",
    },
    demo: "companySize",
    reading: [
      { label: "Below about 10", meaning: "Investors expect little growth, or worry that profits will fall. Sometimes a bargain, often a sign of trouble." },
      { label: "About 10 to 20", meaning: "Typical of mature, steady companies. A broad US index has averaged somewhere in the mid-teens over long stretches of history." },
      { label: "About 20 to 40", meaning: "Investors expect solid growth. Common for strong technology and consumer brands." },
      { label: "Above 40, or none", meaning: "Investors are paying mostly for the future. Big rewards if growth comes through, and big falls if it doesn't." },
    ],
    realWorld: [
      "During the dot-com bubble around 2000, many technology stocks traded at P/Es above 100, or had no earnings at all. When growth disappointed, prices collapsed: the Nasdaq Composite fell almost 80% from its 2000 peak to its 2002 low. High P/Es weren't wrong by definition, but they left no room for disappointment.",
      "P/Es differ a lot by industry. Banks, energy companies and car makers often trade at low P/Es because their profits rise and fall with the economy. Software companies often trade at high ones because investors expect fast, durable growth. Comparing a company with others in its own industry tells you more than comparing it with the whole market.",
      "Professional investors treat P/E as a starting point, not a verdict. A company at the peak of a boom can look cheap because its profits are temporarily high, just before they fall. Some analysts use an average of ten years of earnings, adjusted for inflation, to smooth that out.",
    ],
    mistakes: [
      "Thinking a low P/E always means a bargain. Often the market expects profits to shrink, and it's right.",
      "Comparing P/Es across very different industries without thinking about their growth.",
      "Mixing trailing and forward P/Es when comparing two companies.",
      "Ignoring one-off items. A big one-time gain or charge can make a single year's P/E look far lower or higher than normal.",
    ],
    inMarketLab: [
      { label: "JPMorgan Chase", href: "/stocks/JPM", text: "Each stock page shows its P/E. Compare a bank like JPMorgan Chase with a fast-growing company like NVIDIA." },
      { label: "NVIDIA", href: "/stocks/NVDA", text: "In the mock market each stock's earnings stay fixed, so its P/E moves only with the simulated price. With real Tiingo prices, P/E shows \"—\"." },
    ],
    related: ["marketCap", "dividendYield", "volatility"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does a P/E ratio of 25 mean?",
        choices: [
          "The company's profit grew 25% last year",
          "The share price is $25",
          "Investors pay $25 for each $1 of the company's yearly profit",
          "The company pays 25% of its profit as dividends",
        ],
        answer: 2,
        explanation: "P/E is price divided by earnings per share. At 25, the price is 25 times one year of profit.",
      },
      {
        kind: "Using it",
        prompt: "A stock costs $90 and earned $6 per share over the last year. What's its P/E, and its earnings yield?",
        choices: ["15, and about 6.7%", "6, and about 15%", "54, and about 1.9%", "15, and 15%"],
        answer: 0,
        explanation: "$90 ÷ $6 = 15. The earnings yield is the reverse: $6 ÷ $90 ≈ 6.7%.",
      },
      {
        kind: "Using it",
        prompt: "A company's earnings stay the same, but its share price rises 20%. What happens to its P/E?",
        choices: ["It falls 20%", "It doesn't change", "It can't be calculated", "It rises 20%"],
        answer: 3,
        explanation: "The price is on top of the fraction, so with earnings unchanged, the P/E rises by the same 20%.",
      },
      {
        kind: "Real world",
        prompt: "Why did many high-P/E technology stocks fall so far after 2000?",
        choices: [
          "Their P/E ratios were calculated wrongly",
          "Their prices assumed rapid growth, and when it didn't arrive, investors were no longer willing to pay as much",
          "They stopped paying dividends",
          "Their market caps were too small",
        ],
        answer: 1,
        explanation: "A high P/E prices in a lot of future growth. When growth disappointed, the price fell toward what the actual earnings could support.",
      },
    ],
  },

  dividendYield: {
    why: [
      "A [[dividend]] in dollars doesn't tell you much on its own: $2 a year is generous on a $40 share and tiny on a $400 one. The dividend yield turns it into a percentage of the price, so you can compare the income from any stock with any other, or with the interest on a savings account or a bond.",
      "For investors who live off their portfolio, yield is the income their money produces without selling anything. For everyone else it's one part of [[totalReturn|total return]], alongside the price rising or falling.",
    ],
    how: {
      paragraphs: [
        "Add up a year of dividends per share and divide by the current share price. Most US companies pay quarterly, so the yearly figure is usually the latest quarterly dividend times four. Data sites often use the last 12 months of payments instead.",
        "Because the price is on the bottom of the fraction, the yield moves opposite to the price. If the dividend stays the same and the price falls, the yield goes up; if the price rises, the yield goes down. A high yield can come from a generous company or from a falling share price.",
        "A useful check is the payout ratio: dividends as a share of profit. A company paying out 50% of its earnings has room to keep paying in a bad year. One paying out more than it earns is using savings or borrowing to do it, which can't last forever.",
      ],
      formula: {
        expression: "Dividend yield = yearly dividends per share ÷ share price",
        reading: "A year of cash payments as a percentage of what one share costs today.",
      },
    },
    example: {
      setup: "A company's shares cost $80, and it pays a dividend of $0.60 a share every quarter. You own 100 shares.",
      steps: [
        "Yearly dividend: $0.60 × 4 = $2.40 a share.",
        "Yield: $2.40 ÷ $80 = 3%. Your 100 shares pay $240 a year, $60 each quarter.",
        "Bad news sends the price down to $50, and the dividend hasn't changed yet. Yield: $2.40 ÷ $50 = 4.8%.",
        "The company then halves its dividend to $1.20 a year. Yield: $1.20 ÷ $50 = 2.4%, and your income falls to $120 a year.",
      ],
      result: "The 4.8% yield looked like a better deal than 3%, but it came from a falling price, and it disappeared when the dividend was cut.",
    },
    demo: "dividend",
    reading: [
      { label: "0%", meaning: "No dividend. Common for young or fast-growing companies that reinvest everything, or that return cash through buybacks instead." },
      { label: "About 1% to 2%", meaning: "Typical of many large companies. A broad US index has mostly yielded somewhere in this range in recent years." },
      { label: "About 3% to 5%", meaning: "Common for mature, steady businesses like utilities, telecoms and consumer staples." },
      { label: "Well above the norm", meaning: "Check why. Often the price has fallen because investors expect the dividend to be cut." },
    ],
    realWorld: [
      "Companies treat dividends as a promise and cut them only when they must, because a cut usually sends the share price down. In the 2008 financial crisis many banks slashed their dividends, and income investors who had bought them for their high yields lost both income and much of their capital.",
      "Some companies are known for raising their dividend every year for decades. The S&P 500 Dividend Aristocrats are the index members that have raised it for at least 25 years in a row; consumer-goods makers and utilities are well represented. A long record shows commitment, though it doesn't guarantee the future.",
      "Many large companies, especially in technology, pay small dividends or none and return cash by buying back shares instead. So a low yield doesn't mean a company isn't rewarding its shareholders, and comparing yields alone can miss half the picture.",
    ],
    mistakes: [
      "Chasing the highest yield. An unusually high yield is often a warning that the market expects a cut.",
      "Treating dividends as extra return. On the ex-dividend date the price usually drops by about the dividend, so you get the cash but your shares are worth a little less.",
      "Forgetting that dividends can be cut or stopped at any time; unlike bond interest, they aren't owed.",
      "Ignoring total return. A 5% yield on a stock that falls 10% a year still loses money.",
    ],
    inMarketLab: [
      { label: "Coca-Cola", href: "/stocks/KO", text: "In the mock market, dividend payers like Coca-Cola pay about a quarter of their real yearly yield each quarter, worked out from the simulated price on the day." },
      { label: "Portfolio", href: "/portfolio", text: "Dividends land in your simulated cash on the ex-date, for the shares you held at the previous close." },
    ],
    related: ["dividend", "totalReturn", "peRatio", "compounding"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is a dividend yield?",
        choices: [
          "The total dividends a company has ever paid",
          "The share of profit paid out as dividends",
          "How much the share price rose last year",
          "A year of dividends as a percentage of the current share price",
        ],
        answer: 3,
        explanation: "Yield is yearly dividends per share divided by the price. The share of profit paid out is the payout ratio.",
      },
      {
        kind: "Using it",
        prompt: "A $50 stock pays $0.50 a share each quarter. What's its dividend yield?",
        choices: ["1%", "4%", "2%", "0.5%"],
        answer: 1,
        explanation: "$0.50 × 4 = $2 a year, and $2 ÷ $50 = 4%.",
      },
      {
        kind: "Using it",
        prompt: "A stock's dividend stays the same while its price doubles. What happens to its yield?",
        choices: ["It halves", "It doubles", "It stays the same", "It goes to zero"],
        answer: 0,
        explanation: "The price is on the bottom of the fraction. Double the price with the same dividend and the yield is cut in half.",
      },
      {
        kind: "Real world",
        prompt: "A stock's yield has jumped to 9% because its price fell sharply. What's the most sensible reading?",
        choices: [
          "It's a bargain that guarantees 9% a year",
          "The market may expect the dividend to be cut; check the company's profits and payout ratio",
          "The company has just raised its dividend",
          "High yields mean the stock can't fall further",
        ],
        answer: 1,
        explanation: "Yields often spike because the price has fallen on bad news. If the dividend is then cut, the high yield disappears.",
      },
    ],
  },
};
