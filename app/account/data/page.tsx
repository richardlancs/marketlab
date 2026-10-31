import type { Metadata } from "next";
import { AccountHeader } from "@/components/account/settings/account-header";
import { DataSettings } from "@/components/account/settings/data-settings";

export const metadata: Metadata = { title: "Privacy and your data — MarketLab", robots: { index: false } };

/** Download, erase or delete what MarketLab keeps about you: for accounts and guests alike. */
export default function AccountDataPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <AccountHeader current="/account/data" intro="Download everything MarketLab keeps about you, erase parts of it, or delete your account." />
      <DataSettings />
    </main>
  );
}
