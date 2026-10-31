import type { Metadata } from "next";
import Link from "next/link";
import { CookieSettings } from "@/components/privacy/cookie-settings";

export const metadata: Metadata = { title: "Cookie settings — MarketLab", description: "Every cookie MarketLab uses, and your choice about analytics." };

export default function CookiesPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Cookie settings</h1>
        <p className="mt-2 max-w-3xl text-muted">
          Everything MarketLab keeps in your browser, and the one thing you can choose. More about what we keep on our side is in the{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
      {/* Analytics exist only on Vercel (see the root layout). */}
      <CookieSettings available={!!process.env.VERCEL} />
    </main>
  );
}
