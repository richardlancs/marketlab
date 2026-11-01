import type { Metadata } from "next";
import { ProfileView } from "@/components/profile/profile-view";

export const metadata: Metadata = { title: "Your profile — MarketLab", robots: { index: false } };

/**
 * Your profile: who you are on MarketLab and your key numbers. Private, like
 * the account pages: the page is static, and your data loads in the browser
 * for whoever is signed in (or this browser's guest).
 */
export default function ProfilePage() {
  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your profile</h1>
        <p className="mt-2 text-muted">Your trading, learning and competitions at a glance. Only you can see this page.</p>
      </div>
      <ProfileView />
    </main>
  );
}
