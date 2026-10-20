import type { Metadata } from "next";
import { Suspense } from "react";
import { VerificationResult } from "@/components/auth/verification-result";

export const metadata: Metadata = { title: "Confirm your email — MarketLab" };

/**
 * Where the link in a verification email leads, once Better Auth has checked
 * it (/api/auth/verify-email). It adds ?error=… if the link was expired or
 * wrong; otherwise the address is confirmed and the user signed in.
 */
export default function EmailVerifiedPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-md flex-1 px-4 py-16 sm:px-6">
      {/* The result is in the address (?error=…), which isn't known while the page is pre-rendered. */}
      <Suspense>
        <VerificationResult />
      </Suspense>
    </main>
  );
}
