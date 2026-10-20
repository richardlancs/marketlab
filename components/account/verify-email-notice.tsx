"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * For signed-in users whose email isn't confirmed yet: a reminder, with a
 * button to send the confirmation link again. Hidden for the rest of the
 * visit once dismissed. Only shown where email can be sent (`enabled`, from
 * the server: lib/email.ts).
 */
export function VerifyEmailNotice({ enabled }: { enabled: boolean }) {
  const { data: session } = authClient.useSession();
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "sending" | "sent" } | { kind: "error"; message: string }>({ kind: "idle" });

  if (!enabled || !session || session.user.emailVerified || dismissed) return null;
  const { email } = session.user;

  async function resend() {
    setStatus({ kind: "sending" });
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/email-verified" });
    setStatus(
      error
        ? { kind: "error", message: error.status === 429 ? "That's a few links already. Wait a minute, then try again." : "Couldn't send the link. Try again in a moment." }
        : { kind: "sent" },
    );
  }

  return (
    <section aria-labelledby="verify-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 text-sm sm:flex-row sm:items-center sm:gap-6">
      <div className="flex-1">
        <h2 id="verify-title" className="font-semibold">
          Confirm your email
        </h2>
        <p className="mt-0.5 text-muted" aria-live="polite">
          {status.kind === "sent"
            ? `Sent. Check ${email} for a link (it works for 24 hours).`
            : status.kind === "error"
              ? status.message
              : `We sent a link to ${email} when you signed up. Confirming it lets MarketLab email you later, for example about price alerts.`}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={resend}
          disabled={status.kind === "sending"}
          className="rounded-full bg-accent px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
        >
          {status.kind === "sending" ? "Sending…" : "Send the link again"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-full px-3 py-2 font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        >
          Later
        </button>
      </div>
    </section>
  );
}
