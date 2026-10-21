import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Not found — MarketLab" };

/**
 * The app-wide 404 page: shown for any unknown URL, when a page calls
 * notFound(), and when proxy.ts rejects an unknown stock symbol. It receives
 * no props, so it can't say exactly what was missing.
 */
export default function NotFound() {
  return (
    <main id="main" className="mx-auto grid w-full max-w-7xl flex-1 place-items-center px-4 py-24 text-center">
      <div className="animate-fade-up">
        <p className="text-sm font-medium text-accent">404</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Not found</h1>
        <p className="mt-2 text-muted">There&apos;s no page or stock symbol here. Check the address, or head back to the dashboard.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-accent-fill px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
