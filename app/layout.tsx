import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AccountNotices } from "@/components/account/account-notices";
import { AccountProvider } from "@/components/account/account-provider";
import { TrendRangeProvider } from "@/components/charts/trend-range";
import { Header } from "@/components/layout/header";
import { TabBar, TabBarWithPath } from "@/components/layout/tab-bar";
import { emailEnabled } from "@/lib/email";
import { getMarket } from "@/lib/market";
import { CATALOG } from "@/lib/market/catalog";
import { marketMode } from "@/lib/market/mode";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * viewportFit "cover" lets pages use the whole screen on phones with a notch
 * (the header and tab bar pad themselves by the safe area). Zooming stays
 * allowed: blocking it fails people who need to enlarge text.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export const metadata: Metadata = {
  // Where shared links' preview images live: the site's own address (BETTER_AUTH_URL is set to it online).
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000"),
  title: "MarketLab",
  description: "Stock analysis and portfolio simulator",
  // The name under the icon when it's added to an iPhone's home screen (app/manifest.ts covers other browsers).
  appleWebApp: { title: "MarketLab" },
};

// Runs synchronously in <head>, before the browser paints anything.
// Saved choice wins; otherwise follow the OS setting. The undertone only
// matters for the pastel theme (see theme-menu.tsx for the options). If this
// script fails (e.g. localStorage is blocked), the server default of "dark" stays.
const themeScript = `(function(){try{var d=document.documentElement,t=localStorage.getItem("theme"),u=localStorage.getItem("undertone");if(t!=="light"&&t!=="dark"&&t!=="pastel"){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}d.setAttribute("data-theme",t);if(u)d.setAttribute("data-undertone",u)}catch(e){}})()`;

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
      // Smooth scrolling (globals.css) is for in-page jumps; this tells Next.js to switch it off while it changes pages.
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* On phones, room at the bottom for the tab bar (3.5rem) and the home bar. */}
      <body className="flex min-h-full flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {/*
         * The first thing Tab reaches. Hidden until focused, it lets keyboard
         * users jump past the header to the page's <main id="main">.
         */}
        <a
          href="#main"
          className="sr-only rounded-full bg-accent-fill px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60]"
        >
          Skip to content
        </a>
        {/* The catalog's names (~100 stocks, a few KB) let search find any of them without an API call. */}
        <TrendRangeProvider>
        <AccountProvider quotes={quotes} listings={CATALOG} openTickers={marketMode() === "tiingo"} asOf={market.asOf}>
          <Header />
          <AccountNotices emailVerification={emailEnabled()} />
          {children}
          <footer className="mx-auto w-full max-w-7xl px-4 pt-4 pb-8 text-xs text-muted sm:px-6 lg:px-8">
            {market.source === "mock"
              ? "Simulated prices, not real market data. Each stock starts from its real price on Oct 16, 2026; every move since (and the history before) is generated."
              : "End-of-day prices from Tiingo, for personal use only."}{" "}
            Nothing here is investment advice.
          </footer>
        </AccountProvider>
        </TrendRangeProvider>
        {/* usePathname needs Suspense (see header.tsx); the fallback is the same bar with no tab highlighted. */}
        <Suspense fallback={<TabBar pathname={null} />}>
          <TabBarWithPath />
        </Suspense>
        {/* Vercel Web Analytics and Speed Insights: cookieless, served from this site (allowed by the CSP). Only on Vercel, where those scripts exist. */}
        {process.env.VERCEL && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  );
}
