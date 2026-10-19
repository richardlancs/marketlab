import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = { title: "Sign in — MarketLab" };

export default function SignInPage() {
  return (
    <AuthPage title="Sign in" intro="Your watchlist and portfolio, saved to your account.">
      <AuthForm mode="sign-in" />
    </AuthPage>
  );
}
