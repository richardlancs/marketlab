"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/** What the confirmation link did, and what to do next. */
export function VerificationResult() {
  const error = useSearchParams().get("error");
  const { data: session } = authClient.useSession();
  const [resent, setResent] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function resend() {
    if (!session) return;
    setResent("sending");
    const { error: failed } = await authClient.sendVerificationEmail({ email: session.user.email, callbackURL: "/email-verified" });
    setResent(failed ? "failed" : "sent");
  }

  if (!error) {
    return (
      <div className="animate-fade-up text-center">
        <p aria-hidden className="mx-auto grid size-12 place-items-center rounded-full bg-gain/15 text-xl text-gain">
          ✓
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Email confirmed</h1>
        <p className="mt-2 text-muted">Thanks: your address is confirmed{session ? `, ${session.user.name}` : ""}.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-accent-fill px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
          Go to the dashboard
        </Link>
      </div>
    );
  }

  const expired = error.toUpperCase().includes("EXPIRED");
  return (
    <div className="animate-fade-up text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{expired ? "That link has expired" : "That link didn’t work"}</h1>
      <p className="mt-2 text-muted">
        {expired ? "Confirmation links work for 24 hours." : "It may have been copied incompletely, or already replaced by a newer one."}{" "}
        {session ? "Send yourself a new one:" : "Sign in, and you can send yourself a new one."}
      </p>
      {session ? (
        <button
          type="button"
          onClick={resend}
          disabled={resent === "sending" || resent === "sent"}
          className="mt-6 rounded-full bg-accent-fill px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {resent === "sending" ? "Sending…" : resent === "sent" ? `Sent to ${session.user.email}` : "Send a new link"}
        </button>
      ) : (
        <Link href="/sign-in" className="mt-6 inline-block rounded-full bg-accent-fill px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
          Sign in
        </Link>
      )}
      {resent === "failed" && <p className="mt-3 text-sm text-loss">Couldn’t send it. Wait a minute and try again.</p>}
    </div>
  );
}
