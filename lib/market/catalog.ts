/**
 * The catalog: every stock you can look up, watch, trade and backtest in
 * either data mode. The ten core stocks (./universe.ts) fill the dashboard and
 * the stocks table; the others are opened from search or the "More stocks"
 * list. With Tiingo (personal use only), any other real ticker works too.
 *
 * Names and sectors are typed from public knowledge, not copied from a data
 * provider, so this list can ship with the public site. Data only, like
 * universe.ts, so proxy.ts and the browser can import it cheaply.
 */
import { STOCKS, type StockListing } from "./universe";

const MORE_STOCKS: readonly StockListing[] = [
  // Technology and semiconductors
  { symbol: "ORCL", name: "Oracle Corp.", sector: "Technology" },
  { symbol: "CRM", name: "Salesforce Inc.", sector: "Technology" },
  { symbol: "ADBE", name: "Adobe Inc.", sector: "Technology" },
  { symbol: "IBM", name: "International Business Machines", sector: "Technology" },
  { symbol: "CSCO", name: "Cisco Systems Inc.", sector: "Technology" },
  { symbol: "ACN", name: "Accenture plc", sector: "Technology" },
  { symbol: "INTU", name: "Intuit Inc.", sector: "Technology" },
  { symbol: "NOW", name: "ServiceNow Inc.", sector: "Technology" },
  { symbol: "PLTR", name: "Palantir Technologies Inc.", sector: "Technology" },
  { symbol: "SHOP", name: "Shopify Inc.", sector: "Technology" },
  { symbol: "UBER", name: "Uber Technologies Inc.", sector: "Technology" },
  { symbol: "AVGO", name: "Broadcom Inc.", sector: "Semiconductors" },
  { symbol: "AMD", name: "Advanced Micro Devices Inc.", sector: "Semiconductors" },
  { symbol: "INTC", name: "Intel Corp.", sector: "Semiconductors" },
  { symbol: "QCOM", name: "Qualcomm Inc.", sector: "Semiconductors" },
  { symbol: "TXN", name: "Texas Instruments Inc.", sector: "Semiconductors" },
  { symbol: "MU", name: "Micron Technology Inc.", sector: "Semiconductors" },
  { symbol: "AMAT", name: "Applied Materials Inc.", sector: "Semiconductors" },
  { symbol: "TSM", name: "Taiwan Semiconductor Manufacturing", sector: "Semiconductors" },
  // Communication services
  { symbol: "DIS", name: "Walt Disney Co.", sector: "Communication Services" },
  { symbol: "CMCSA", name: "Comcast Corp.", sector: "Communication Services" },
  { symbol: "T", name: "AT&T Inc.", sector: "Communication Services" },
  { symbol: "VZ", name: "Verizon Communications Inc.", sector: "Communication Services" },
  { symbol: "TMUS", name: "T-Mobile US Inc.", sector: "Communication Services" },
  { symbol: "SPOT", name: "Spotify Technology S.A.", sector: "Communication Services" },
  // Consumer discretionary
  { symbol: "HD", name: "Home Depot Inc.", sector: "Consumer Discretionary" },
  { symbol: "LOW", name: "Lowe's Companies Inc.", sector: "Consumer Discretionary" },
  { symbol: "MCD", name: "McDonald's Corp.", sector: "Consumer Discretionary" },
  { symbol: "SBUX", name: "Starbucks Corp.", sector: "Consumer Discretionary" },
  { symbol: "NKE", name: "Nike Inc.", sector: "Consumer Discretionary" },
  { symbol: "BKNG", name: "Booking Holdings Inc.", sector: "Consumer Discretionary" },
  { symbol: "TJX", name: "TJX Companies Inc.", sector: "Consumer Discretionary" },
  { symbol: "GM", name: "General Motors Co.", sector: "Consumer Discretionary" },
  { symbol: "F", name: "Ford Motor Co.", sector: "Consumer Discretionary" },
  { symbol: "ABNB", name: "Airbnb Inc.", sector: "Consumer Discretionary" },
  // Consumer staples
  { symbol: "WMT", name: "Walmart Inc.", sector: "Consumer Staples" },
  { symbol: "COST", name: "Costco Wholesale Corp.", sector: "Consumer Staples" },
  { symbol: "PG", name: "Procter & Gamble Co.", sector: "Consumer Staples" },
  { symbol: "KO", name: "Coca-Cola Co.", sector: "Consumer Staples" },
  { symbol: "PEP", name: "PepsiCo Inc.", sector: "Consumer Staples" },
  { symbol: "PM", name: "Philip Morris International", sector: "Consumer Staples" },
  { symbol: "MDLZ", name: "Mondelez International Inc.", sector: "Consumer Staples" },
  { symbol: "CL", name: "Colgate-Palmolive Co.", sector: "Consumer Staples" },
  { symbol: "TGT", name: "Target Corp.", sector: "Consumer Staples" },
  // Financials
  { symbol: "BRK-B", name: "Berkshire Hathaway Inc. (Class B)", sector: "Financials" },
  { symbol: "MA", name: "Mastercard Inc.", sector: "Financials" },
  { symbol: "BAC", name: "Bank of America Corp.", sector: "Financials" },
  { symbol: "WFC", name: "Wells Fargo & Co.", sector: "Financials" },
  { symbol: "GS", name: "Goldman Sachs Group Inc.", sector: "Financials" },
  { symbol: "MS", name: "Morgan Stanley", sector: "Financials" },
  { symbol: "C", name: "Citigroup Inc.", sector: "Financials" },
  { symbol: "AXP", name: "American Express Co.", sector: "Financials" },
  { symbol: "BLK", name: "BlackRock Inc.", sector: "Financials" },
  { symbol: "SCHW", name: "Charles Schwab Corp.", sector: "Financials" },
  { symbol: "PYPL", name: "PayPal Holdings Inc.", sector: "Financials" },
  // Health care
  { symbol: "UNH", name: "UnitedHealth Group Inc.", sector: "Health Care" },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Health Care" },
  { symbol: "LLY", name: "Eli Lilly and Co.", sector: "Health Care" },
  { symbol: "ABBV", name: "AbbVie Inc.", sector: "Health Care" },
  { symbol: "MRK", name: "Merck & Co. Inc.", sector: "Health Care" },
  { symbol: "PFE", name: "Pfizer Inc.", sector: "Health Care" },
  { symbol: "TMO", name: "Thermo Fisher Scientific Inc.", sector: "Health Care" },
  { symbol: "ABT", name: "Abbott Laboratories", sector: "Health Care" },
  { symbol: "AMGN", name: "Amgen Inc.", sector: "Health Care" },
  { symbol: "ISRG", name: "Intuitive Surgical Inc.", sector: "Health Care" },
  { symbol: "CVS", name: "CVS Health Corp.", sector: "Health Care" },
  // Industrials
  { symbol: "CAT", name: "Caterpillar Inc.", sector: "Industrials" },
  { symbol: "BA", name: "Boeing Co.", sector: "Industrials" },
  { symbol: "GE", name: "GE Aerospace", sector: "Industrials" },
  { symbol: "HON", name: "Honeywell International Inc.", sector: "Industrials" },
  { symbol: "UPS", name: "United Parcel Service Inc.", sector: "Industrials" },
  { symbol: "RTX", name: "RTX Corp.", sector: "Industrials" },
  { symbol: "LMT", name: "Lockheed Martin Corp.", sector: "Industrials" },
  { symbol: "DE", name: "Deere & Co.", sector: "Industrials" },
  { symbol: "UNP", name: "Union Pacific Corp.", sector: "Industrials" },
  { symbol: "DAL", name: "Delta Air Lines Inc.", sector: "Industrials" },
  // Energy, materials, utilities and real estate
  { symbol: "XOM", name: "Exxon Mobil Corp.", sector: "Energy" },
  { symbol: "CVX", name: "Chevron Corp.", sector: "Energy" },
  { symbol: "COP", name: "ConocoPhillips", sector: "Energy" },
  { symbol: "LIN", name: "Linde plc", sector: "Materials" },
  { symbol: "NEM", name: "Newmont Corp.", sector: "Materials" },
  { symbol: "NEE", name: "NextEra Energy Inc.", sector: "Utilities" },
  { symbol: "DUK", name: "Duke Energy Corp.", sector: "Utilities" },
  { symbol: "PLD", name: "Prologis Inc.", sector: "Real Estate" },
  { symbol: "AMT", name: "American Tower Corp.", sector: "Real Estate" },
  { symbol: "O", name: "Realty Income Corp.", sector: "Real Estate" },
];

/** The core stocks first, then the rest, each listed once. */
export const CATALOG: readonly StockListing[] = [...STOCKS, ...MORE_STOCKS];

const BY_SYMBOL = new Map(CATALOG.map((listing) => [listing.symbol, listing]));

/** The catalog entry for a canonical symbol, if there is one. */
export const catalogEntry = (symbol: string): StockListing | undefined => BY_SYMBOL.get(symbol);

/** Catalog stocks that aren't core: the ones without a row in the stocks table. */
export const MORE_LISTINGS = MORE_STOCKS;
