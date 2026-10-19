import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = { title: "Create an account — MarketLab" };

export default function SignUpPage() {
  return (
    <AuthPage title="Create an account" intro="Save your watchlist and portfolio and use them on any device.">
      <AuthForm mode="sign-up" />
    </AuthPage>
  );
}
