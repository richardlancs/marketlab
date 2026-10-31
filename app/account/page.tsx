import type { Metadata } from "next";
import { AccountHeader } from "@/components/account/settings/account-header";
import { ProfileSettings } from "@/components/account/settings/profile-settings";

export const metadata: Metadata = { title: "Account — MarketLab", robots: { index: false } };

/**
 * Your profile picture, name, email address and password. The page is static;
 * the session is read in the browser (like the account menu) and changes go
 * through the Server Actions in lib/profile-actions.ts.
 */
export default function AccountPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <AccountHeader current="/account" intro="Your profile, email address, password and signed-in devices." />
      <ProfileSettings />
    </main>
  );
}
