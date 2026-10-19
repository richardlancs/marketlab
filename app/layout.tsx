import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AccountNotices } from "@/components/account/account-notices";
import { AccountProvider } from "@/components/account/account-provider";
import { TrendRangeProvider } from "@/components/charts/trend-range";
import { Header } from "@/components/layout/header";
import { getMarket } from "@/lib/market";
import { CATALOG } from "@/lib/market/catalog";
import { marketMode } from "@/lib/market/mode";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MarketLab",
  description: "Stock analysis and portfolio simulator",
};

// Runs synchronously in <head>, before the browser paints anything.
// Saved choice wins; otherwise follow the OS setting. If this script fails
// (e.g. localStorage is blocked), the server default of "dark" stays.
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Today's prices for every stock, for the account features (watchlist,
  // portfolio, trading). Names and prices only, no history, so it stays small.
  const market = await getMarket();
  const quotes = market.stocks.map(({ symbol, name, price, change, changePercent }) => ({
    symbol,
    name,
    price,
    change,
    changePercent,
  }));

  return (
    // suppressHydrationWarning: the script above may change data-theme before
    // React hydrates; this tells React to accept the DOM's value.
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        {/*
         * The first thing Tab reaches. Hidden until focused, it lets keyboard
         * users jump past the header to the page's <main id="main">.
         */}
        <a
          href="#main"
          className="sr-only rounded-full bg-accent px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60]"
        >
          Skip to content
        </a>
        {/* The catalog's names (~100 stocks, a few KB) let search find any of them without an API call. */}
        <TrendRangeProvider>
        <AccountProvider quotes={quotes} listings={CATALOG} openTickers={marketMode() === "tiingo"} asOf={market.asOf}>
          <Header />
          <AccountNotices />
          {children}
          <footer className="mx-auto w-full max-w-7xl px-4 pt-4 pb-8 text-xs text-muted sm:px-6 lg:px-8">
            {market.source === "mock"
              ? "Simulated prices, not real market data. Each stock starts from its real price on Oct 16, 2026; every move since (and the history before) is generated."
              : "End-of-day prices from Tiingo, for personal use only."}{" "}
            Nothing here is investment advice.
          </footer>
        </AccountProvider>
        </TrendRangeProvider>
      </body>
    </html>
  );
}
