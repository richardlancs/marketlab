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
      { label: "Apple", href: "/stocks/AAPL", text: "Compare a giant like Apple with a smaller company: the share prices say little, the market caps say a lot. Its Company numbers card divides the market cap by revenue, profit and free cash flow." },
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
        "Price to sales (P/S) works the same way with [[revenue]] in place of profit: market cap ÷ a year's revenue. It's handy for companies that don't make a profit yet, but a dollar of sales is worth far more to a company with wide [[margins]] than to one with thin ones.",
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
      { label: "JPMorgan Chase", href: "/stocks/JPM", text: "Each stock page's Company numbers card shows a P/E from the company's reported earnings in its SEC filings, over the last four quarters. Compare a bank like JPMorgan Chase with a fast-growing company like NVIDIA." },
      { label: "NVIDIA", href: "/stocks/NVDA", text: "The P/E in the key numbers under the chart comes from the price source: in the mock market its earnings stay fixed, so it moves only with the simulated price. The card's P/E uses real reported earnings, but on the public site the price is still simulated, so treat it as illustrative." },
      { label: "Value screen", href: "/screener?preset=value", text: "The screener's P/E is market value ÷ the last four quarters' reported net income, and a company with a loss has none. The Value preset looks for a P/E of 18 or less with strong free cash flow." },
    ],
    related: ["marketCap", "revenue", "dividendYield", "volatility"],
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
  revenue: {
    why: [
      "Every other company number starts here. Revenue is the money a company brings in from selling its products and services, before any costs come out. It tells you how big the business is and, from one year to the next, whether customers are buying more of what it sells.",
      "Earnings, also called net income or profit, are what's left after every cost: making the products, paying staff, marketing, research, interest on debt and taxes. Revenue shows a company can sell; earnings show it can sell at a profit. A share's value rests on the earnings the company can make over the years, which is why the [[peRatio|P/E ratio]] and most valuations are built on them.",
    ],
    how: {
      paragraphs: [
        "A company's income statement runs from top to bottom. Revenue is the top line. Take away the cost of making what was sold and you have gross profit. Take away the costs of running the business, like salaries, rent, marketing and research, and you have operating income. Take away interest and taxes and you reach net income, the bottom line.",
        "Divide net income by the number of shares and you get earnings per share (EPS). Companies report a diluted EPS too, which counts the extra shares that would exist if employees' stock options and similar claims turned into shares. Diluted EPS is the cautious figure, and the one most ratios use.",
        "US companies report these numbers to the SEC every quarter, in a 10-Q, and every year, in a 10-K. Because a single quarter can be distorted by the seasons, investors often add up the last four quarters, called trailing twelve months, or compare a quarter with the same quarter a year earlier.",
      ],
      formula: {
        expression: "Net income = revenue − costs − interest − taxes; EPS = net income ÷ shares",
        reading: "What's left of the sales after everything is paid, then divided up per share.",
      },
    },
    example: {
      setup: "A company sells $10 billion of goods in a year. Making them cost $6 billion, running the business cost $2.5 billion, interest on its debt was $0.2 billion, and it pays 20% tax on its profit. It has 400 million shares.",
      steps: [
        "Gross profit: $10 billion − $6 billion = $4 billion.",
        "Operating income: $4 billion − $2.5 billion = $1.5 billion.",
        "Profit before tax: $1.5 billion − $0.2 billion = $1.3 billion. Tax at 20% is $0.26 billion, so net income is $1.04 billion.",
        "Earnings per share: $1.04 billion ÷ 400 million shares = $2.60.",
      ],
      result: "Of $10 billion in sales, only $1.04 billion, about a tenth, ended up as earnings. That $2.60 a share is what investors compare with the share price.",
    },
    reading: [
      { label: "Revenue growing, earnings growing faster", meaning: "The business gets more profitable as it grows: often the best sign of all." },
      { label: "Revenue growing, earnings flat or falling", meaning: "Growth is costing more than it brings in. Fine for a while if it's deliberate investment, a worry if it isn't." },
      { label: "Revenue shrinking", meaning: "Fewer sales, or lower prices. Cost cuts can hold up earnings for a time, but not forever." },
      { label: "A loss", meaning: "Earnings below zero. Common for young companies; there's no meaningful P/E, so investors look at revenue and cash instead." },
    ],
    realWorld: [
      "Size and profit are different things. Walmart has had more revenue than any other US company for years, over $600 billion, yet it keeps only a few cents of each dollar. Companies with a small fraction of its sales earn far more.",
      "Amazon reported little or no profit for much of its first two decades as a public company, while its revenue grew year after year. It spent the money on warehouses, technology and new businesses. Investors who judged it on earnings alone missed what the revenue growth was saying.",
      "Revenue can be inflated. Enron reported more than $100 billion of revenue in 2000, much of it from counting energy trades at their full value, and went bankrupt in 2001. Accounting rules have tightened since, but reading how a company earns its revenue still matters.",
    ],
    mistakes: [
      "Treating revenue as profit. A company can sell a lot and still lose money.",
      "Comparing one quarter with the quarter before it in a seasonal business: a retailer's holiday quarter will always beat the spring.",
      "Ignoring one-off items. A big gain from selling a division, or a large write-off, can make a single year's earnings far higher or lower than the business normally makes.",
      "Forgetting dilution. If the share count grows, profit per share can fall even while total profit rises.",
    ],
    inMarketLab: [
      { label: "Apple", href: "/stocks/AAPL", text: "The Company numbers card on each stock page shows revenue, net income and diluted EPS from the company's SEC filings, over the last four reported quarters, with five fiscal years of revenue and net income as bars. The numbers are real even though the site's prices are simulated." },
      { label: "Growth screen", href: "/screener?preset=growth", text: "The screener's Growth preset finds companies whose revenue rose 15% or more in their last fiscal year." },
    ],
    related: ["margins", "peRatio", "freeCashFlow", "marketCap"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What's the difference between revenue and net income?",
        choices: [
          "Revenue is everything sold; net income is what's left after every cost, interest and tax",
          "They are two names for the same thing",
          "Net income is revenue plus interest earned",
          "Revenue is what's paid to shareholders",
        ],
        answer: 0,
        explanation: "Revenue is the top line of the income statement; net income is the bottom line, after everything has been paid.",
      },
      {
        kind: "Using it",
        prompt: "A company earns $3 billion of net income and has 1.5 billion shares. What's its earnings per share?",
        choices: ["$4.50", "$0.50", "$2", "$1.50"],
        answer: 2,
        explanation: "$3 billion ÷ 1.5 billion shares = $2 a share.",
      },
      {
        kind: "Using it",
        prompt: "Revenue rose 20%, but net income fell. Which is the most likely explanation?",
        choices: [
          "The share price fell",
          "Costs grew faster than sales",
          "The company paid a dividend",
          "The company did a stock split",
        ],
        answer: 1,
        explanation: "Net income is revenue minus costs. If costs rise more than revenue, profit shrinks even as sales grow.",
      },
      {
        kind: "Real world",
        prompt: "Why did some investors value Amazon highly for years even though it reported little profit?",
        choices: [
          "Its revenue was growing fast while it reinvested in the business",
          "It paid large dividends",
          "Its share count was shrinking quickly",
          "Profit doesn't affect share prices",
        ],
        answer: 0,
        explanation: "Amazon spent its cash on growth. Investors bet that the fast-growing revenue would eventually turn into large profits.",
      },
    ],
  },

  margins: {
    why: [
      "Two companies with the same revenue can be completely different businesses. One might keep 25 cents of every dollar it sells; the other, 2 cents. Margins turn profit into a percentage of sales, so you can see how good a business is, not just how big.",
      "They also show where the money goes. A company can lose its profit making the product, running the business, or paying interest and taxes, and the three margins point to which. Watching them over time tells you whether a company is gaining pricing power or being squeezed.",
    ],
    how: {
      paragraphs: [
        "Each margin divides one line of the income statement by [[revenue]]. Gross margin uses gross profit: revenue less the direct cost of what was sold. Operating margin uses operating income, after the costs of running the business too. Net margin uses net income, after interest and taxes as well.",
        "Gross margin says how much customers pay above what the product costs to make. Software, where one more copy costs almost nothing, often has gross margins above 70%. A supermarket, which buys and resells goods, may have 25%. Operating margin adds in the cost of staff, marketing, offices and research, and is often the best single measure of how efficient the business is.",
        "Margins move with scale. Many costs, like headquarters and research, don't grow with every sale, so a growing company's operating margin can widen. In a downturn the same fixed costs squeeze it. Some businesses, like banks, don't report a gross profit at all, so only the net margin compares across every company.",
      ],
      formula: {
        expression: "Margin = profit ÷ revenue (gross, operating or net profit)",
        reading: "How many cents of each dollar of sales are left at that stage of the income statement.",
      },
    },
    example: {
      setup: "Two companies each have $20 billion of revenue. Software Co.'s products cost $4 billion to deliver; it makes $6 billion of operating income and $5 billion of net income. Grocer Co.'s goods cost $15 billion; it makes $0.8 billion of operating income and $0.5 billion of net income.",
      steps: [
        "Gross margin: Software Co. ($20 billion − $4 billion) ÷ $20 billion = 80%; Grocer Co. ($20 billion − $15 billion) ÷ $20 billion = 25%.",
        "Operating margin: Software Co. $6 billion ÷ $20 billion = 30%; Grocer Co. $0.8 billion ÷ $20 billion = 4%.",
        "Net margin: Software Co. $5 billion ÷ $20 billion = 25%; Grocer Co. $0.5 billion ÷ $20 billion = 2.5%.",
        "If Grocer Co.'s net margin slipped from 2.5% to 2% on the same sales, its profit would fall to $0.4 billion, down 20%.",
      ],
      result: "The same revenue produces ten times the profit at Software Co. And a thin margin is fragile: half a percentage point cost Grocer Co. a fifth of its earnings.",
    },
    reading: [
      { label: "Net margin above about 20%", meaning: "A very profitable business, often with strong brands, patents or software. Competitors usually want a piece of it." },
      { label: "About 5% to 20%", meaning: "Typical of many established companies across industries." },
      { label: "Below about 5%", meaning: "Normal for retailers, grocers and airlines, which sell high volumes at thin margins; small changes in costs move profit a lot." },
      { label: "Margins widening over time", meaning: "The company is gaining pricing power or scale. Narrowing margins point to rising costs or tougher competition." },
    ],
    realWorld: [
      "Margins differ hugely by industry. Large software companies often keep gross margins of 70% to 80% or more, while US supermarkets typically earn net margins of only a few percent. Comparing a company with its own industry, and with its own history, says far more than comparing it with the whole market.",
      "Apple's gross margin has been in the 40s, in percent, for years: high for a company that makes physical devices, thanks to its brand and the growing share of services, which cost little to deliver. It's one reason investors pay a high P/E for it.",
      "In 2022 rising costs for shipping, wages and materials squeezed the margins of many retailers, and some, like Target, saw profits fall sharply even though sales held up. Margins are often where trouble shows first.",
    ],
    mistakes: [
      "Comparing margins across very different industries. A grocer will never have a software company's margins, and doesn't need them.",
      "Looking only at net margin. A one-off gain or charge can swing it; operating margin is usually steadier.",
      "Assuming high margins will last. They attract competitors, and keeping them takes something others can't copy.",
      "Forgetting that a margin is a percentage. A huge company with a thin margin can still earn more dollars than a small one with a wide margin.",
    ],
    inMarketLab: [
      { label: "Apple", href: "/stocks/AAPL", text: "The Company numbers card on each stock page shows gross, operating and net margins over the last four reported quarters, from SEC filings. Banks show no gross or operating margin, because they don't report one." },
      { label: "Quality screen", href: "/screener?preset=quality", text: "The screener's Quality preset looks for a net margin of 15% or more alongside a high return on equity. Switch the table to Company numbers to compare net margins." },
    ],
    related: ["revenue", "returnOnEquity", "peRatio"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does a gross margin measure?",
        choices: [
          "Profit after every cost, as a share of revenue",
          "Revenue less the direct cost of what was sold, as a share of revenue",
          "The share of profit paid as dividends",
          "Revenue growth over a year",
        ],
        answer: 1,
        explanation: "Gross margin only takes out the cost of making or buying what was sold. Net margin takes out everything.",
      },
      {
        kind: "Using it",
        prompt: "A company has $50 billion of revenue and $6 billion of net income. What's its net margin?",
        choices: ["6%", "8.3%", "12%", "50%"],
        answer: 2,
        explanation: "$6 billion ÷ $50 billion = 12%: 12 cents of profit on each dollar of sales.",
      },
      {
        kind: "Using it",
        prompt: "Two companies grow revenue by the same amount. Which one's profit is most sensitive to a small rise in costs?",
        choices: [
          "The one with the 3% net margin",
          "The one with the 30% net margin",
          "Both equally",
          "Neither: costs don't affect profit",
        ],
        answer: 0,
        explanation: "With a thin margin, a small rise in costs takes a big share of the profit.",
      },
      {
        kind: "Real world",
        prompt: "Why do software companies usually have much higher gross margins than supermarkets?",
        choices: [
          "They sell more units",
          "They pay no taxes",
          "Supermarkets don't report revenue",
          "Delivering one more copy of software costs almost nothing, while a supermarket must buy every item it sells",
        ],
        answer: 3,
        explanation: "Gross margin is about the direct cost of each sale. For software it's tiny; for a grocer it's most of the price.",
      },
    ],
  },

  returnOnEquity: {
    why: [
      "Profit on its own doesn't tell you how hard a company's money is working. Earning $1 billion is impressive with $5 billion invested and disappointing with $50 billion. Return on equity measures profit against the money that belongs to the shareholders, so you can judge how well a company uses what its owners have put in and left in the business.",
      "Over long periods, companies that keep earning a high return on their equity, and can reinvest at that rate, tend to grow their earnings fastest. That's why many investors treat a high, steady ROE as a sign of a quality business.",
    ],
    how: {
      paragraphs: [
        "Shareholders' equity is what would be left for the owners if the company sold everything it owns at the values on its books and paid off everything it owes. It grows when the company keeps its profits and shrinks when it pays dividends, buys back shares or makes losses. ROE divides a year's net income by it.",
        "Debt changes the picture. A company that borrows to fund its business, or to buy back its own shares, has less equity for the same profit, so its ROE rises. That can be sensible, but it adds risk: the debt has to be repaid in bad years too. Comparing ROE with how much a company owes tells you which kind of high ROE you're looking at.",
        "When a company has bought back so many shares that its debts exceed the book value of what it owns, equity falls below zero and ROE stops meaning anything. Several well-known, profitable companies are in that position. Then it's better to look at [[margins]], [[freeCashFlow|free cash flow]] and debt instead.",
      ],
      formula: {
        expression: "ROE = net income ÷ shareholders' equity",
        reading: "A year's profit for every dollar the owners have in the company.",
      },
    },
    example: {
      setup: "A company earns $2 billion a year and has $10 billion of shareholders' equity. It then borrows $4 billion and uses all of it to buy back its own shares; the interest costs it $0.2 billion a year after tax.",
      steps: [
        "ROE before: $2 billion ÷ $10 billion = 20%.",
        "The buyback pays $4 billion to shareholders who sell, so equity falls to $10 billion − $4 billion = $6 billion.",
        "Net income falls by the interest: $2 billion − $0.2 billion = $1.8 billion.",
        "ROE after: $1.8 billion ÷ $6 billion = 30%.",
      ],
      result: "ROE rose from 20% to 30% while the business itself didn't change at all and total profit fell. The higher number came from borrowing, and so did the extra risk.",
    },
    reading: [
      { label: "Above about 20%, with little debt", meaning: "A business that earns a lot on its owners' money without leaning on borrowing: often a sign of a lasting edge." },
      { label: "About 10% to 20%", meaning: "Solid. Many established companies, including large banks, land here in normal years." },
      { label: "Below about 10%", meaning: "The company earns little on its equity: a tough, capital-hungry industry, or a weak year." },
      { label: "Very high, or no figure", meaning: "Check the equity. Heavy buybacks or debt can push ROE into the hundreds of percent, and below-zero equity makes it meaningless." },
    ],
    realWorld: [
      "Warren Buffett has long said he looks for businesses that earn a high return on equity without using much debt. A company that can reinvest its profits at a high rate year after year compounds its value, much like money in an account with a high interest rate.",
      "Some of the best-known US companies, including McDonald's and Starbucks, have reported negative shareholders' equity in recent years after spending heavily on buybacks and dividends, partly funded with debt. They're profitable businesses, but ROE can't describe them.",
      "Banks are judged closely on ROE because they run on borrowed money by design: deposits and debt fund most of what they lend. Regulators require them to hold minimum levels of equity, which caps how far borrowing can lift their returns.",
    ],
    mistakes: [
      "Taking a high ROE as proof of quality without checking debt. Borrowing raises ROE and risk together.",
      "Comparing ROE across industries with very different needs for buildings, equipment or capital.",
      "Reading meaning into a huge or negative ROE when equity is tiny or below zero.",
      "Judging on one year. A single great or terrible year swings ROE; a steady record says more.",
    ],
    inMarketLab: [
      { label: "Apple", href: "/stocks/AAPL", text: "The Company numbers card shows return on equity for the last fiscal year, from SEC filings. Apple's is well above 100%, largely because years of buybacks have shrunk its equity." },
      { label: "Quality screen", href: "/screener?preset=quality", text: "The screener's Quality preset asks for an ROE and a net margin of 15% or more, with revenue still growing. Companies with equity below zero have no ROE, so they drop out." },
    ],
    related: ["margins", "revenue", "freeCashFlow", "compounding"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What does return on equity measure?",
        choices: [
          "How much the share price rose in a year",
          "Revenue as a share of market cap",
          "A year's net income as a percentage of shareholders' equity",
          "Dividends as a share of profit",
        ],
        answer: 2,
        explanation: "ROE compares profit with the owners' stake in the company, as recorded on its balance sheet.",
      },
      {
        kind: "Using it",
        prompt: "A company earns $3 billion and has $20 billion of shareholders' equity. What's its ROE?",
        choices: ["15%", "6.7%", "30%", "23%"],
        answer: 0,
        explanation: "$3 billion ÷ $20 billion = 15%.",
      },
      {
        kind: "Using it",
        prompt: "A company borrows money to buy back shares. Its profit barely changes. What usually happens to its ROE?",
        choices: [
          "It falls, because it has more debt",
          "It rises, because equity shrinks",
          "It stays the same",
          "It becomes negative straight away",
        ],
        answer: 1,
        explanation: "The buyback reduces equity, the bottom of the fraction, so ROE goes up, along with the risk from the new debt.",
      },
      {
        kind: "Real world",
        prompt: "Why do some profitable companies, like McDonald's, have no meaningful ROE?",
        choices: [
          "They don't report their profit",
          "Their profits are too small",
          "Their shares don't trade",
          "Buybacks and dividends, partly funded by debt, pushed their equity below zero",
        ],
        answer: 3,
        explanation: "With negative equity, dividing profit by it gives a meaningless number, even though the business makes money.",
      },
    ],
  },

  freeCashFlow: {
    why: [
      "Earnings are an accounting measure. They spread the cost of a new factory over many years, count sales before customers have paid, and involve plenty of judgment. Free cash flow is simpler: the cash that actually came in from running the business, less the cash spent keeping it equipped and growing.",
      "It's the money a company can really use to pay dividends, buy back shares, pay down debt or buy other companies. A company whose profits never turn into cash has a problem, however good its income statement looks. That's why many investors check free cash flow alongside [[revenue|earnings]].",
    ],
    how: {
      paragraphs: [
        "Start with operating cash flow, from the company's cash flow statement: the cash brought in by its day-to-day business. It begins with net income, adds back costs that didn't use cash, like the yearly wear on equipment, and adjusts for changes such as customers paying late or the company holding more stock.",
        "Then subtract capital spending: the cash spent on buildings, equipment, data centers and the like. What's left is free cash flow. A company building for growth can have low free cash flow for years while it invests; a mature one often produces more cash than profit.",
        "Divide free cash flow by the [[marketCap|market cap]] and you get the free cash flow yield, a valuation measure like the earnings yield. A 5% yield means the business produces $5 of free cash a year for every $100 of its market value. For banks and insurers, whose cash flows are mostly lending and deposits, free cash flow doesn't mean much.",
      ],
      formula: {
        expression: "Free cash flow = operating cash flow − capital spending; FCF yield = free cash flow ÷ market cap",
        reading: "The cash left after keeping the business running and equipped, and that cash as a share of what the company is worth.",
      },
    },
    example: {
      setup: "A company brings in $8 billion of operating cash flow in a year and spends $3 billion on equipment. It reports $6 billion of net income, and its market cap is $100 billion.",
      steps: [
        "Free cash flow: $8 billion − $3 billion = $5 billion.",
        "Free cash flow yield: $5 billion ÷ $100 billion = 5%.",
        "It pays $2 billion in dividends and buys back $2 billion of shares, leaving $5 billion − $2 billion − $2 billion = $1 billion of free cash.",
        "The next year it builds new factories and capital spending rises to $7 billion. Free cash flow falls to $8 billion − $7 billion = $1 billion, a yield of 1%, even if profit stays the same.",
      ],
      result: "Earnings of $6 billion looked steady, but the cash free for shareholders fell from $5 billion to $1 billion once spending rose. Whether that's good depends on what the new factories earn.",
    },
    reading: [
      { label: "Free cash flow close to or above net income", meaning: "Profits are turning into cash: a healthy sign, common in mature businesses." },
      { label: "Free cash flow well below net income", meaning: "Heavy investment, or profits that aren't being collected as cash. Find out which." },
      { label: "Negative", meaning: "The company spends more than its business brings in and must use savings, borrow or sell shares. Normal for young growth companies; a warning for mature ones." },
      { label: "FCF yield above about 5%", meaning: "The price is low compared with the cash the business produces, or investors expect that cash to shrink." },
    ],
    realWorld: [
      "In his 2004 letter to shareholders, Jeff Bezos wrote that Amazon's ultimate financial measure was free cash flow per share, not earnings. Amazon reported thin profits for years while generating growing amounts of cash, and many investors followed the cash.",
      "In 2024 and 2025 the largest technology companies sharply increased their spending on data centers for artificial intelligence. Their profits kept rising, but the extra capital spending took a bigger bite out of free cash flow, which is exactly the gap this measure exists to show.",
      "Companies sometimes highlight their own adjusted versions of free cash flow, leaving out costs like stock given to employees. The numbers in a company's cash flow statement, filed with the SEC, are the place to check.",
    ],
    mistakes: [
      "Judging one year in isolation. Capital spending comes in waves, so free cash flow swings more than profit.",
      "Treating negative free cash flow as always bad. A company investing in projects that will earn well later may be doing exactly the right thing.",
      "Using free cash flow for banks and insurers, whose cash flows are dominated by deposits and loans.",
      "Trusting a company's adjusted figure without seeing what it leaves out.",
    ],
    inMarketLab: [
      { label: "Alphabet", href: "/stocks/GOOGL", text: "The Company numbers card shows free cash flow for the last fiscal year, from SEC filings, and what share of the market value it is. Prices on the public site are simulated, so the yield is illustrative; the cash flows are real." },
      { label: "Value screen", href: "/screener?preset=value", text: "The screener's Value preset combines a P/E of 18 or less with a free cash flow yield of 4% or more. Switch the table to Company numbers to see each company's FCF yield." },
    ],
    related: ["revenue", "peRatio", "dividendYield", "returnOnEquity"],
    quiz: [
      {
        kind: "Terminology",
        prompt: "What is free cash flow?",
        choices: [
          "Net income plus dividends",
          "Operating cash flow less capital spending",
          "The cash a company holds in the bank",
          "Revenue less the cost of what was sold",
        ],
        answer: 1,
        explanation: "It's the cash the business brought in from operations, after paying for the buildings and equipment it needs.",
      },
      {
        kind: "Using it",
        prompt: "A company has $12 billion of operating cash flow, $4 billion of capital spending and a $160 billion market cap. What's its free cash flow yield?",
        choices: ["7.5%", "10%", "2.5%", "5%"],
        answer: 3,
        explanation: "$12 billion − $4 billion = $8 billion of free cash flow, and $8 billion ÷ $160 billion = 5%.",
      },
      {
        kind: "Using it",
        prompt: "A company's profit is unchanged, but its free cash flow fell sharply. What's a likely reason?",
        choices: [
          "It spent much more on new equipment and buildings",
          "Its share price fell",
          "It did a stock split",
          "It changed its dividend date",
        ],
        answer: 0,
        explanation: "Capital spending comes straight out of free cash flow, while its cost reaches profit only gradually, over the years the equipment is used.",
      },
      {
        kind: "Real world",
        prompt: "Why did Amazon's Jeff Bezos focus on free cash flow per share rather than earnings?",
        choices: [
          "Amazon didn't report earnings",
          "Earnings are always higher than cash flow",
          "Cash is what a business can actually reinvest or return, and Amazon's cash grew while its profits stayed thin",
          "Regulators required it",
        ],
        answer: 2,
        explanation: "Amazon reinvested heavily, which kept profits low, but its operations produced growing amounts of cash, the measure Bezos said mattered most.",
      },
    ],
  },
};
